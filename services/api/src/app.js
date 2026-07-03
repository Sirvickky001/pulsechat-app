'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function createApp(pool) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', '..', '..', 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/metrics', async (req, res) => {
    try {
      const usersResult = await pool.query('SELECT COUNT(*) FROM users');
      const roomsResult = await pool.query('SELECT COUNT(*) FROM rooms');
      const messagesResult = await pool.query('SELECT COUNT(*) FROM messages');

      res.set('Content-Type', 'text/plain');
      res.send(
        `# HELP pulsechat_users_total Total registered users\n` +
        `# TYPE pulsechat_users_total gauge\n` +
        `pulsechat_users_total ${usersResult.rows[0].count}\n` +
        `# HELP pulsechat_rooms_total Total chat rooms\n` +
        `# TYPE pulsechat_rooms_total gauge\n` +
        `pulsechat_rooms_total ${roomsResult.rows[0].count}\n` +
        `# HELP pulsechat_messages_total Total messages sent\n` +
        `# TYPE pulsechat_messages_total gauge\n` +
        `pulsechat_messages_total ${messagesResult.rows[0].count}\n`
      );
    } catch (e) {
      res.status(500).send('# metrics unavailable\n');
    }
  });

  function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'missing token' });
    }
    try {
      const payload = jwt.verify(header.split(' ')[1], JWT_SECRET);
      req.user = payload;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'invalid token' });
    }
  }

  // POST /api/auth/register
  app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: 'username (3+) and password (6+) required' });
    }
    try {
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'username taken' });
      }
      const hash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
        [username, hash]
      );
      const user = result.rows[0];
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
      res.status(201).json({ token, user });
    } catch (e) {
      res.status(500).json({ error: 'registration failed' });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }
    try {
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'invalid credentials' });
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'invalid credentials' });
      }
      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ token, user: { id: user.id, username: user.username } });
    } catch (e) {
      res.status(500).json({ error: 'login failed' });
    }
  });

  // GET /api/rooms — list all rooms
  app.get('/api/rooms', async (req, res) => {
    try {
      const result = await pool.query('SELECT id, name, created_at FROM rooms ORDER BY created_at');
      res.json(result.rows);
    } catch (e) {
      res.status(500).json({ error: 'failed to fetch rooms' });
    }
  });

  // POST /api/rooms — create a room (auth required)
  app.post('/api/rooms', authMiddleware, async (req, res) => {
    const { name } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'room name required (2+ chars)' });
    }
    try {
      const result = await pool.query(
        'INSERT INTO rooms (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at',
        [name.trim(), req.user.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ error: 'room already exists' });
      }
      res.status(500).json({ error: 'failed to create room' });
    }
  });

  // GET /api/rooms/:id/messages — message history
  app.get('/api/rooms/:id/messages', async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    try {
      const result = await pool.query(
        'SELECT id, user_id, username, content, created_at FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2',
        [roomId, limit]
      );
      res.json(result.rows.reverse());
    } catch (e) {
      res.status(500).json({ error: 'failed to fetch messages' });
    }
  });

  // POST /api/rooms/:id/messages — persist a message (called by ws-gateway)
  app.post('/api/rooms/:id/messages', authMiddleware, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    const { content } = req.body;
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'content required' });
    }
    try {
      const result = await pool.query(
        'INSERT INTO messages (room_id, user_id, username, content) VALUES ($1, $2, $3, $4) RETURNING id, user_id, username, content, created_at',
        [roomId, req.user.id, req.user.username, content.trim()]
      );
      res.status(201).json(result.rows[0]);
    } catch (e) {
      res.status(500).json({ error: 'failed to save message' });
    }
  });

  return app;
}

module.exports = { createApp, JWT_SECRET };

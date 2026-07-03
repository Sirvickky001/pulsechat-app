'use strict';

const express = require('express');

function createApp(store) {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/metrics', (req, res) => {
    const online = store.getOnlineUsers();
    res.set('Content-Type', 'text/plain');
    res.send(
      `# HELP pulsechat_users_online Currently online users\n` +
      `# TYPE pulsechat_users_online gauge\n` +
      `pulsechat_users_online ${online.length}\n`
    );
  });

  // GET /presence — list all online users
  app.get('/presence', (req, res) => {
    res.json(store.getOnlineUsers());
  });

  // GET /presence/:userId — check if a specific user is online
  app.get('/presence/:userId', (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    res.json({ userId, online: store.isOnline(userId) });
  });

  return app;
}

module.exports = { createApp };

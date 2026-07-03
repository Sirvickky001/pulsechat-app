'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp, JWT_SECRET } = require('./app');

function mockPool(overrides = {}) {
  return {
    query: jest.fn(overrides.query || (() => Promise.resolve({ rows: [] }))),
  };
}

describe('Health + Metrics', () => {
  test('GET /health returns ok', async () => {
    const app = createApp(mockPool());
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /metrics returns prometheus format', async () => {
    const pool = mockPool({
      query: (sql) => Promise.resolve({ rows: [{ count: '3' }] }),
    });
    const app = createApp(pool);
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('pulsechat_users_total');
  });
});

describe('POST /api/auth/register', () => {
  test('registers a new user', async () => {
    const calls = [];
    const pool = mockPool({
      query: (sql, params) => {
        calls.push(sql);
        if (sql.includes('SELECT id FROM users')) return Promise.resolve({ rows: [] });
        if (sql.includes('INSERT INTO users')) {
          return Promise.resolve({ rows: [{ id: 1, username: params[0] }] });
        }
        return Promise.resolve({ rows: [] });
      },
    });
    const app = createApp(pool);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'victor', password: 'secret123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('victor');
  });

  test('rejects short username', async () => {
    const app = createApp(mockPool());
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ab', password: 'secret123' });
    expect(res.status).toBe(400);
  });

  test('rejects duplicate username', async () => {
    const pool = mockPool({
      query: (sql) => {
        if (sql.includes('SELECT id FROM users')) {
          return Promise.resolve({ rows: [{ id: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      },
    });
    const app = createApp(pool);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'taken', password: 'secret123' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  test('rejects missing fields', async () => {
    const app = createApp(mockPool());
    const res = await request(app).post('/api/auth/login').send({ username: 'x' });
    expect(res.status).toBe(400);
  });

  test('rejects unknown user', async () => {
    const pool = mockPool({ query: () => Promise.resolve({ rows: [] }) });
    const app = createApp(pool);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'whatever' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/rooms', () => {
  test('returns list of rooms', async () => {
    const pool = mockPool({
      query: () => Promise.resolve({ rows: [{ id: 1, name: 'general', created_at: new Date() }] }),
    });
    const app = createApp(pool);
    const res = await request(app).get('/api/rooms');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('general');
  });
});

describe('POST /api/rooms', () => {
  test('rejects without auth token', async () => {
    const app = createApp(mockPool());
    const res = await request(app).post('/api/rooms').send({ name: 'dev-team' });
    expect(res.status).toBe(401);
  });

  test('creates room with valid token', async () => {
    const pool = mockPool({
      query: () => Promise.resolve({ rows: [{ id: 2, name: 'dev-team', created_at: new Date() }] }),
    });
    const app = createApp(pool);
    const token = jwt.sign({ id: 1, username: 'victor' }, JWT_SECRET);
    const res = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'dev-team' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('dev-team');
  });
});

describe('GET /api/rooms/:id/messages', () => {
  test('returns message history', async () => {
    const pool = mockPool({
      query: () => Promise.resolve({
        rows: [{ id: 1, user_id: 1, username: 'victor', content: 'hello', created_at: new Date() }],
      }),
    });
    const app = createApp(pool);
    const res = await request(app).get('/api/rooms/1/messages');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

describe('POST /api/rooms/:id/messages', () => {
  test('rejects without auth', async () => {
    const app = createApp(mockPool());
    const res = await request(app).post('/api/rooms/1/messages').send({ content: 'hi' });
    expect(res.status).toBe(401);
  });

  test('saves message with valid token', async () => {
    const pool = mockPool({
      query: () => Promise.resolve({
        rows: [{ id: 5, user_id: 1, username: 'victor', content: 'hello room', created_at: new Date() }],
      }),
    });
    const app = createApp(pool);
    const token = jwt.sign({ id: 1, username: 'victor' }, JWT_SECRET);
    const res = await request(app)
      .post('/api/rooms/1/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'hello room' });
    expect(res.status).toBe(201);
    expect(res.body.content).toBe('hello room');
  });
});

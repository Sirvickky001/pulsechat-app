'use strict';

const request = require('supertest');
const { PresenceStore } = require('./store');
const { createApp } = require('./app');

describe('PresenceStore', () => {
  test('marks a user online', () => {
    const store = new PresenceStore();
    store.markOnline(1, 'victor');
    expect(store.isOnline(1)).toBe(true);
  });

  test('marks a user offline', () => {
    const store = new PresenceStore();
    store.markOnline(1, 'victor');
    store.markOffline(1);
    expect(store.isOnline(1)).toBe(false);
  });

  test('user not seen is offline', () => {
    const store = new PresenceStore();
    expect(store.isOnline(999)).toBe(false);
  });

  test('user goes offline after TTL expires', () => {
    let mockTime = 0;
    const store = new PresenceStore(() => mockTime);
    store.markOnline(1, 'victor');
    expect(store.isOnline(1)).toBe(true);
    mockTime += 31_000; // advance past 30s TTL
    expect(store.isOnline(1)).toBe(false);
  });

  test('getOnlineUsers returns only fresh entries', () => {
    let mockTime = 0;
    const store = new PresenceStore(() => mockTime);
    store.markOnline(1, 'victor');
    mockTime += 5_000;
    store.markOnline(2, 'alice');
    const online = store.getOnlineUsers();
    expect(online.length).toBe(2);
    expect(online.map(u => u.username)).toEqual(['victor', 'alice']);
  });

  test('sweepStale removes expired entries', () => {
    let mockTime = 0;
    const store = new PresenceStore(() => mockTime);
    store.markOnline(1, 'victor');
    mockTime += 31_000;
    store.sweepStale();
    expect(store.users.has(1)).toBe(false);
  });
});

describe('HTTP app', () => {
  test('GET /health returns ok', async () => {
    const store = new PresenceStore();
    const app = createApp(store);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test('GET /metrics reflects online count', async () => {
    const store = new PresenceStore();
    store.markOnline(1, 'victor');
    const app = createApp(store);
    const res = await request(app).get('/metrics');
    expect(res.text).toContain('pulsechat_users_online 1');
  });

  test('GET /presence lists online users', async () => {
    const store = new PresenceStore();
    store.markOnline(1, 'victor');
    const app = createApp(store);
    const res = await request(app).get('/presence');
    expect(res.status).toBe(200);
    expect(res.body[0].username).toBe('victor');
  });

  test('GET /presence/:userId returns online status', async () => {
    const store = new PresenceStore();
    store.markOnline(7, 'alice');
    const app = createApp(store);
    const res = await request(app).get('/presence/7');
    expect(res.body.online).toBe(true);
  });
});

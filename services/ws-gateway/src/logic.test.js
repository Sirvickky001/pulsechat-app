'use strict';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { verifyToken, parseIncoming, roomChannel, buildBroadcast, JWT_SECRET } = require('./logic');
const { createApp } = require('./app');

describe('verifyToken', () => {
  test('returns payload for valid token', () => {
    const token = jwt.sign({ id: 1, username: 'victor' }, JWT_SECRET);
    const result = verifyToken(token);
    expect(result.username).toBe('victor');
  });

  test('returns null for invalid token', () => {
    expect(verifyToken('not-a-real-token')).toBeNull();
  });

  test('returns null for missing token', () => {
    expect(verifyToken(null)).toBeNull();
  });
});

describe('parseIncoming', () => {
  test('parses a valid message frame', () => {
    const result = parseIncoming(JSON.stringify({ type: 'message', roomId: 1, content: 'hello' }));
    expect(result.error).toBeUndefined();
    expect(result.roomId).toBe(1);
    expect(result.content).toBe('hello');
  });

  test('rejects invalid JSON', () => {
    const result = parseIncoming('{not json');
    expect(result.error).toBe('invalid JSON');
  });

  test('rejects unsupported type', () => {
    const result = parseIncoming(JSON.stringify({ type: 'ping' }));
    expect(result.error).toBe('unsupported message type');
  });

  test('rejects missing roomId', () => {
    const result = parseIncoming(JSON.stringify({ type: 'message', content: 'hi' }));
    expect(result.error).toBe('roomId required');
  });

  test('rejects empty content', () => {
    const result = parseIncoming(JSON.stringify({ type: 'message', roomId: 1, content: '   ' }));
    expect(result.error).toBe('content required');
  });

  test('trims and truncates content', () => {
    const longContent = 'a'.repeat(3000);
    const result = parseIncoming(JSON.stringify({ type: 'message', roomId: 1, content: `  ${longContent}  ` }));
    expect(result.content.length).toBe(2000);
  });
});

describe('roomChannel', () => {
  test('builds correct channel name', () => {
    expect(roomChannel(5)).toBe('pulsechat:room:5');
  });
});

describe('buildBroadcast', () => {
  test('builds broadcast payload from a saved message', () => {
    const msg = { id: 1, room_id: 2, user_id: 3, username: 'victor', content: 'hi', created_at: '2026-01-01' };
    const result = JSON.parse(buildBroadcast(msg));
    expect(result.type).toBe('message');
    expect(result.roomId).toBe(2);
    expect(result.username).toBe('victor');
  });
});

describe('HTTP app', () => {
  test('GET /health returns ok', async () => {
    const app = createApp(() => ({ activeConnections: 0, messagesRelayed: 0 }));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /metrics returns prometheus format with live stats', async () => {
    const app = createApp(() => ({ activeConnections: 4, messagesRelayed: 12 }));
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('pulsechat_ws_connections_active 4');
    expect(res.text).toContain('pulsechat_ws_messages_relayed_total 12');
  });
});

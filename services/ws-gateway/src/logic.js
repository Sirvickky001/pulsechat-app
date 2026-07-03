'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Verifies a JWT token used to authenticate a WebSocket connection.
 * Kept separate from the socket handling so it's unit-testable.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

/**
 * Parses an incoming WebSocket message frame.
 * Expected shape: { type: 'message', roomId: number, content: string }
 */
function parseIncoming(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { error: 'invalid JSON' };
  }
  if (data.type !== 'message') {
    return { error: 'unsupported message type' };
  }
  if (!data.roomId || typeof data.roomId !== 'number') {
    return { error: 'roomId required' };
  }
  if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
    return { error: 'content required' };
  }
  return {
    type: 'message',
    roomId: data.roomId,
    content: data.content.trim().slice(0, 2000),
  };
}

/**
 * Builds the Redis pub-sub channel name for a given room.
 */
function roomChannel(roomId) {
  return `pulsechat:room:${roomId}`;
}

/**
 * Builds the outgoing broadcast payload for a saved message.
 */
function buildBroadcast(message) {
  return JSON.stringify({
    type: 'message',
    id: message.id,
    roomId: message.room_id || message.roomId,
    userId: message.user_id || message.userId,
    username: message.username,
    content: message.content,
    createdAt: message.created_at || message.createdAt || new Date().toISOString(),
  });
}

module.exports = { verifyToken, parseIncoming, roomChannel, buildBroadcast, JWT_SECRET };

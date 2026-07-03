'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { createClient } = require('redis');
const { createApp } = require('./app');
const { verifyToken, parseIncoming, roomChannel, buildBroadcast } = require('./logic');

const PORT = process.env.PORT || 4001;
const API_URL = process.env.API_URL || 'http://pulsechat-api:4000';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const stats = { activeConnections: 0, messagesRelayed: 0 };
const httpApp = createApp(() => stats);
const server = http.createServer(httpApp);
const wss = new WebSocketServer({ server, path: '/ws' });

const publisher = createClient({ url: REDIS_URL });
const subscriber = createClient({ url: REDIS_URL });

// roomId -> Set of sockets currently subscribed to that room
const roomSockets = new Map();

async function start() {
  await publisher.connect();
  await subscriber.connect();

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const user = verifyToken(token);

    if (!user) {
      socket.close(4001, 'unauthorized');
      return;
    }

    stats.activeConnections++;
    socket.user = user;
    socket.subscribedRooms = new Set();

    socket.on('message', async (raw) => {
      const parsed = parseIncoming(raw.toString());
      if (parsed.error) {
        socket.send(JSON.stringify({ type: 'error', error: parsed.error }));
        return;
      }

      // Subscribe this socket to the room channel if not already
      if (!socket.subscribedRooms.has(parsed.roomId)) {
        socket.subscribedRooms.add(parsed.roomId);
        if (!roomSockets.has(parsed.roomId)) {
          roomSockets.set(parsed.roomId, new Set());
          await subscriber.subscribe(roomChannel(parsed.roomId), (message) => {
            for (const sub of roomSockets.get(parsed.roomId) || []) {
              if (sub.readyState === sub.OPEN) sub.send(message);
            }
          });
        }
        roomSockets.get(parsed.roomId).add(socket);
      }

      try {
        // Persist via the API, then broadcast via Redis
        const res = await fetch(`${API_URL}/api/rooms/${parsed.roomId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: parsed.content }),
        });
        const saved = await res.json();
        if (res.ok) {
          await publisher.publish(roomChannel(parsed.roomId), buildBroadcast(saved));
          stats.messagesRelayed++;
        } else {
          socket.send(JSON.stringify({ type: 'error', error: saved.error || 'failed to save' }));
        }
      } catch (e) {
        socket.send(JSON.stringify({ type: 'error', error: 'internal error' }));
      }
    });

    socket.on('close', () => {
      stats.activeConnections--;
      for (const roomId of socket.subscribedRooms) {
        roomSockets.get(roomId)?.delete(socket);
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`PulseChat ws-gateway running on port ${PORT}`);
  });
}

start().catch((e) => {
  console.error('Failed to start ws-gateway:', e);
  process.exit(1);
});

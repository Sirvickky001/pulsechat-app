'use strict';

const express = require('express');

function createApp(getStats) {
  const app = express();

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/metrics', (req, res) => {
    const stats = getStats();
    res.set('Content-Type', 'text/plain');
    res.send(
      `# HELP pulsechat_ws_connections_active Active WebSocket connections\n` +
      `# TYPE pulsechat_ws_connections_active gauge\n` +
      `pulsechat_ws_connections_active ${stats.activeConnections}\n` +
      `# HELP pulsechat_ws_messages_relayed_total Messages relayed since start\n` +
      `# TYPE pulsechat_ws_messages_relayed_total counter\n` +
      `pulsechat_ws_messages_relayed_total ${stats.messagesRelayed}\n`
    );
  });

  return app;
}

module.exports = { createApp };

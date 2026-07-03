'use strict';

const { createClient } = require('redis');
const { createApp } = require('./app');
const { PresenceStore } = require('./store');

const PORT = process.env.PORT || 4002;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const store = new PresenceStore();
const app = createApp(store);

async function start() {
  const subscriber = createClient({ url: REDIS_URL });
  await subscriber.connect();

  await subscriber.subscribe('pulsechat:presence:connect', (message) => {
    const { userId, username } = JSON.parse(message);
    store.markOnline(userId, username);
  });

  await subscriber.subscribe('pulsechat:presence:disconnect', (message) => {
    const { userId } = JSON.parse(message);
    store.markOffline(userId);
  });

  // Sweep stale entries every 10 seconds in case a disconnect event is missed
  setInterval(() => store.sweepStale(), 10_000);

  app.listen(PORT, () => {
    console.log(`PulseChat presence service running on port ${PORT}`);
  });
}

start().catch((e) => {
  console.error('Failed to start presence service:', e);
  process.exit(1);
});

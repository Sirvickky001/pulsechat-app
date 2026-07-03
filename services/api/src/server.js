'use strict';

const pool = require('./db');
const { createApp } = require('./app');

const PORT = process.env.PORT || 4000;
const app = createApp(pool);

app.listen(PORT, () => {
  console.log(`PulseChat API running on port ${PORT}`);
});

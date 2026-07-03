'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'pulsechat',
  password: process.env.PGPASSWORD || 'pulsechat',
  database: process.env.PGDATABASE || 'pulsechat',
});

module.exports = pool;

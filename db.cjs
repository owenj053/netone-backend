require('dotenv').config();
const { Pool } = require('pg');
const logger = require('./utils/logger.cjs');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error(`PostgreSQL connection error: ${err.message}`);
});

module.exports = pool;
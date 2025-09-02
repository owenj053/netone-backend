require('dotenv').config();
const { Pool } = require('pg');
const logger = require('./utils/logger.cjs');

// This object will hold our database configuration.
const config = {};

// Check if we are in a production environment (like Render).
// Render automatically sets a DATABASE_URL environment variable.
if (process.env.DATABASE_URL) {
  // If we are in production, use the single connection string and enable SSL.
  config.connectionString = process.env.DATABASE_URL;
  config.ssl = {
    rejectUnauthorized: false
  };
} else {
  // If we are in local development, use the individual variables from our .env file.
  config.user = process.env.DB_USER;
  config.host = process.env.DB_HOST;
  config.database = process.env.DB_DATABASE;
  config.password = process.env.DB_PASSWORD;
  config.port = process.env.DB_PORT;
}

const pool = new Pool(config);

pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error(`PostgreSQL connection error: ${err.message}`);
});

module.exports = pool;
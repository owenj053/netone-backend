const pool = ('./db.cjs');
const logger = ('./utils/logger.cjs');

const setupDatabase = async () => {
  const client = await pool.connect();
  try {
    logger.info('Starting database setup...');

    await client.query('DROP TABLE IF EXISTS permits, activity_logs, tickets, assets, users, audit_logs CASCADE');
    logger.info('Dropped existing tables.');

    await client.query(`
      CREATE TABLE users (
        user_id SERIAL PRIMARY KEY,
        engineer_id VARCHAR(50) UNIQUE NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    logger.info('Table "users" created.');

    await client.query(`
      CREATE TABLE assets (
        asset_id SERIAL PRIMARY KEY,
        asset_name VARCHAR(150) NOT NULL,
        asset_type VARCHAR(50) NOT NULL,
        qr_code_id VARCHAR(100) UNIQUE,
        parent_asset_id INTEGER REFERENCES assets(asset_id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    logger.info('Table "assets" created.');

    await client.query(`
      CREATE TABLE tickets (
        ticket_id SERIAL PRIMARY KEY,
        asset_id INTEGER REFERENCES assets(asset_id) NOT NULL,
        assigned_to_id INTEGER REFERENCES users(user_id),
        created_by_id INTEGER REFERENCES users(user_id) NOT NULL,
        status VARCHAR(30) NOT NULL,
        urgency VARCHAR(20) NOT NULL,
        description TEXT NOT NULL,
        root_cause VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        resolved_at TIMESTAMP
      );
    `);
    logger.info('Table "tickets" created.');

    await client.query(`
      CREATE TABLE activity_logs (
        log_id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(ticket_id) NOT NULL,
        user_id INTEGER REFERENCES users(user_id) NOT NULL,
        log_entry TEXT NOT NULL,
        parts_used TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    logger.info('Table "activity_logs" created.');

    await client.query(`
      CREATE TABLE permits (
        permit_id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES tickets(ticket_id) UNIQUE NOT NULL,
        permit_type VARCHAR(50) NOT NULL,
        issued_by_id INTEGER REFERENCES users(user_id) NOT NULL,
        acknowledged_by_id INTEGER REFERENCES users(user_id),
        status VARCHAR(20) NOT NULL,
        safety_checklist JSONB,
        issued_at TIMESTAMP DEFAULT NOW(),
        acknowledged_at TIMESTAMP
      );
    `);
    logger.info('Table "permits" created.');

      await client.query(`
        CREATE TABLE audit_logs (
          log_id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(user_id),
          action VARCHAR(100) NOT NULL,
          entity_type VARCHAR(50),
          entity_id INTEGER,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log('Table "audit_logs" created.');

    logger.info('Database setup completed successfully!');
  } catch (err) {
    logger.error(`Error during database setup: ${err.message}`);
  } finally {
    client.release();
    pool.end();
  }
};

setupDatabase();
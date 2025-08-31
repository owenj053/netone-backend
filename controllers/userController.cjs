const pool = require('../db.cjs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger.cjs');
const { logAudit } = require('../utils/auditLogger.cjs');

const registerUser = async (req, res) => {
  const { engineer_id, full_name, password, role } = req.body;
  const requestId = req.requestId;

  logger.info(`[${requestId}] Register attempt for engineer_id: ${engineer_id}`);

  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const queryText = `
      INSERT INTO users (engineer_id, full_name, password_hash, role) 
      VALUES ($1, $2, $3, $4) 
      RETURNING user_id
    `;

    const { rows } = await pool.query(queryText, [
      engineer_id,
      full_name,
      password_hash,
      role,
    ]);

    logger.info(`[${requestId}] User registered: ${engineer_id} (ID: ${rows[0].user_id})`);

    await logAudit({
      userId: rows[0].user_id,
      action: 'REGISTER_USER',
      entityType: 'user',
      entityId: rows[0].user_id,
      metadata: { engineer_id, role },
    });

    res.status(201).json({ message: 'User created successfully', userId: rows[0].user_id });
  } catch (err) {
    logger.error(`[${requestId}] Registration error: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const getUsersByRole = async (req, res) => {
  // The role comes from the URL query string, e.g., /api/users?role=engineer
  const role = req.query.role?.toLowerCase();
  const requestId = req.requestId;

  logger.info(`[${requestId}] Fetching users with role: ${role}`);

  // Add a check to ensure a role was provided
  if (!role) {
    return res.status(400).json({ message: 'Role query parameter is required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT user_id, engineer_id, full_name, role FROM users WHERE LOWER(role) = $1',
      [role]
    );

    res.json(rows);
  } catch (err) {
    logger.error(`[${requestId}] Error fetching users: ${err.message}`);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};


const loginUser = async (req, res) => {
  const { engineer_id, password } = req.body;
  const requestId = req.requestId;

  logger.info(`[${requestId}] Login attempt for engineer_id: ${engineer_id}`);

  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE engineer_id = $1',
      [engineer_id]
    );

    if (rows.length === 0) {
      logger.warn(`[${requestId}] Login failed: user not found`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      logger.warn(`[${requestId}] Login failed: incorrect password`);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const payload = {
      user: {
        id: user.user_id,
        role: user.role,
      },
    };

    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' }, async (err, token) => {
      if (err) {
        logger.error(`[${requestId}] JWT error: ${err.message}`);
        return res.status(500).json({ message: 'Token generation failed' });
      }

      logger.info(`[${requestId}] Login successful for engineer_id: ${engineer_id}`);

      await logAudit({
        userId: user.user_id,
        action: 'LOGIN_USER',
        entityType: 'user',
        entityId: user.user_id,
        metadata: { engineer_id },
      });

      res.json({ 
        token, 
        role: user.role 
      });

    });
  } catch (err) {
    logger.error(`[${requestId}] Login error: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};


module.exports = {
  registerUser,
  getUsersByRole,
  loginUser
};
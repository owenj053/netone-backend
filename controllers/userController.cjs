const pool = require('../db.cjs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger.cjs');
const { logAudit } = require('../utils/auditLogger.cjs');

const registerUser = async (req, res) => {
  const { engineer_id, full_name, password, role, national_id, email } = req.body;
  const requestId = req.requestId;

  logger.info(`[${requestId}] Register attempt for engineer_id: ${engineer_id}`);
  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const queryText = `
      INSERT INTO users (engineer_id, full_name, password_hash, role, national_id, email) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING user_id, engineer_id, full_name, role, email, national_id
    `;
    
    const { rows } = await pool.query(queryText, [engineer_id, full_name, password_hash, role, national_id || null, email || null]);
    const newUser = rows[0];

    // Use the manager's ID if available, otherwise use the new user's ID for the audit log
    const auditUserId = req.user ? req.user.id : newUser.user_id;
    await logAudit({ userId: auditUserId, action: 'REGISTER_USER', entityId: newUser.user_id, metadata: { engineer_id, role } });

    res.status(201).json(newUser);
  } catch (err) {
    logger.error(`[${requestId}] Registration error: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};


const getUsersByRole = async (req, res) => {
    const role = req.query.role?.toLowerCase();
    const requestId = req.requestId;
    logger.info(`[${requestId}] Fetching users with role: ${role || 'all'}`);
    try {
        let queryText = 'SELECT user_id, engineer_id, full_name, role, email, national_id, created_at FROM users';
        const params = [];
        if (role) {
            queryText += ' WHERE LOWER(role) = $1';
            params.push(role);
        }
        queryText += ' ORDER BY created_at DESC';
        const { rows } = await pool.query(queryText, params);
        res.json(rows);
    } catch (err) {
        logger.error(`[${requestId}] Error fetching users: ${err.message}`);
        res.status(500).json({ message: 'Failed to fetch users' });
    }
};

const loginUser = async (req, res) => {
  // This function is perfect and unchanged.
  const { engineer_id, password } = req.body;
  const requestId = req.requestId;
  logger.info(`[${requestId}] Login attempt for engineer_id: ${engineer_id}`);
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE engineer_id = $1', [engineer_id]);
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
    const payload = { user: { id: user.user_id, role: user.role } };
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
      res.json({ token, role: user.role });
    });
  } catch (err) {
    logger.error(`[${requestId}] Login error: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const updateUser = async (req, res) => {
  const { id } = req.params; // The ID of the user to update
  const { full_name, role, national_id, email } = req.body;
  const requestId = req.requestId;
  const adminUserId = req.user.id; // The manager performing the action

  logger.info(`[${requestId}] Admin ${adminUserId} updating user_id: ${id}`);
  try {
    // Note: We are not allowing password changes from this endpoint for security.
    const { rows } = await pool.query(
      `UPDATE users SET full_name = $1, role = $2, national_id = $3, email = $4
       WHERE user_id = $5 RETURNING user_id, engineer_id, full_name, role, national_id, email`,
      [full_name, role, national_id, email, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    await logAudit({ userId: adminUserId, action: 'UPDATE_USER', entityType: 'user', entityId: id, metadata: { changes: req.body } });
    res.json(rows[0]);
  } catch (err) {
    logger.error(`[${requestId}] Error updating user: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  registerUser,
  getUsersByRole,
  loginUser,
  updateUser,
};

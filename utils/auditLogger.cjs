const pool = require('../db.cjs');
const logger = require('./logger.cjs'); 

const logAudit = async ({ userId, action, entityType, entityId, metadata = {} }) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, entityType, entityId, metadata]
    );

    logger.info(`Audit log: ${action} by user ${userId} on ${entityType} ${entityId}`);
  } catch (err) {
    logger.error(`Failed to write audit log: ${err.message}`);
  }
};

module.exports = {
  logAudit
};
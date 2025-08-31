const pool = require('../db.cjs');
const logger = require('../utils/logger.cjs');
const { logAudit } = require('../utils/auditLogger.cjs');

const issuePermit = async (req, res) => {
  const { permit_type, safety_checklist } = req.body;
  const { ticket_id } = req.params;
  const issued_by_id = req.user.id;
  const requestId = req.requestId;

  logger.info(`[${requestId}] Issuing permit for ticket_id: ${ticket_id} by user_id: ${issued_by_id}`);

  try {
    const queryText = `
      INSERT INTO permits 
        (ticket_id, permit_type, issued_by_id, status, safety_checklist) 
      VALUES ($1, $2, $3, 'Issued', $4) 
      RETURNING *
    `;

    const { rows } = await pool.query(queryText, [
      ticket_id,
      permit_type,
      issued_by_id,
      safety_checklist,
    ]);

    const permit = rows[0];

    logger.info(`[${requestId}] Permit issued: ${permit.permit_id}`);

    await logAudit({
      userId: issued_by_id,
      action: 'ISSUE_PERMIT',
      entityType: 'permit',
      entityId: permit.permit_id,
      metadata: { ticket_id, permit_type },
    });

    res.status(201).json(permit);
  } catch (err) {
    logger.error(`[${requestId}] Error issuing permit: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const acknowledgePermit = async (req, res) => {
  const { permit_id } = req.params;
  const acknowledged_by_id = req.user.id;
  const requestId = req.requestId;

  logger.info(`[${requestId}] Acknowledging permit_id: ${permit_id} by user_id: ${acknowledged_by_id}`);

  try {
    const queryText = `
      UPDATE permits 
      SET status = 'Acknowledged', 
          acknowledged_by_id = $1, 
          acknowledged_at = NOW() 
      WHERE permit_id = $2 
      RETURNING *
    `;

    const { rows } = await pool.query(queryText, [
      acknowledged_by_id,
      permit_id,
    ]);

    if (rows.length === 0) {
      logger.warn(`[${requestId}] Permit not found: ${permit_id}`);
      return res.status(404).json({ message: 'Permit not found' });
    }

    const permit = rows[0];

    logger.info(`[${requestId}] Permit acknowledged: ${permit_id}`);

    await logAudit({
      userId: acknowledged_by_id,
      action: 'ACKNOWLEDGE_PERMIT',
      entityType: 'permit',
      entityId: permit_id,
      metadata: { status: 'Acknowledged' },
    });

    res.json(permit);
  } catch (err) {
    logger.error(`[${requestId}] Error acknowledging permit: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  issuePermit,
  acknowledgePermit
};
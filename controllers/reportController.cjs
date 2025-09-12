const pool = require('../db.cjs');
const logger = require('../utils/logger.cjs');

// This function calculates team-wide summary statistics.
const getTeamSummary = async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] Fetching team summary report`);
  try {
    const summaryQuery = `
      SELECT
        (SELECT COUNT(*) FROM tickets WHERE status ILIKE 'Open') AS open_tickets,
        (SELECT COUNT(*) FROM tickets WHERE status ILIKE 'Resolved' OR status ILIKE 'Closed') AS resolved_tickets,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) AS avg_resolution_seconds
      FROM tickets
      WHERE resolved_at IS NOT NULL;
    `;
    const { rows } = await pool.query(summaryQuery);
    res.json(rows[0] || { open_tickets: 0, resolved_tickets: 0, avg_resolution_seconds: null });
  } catch (err) {
    logger.error(`[${requestId}] Error fetching team summary: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const getUserReport = async (req, res) => {
  const { userId } = req.params;
  const requestId = req.requestId;
  logger.info(`[${requestId}] Fetching report for user_id: ${userId}`);
  try {
    const userReportQuery = `
      SELECT
        u.full_name, u.engineer_id,
        (SELECT COUNT(*) FROM tickets WHERE created_by_id = $1) AS tickets_created,
        (SELECT COUNT(*) FROM tickets WHERE assigned_to_id = $1 AND status ILIKE 'Resolved' OR status ILIKE 'Closed') AS tickets_resolved,
        AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at))) AS user_avg_resolution_seconds
      FROM users u
      LEFT JOIN tickets t ON u.user_id = t.assigned_to_id
      WHERE u.user_id = $1
      GROUP BY u.user_id;
    `;
    const { rows } = await pool.query(userReportQuery, [userId]);
    
    // THIS IS THE FIX: If no user report is found, return a default object to prevent frontend crashes.
    if (rows.length === 0) {
      const userRes = await pool.query('SELECT full_name, engineer_id FROM users WHERE user_id = $1', [userId]);
      const userName = userRes.rows.length > 0 ? userRes.rows[0].full_name : 'User Not Found';
      const engineerId = userRes.rows.length > 0 ? userRes.rows[0].engineer_id : 'N/A';
      return res.json({ full_name: userName, engineer_id: engineerId, tickets_created: 0, tickets_resolved: 0 });
    }
    res.json(rows[0]);
  } catch (err) {
    logger.error(`[${requestId}] Error fetching user report: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getTeamSummary,
  getUserReport,
};

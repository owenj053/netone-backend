const pool = require('../db.cjs');
const logger = require('../utils/logger.cjs');

// This function calculates team-wide summary statistics.
const getTeamSummary = async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] Fetching team summary report`);

  try {
    const summaryQuery = `
      SELECT
        (SELECT COUNT(*) FROM tickets WHERE status = 'Open') AS open_tickets,
        (SELECT COUNT(*) FROM tickets WHERE status = 'Resolved') AS resolved_tickets,
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

// This function gets detailed statistics for a single user.
const getUserReport = async (req, res) => {
  const { userId } = req.params;
  const requestId = req.requestId;
  logger.info(`[${requestId}] Fetching report for user_id: ${userId}`);

  try {
    const userReportQuery = `
      SELECT
        (SELECT COUNT(*) FROM tickets WHERE created_by_id = $1) AS tickets_created,
        (SELECT COUNT(*) FROM tickets WHERE assigned_to_id = $1 AND status = 'Resolved') AS tickets_resolved,
        AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at))) AS user_avg_resolution_seconds
      FROM tickets t
      WHERE t.assigned_to_id = $1 AND t.resolved_at IS NOT NULL;
    `;
    const { rows } = await pool.query(userReportQuery, [userId]);
    res.json(rows[0] || { tickets_created: 0, tickets_resolved: 0, user_avg_resolution_seconds: null });
  } catch (err) {
    logger.error(`[${requestId}] Error fetching user report: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getTeamSummary,
  getUserReport,
};

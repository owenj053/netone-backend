const pool = require('../db.cjs');
const logger = require('../utils/logger.cjs');

const getAllAssets = async (req, res) => {
  const requestId = req.requestId;

  logger.info(`[${requestId}] Fetching all assets`);

  try {
    const queryText = `
      SELECT * 
      FROM assets 
      ORDER BY parent_asset_id, asset_name
    `;

    const { rows } = await pool.query(queryText);

    logger.info(`[${requestId}] Retrieved ${rows.length} assets`);
    res.json(rows);
  } catch (err) {
    logger.error(`[${requestId}] Error fetching assets: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
    getAllAssets
};
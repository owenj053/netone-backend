const pool = require('../db.cjs');
const logger = require('../utils/logger.cjs');
const { logAudit } = require('../utils/auditLogger.cjs');

// This function already exists and is perfect.
const getAllAssets = async (req, res) => {
  // ... existing code
};

// --- NEW FUNCTIONS TO ADD ---

const createAsset = async (req, res) => {
  const { asset_name, asset_type, qr_code_id, parent_asset_id } = req.body;
  const requestId = req.requestId;
  const userId = req.user.id;

  logger.info(`[${requestId}] User ${userId} creating asset: ${asset_name}`);
  try {
    const { rows } = await pool.query(
      `INSERT INTO assets (asset_name, asset_type, qr_code_id, parent_asset_id) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [asset_name, asset_type, qr_code_id, parent_asset_id || null]
    );
    const newAsset = rows[0];
    await logAudit({ userId, action: 'CREATE_ASSET', entityType: 'asset', entityId: newAsset.asset_id });
    res.status(201).json(newAsset);
  } catch (err) {
    logger.error(`[${requestId}] Error creating asset: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const updateAsset = async (req, res) => {
    const { id } = req.params;
    const { asset_name, asset_type, qr_code_id, parent_asset_id } = req.body;
    const requestId = req.requestId;
    const userId = req.user.id;

    logger.info(`[${requestId}] User ${userId} updating asset_id: ${id}`);
    try {
        const { rows } = await pool.query(
            `UPDATE assets SET asset_name = $1, asset_type = $2, qr_code_id = $3, parent_asset_id = $4
             WHERE asset_id = $5 RETURNING *`,
            [asset_name, asset_type, qr_code_id, parent_asset_id || null, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Asset not found' });
        }
        await logAudit({ userId, action: 'UPDATE_ASSET', entityType: 'asset', entityId: id });
        res.json(rows[0]);
    } catch (err) {
        logger.error(`[${requestId}] Error updating asset: ${err.message}`);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const deleteAsset = async (req, res) => {
    const { id } = req.params;
    const requestId = req.requestId;
    const userId = req.user.id;

    logger.info(`[${requestId}] User ${userId} deleting asset_id: ${id}`);
    try {
        // We must check for child assets before deleting
        const children = await pool.query('SELECT 1 FROM assets WHERE parent_asset_id = $1', [id]);
        if (children.rows.length > 0) {
            return res.status(400).json({ message: 'Cannot delete asset with child components. Please reassign or delete them first.' });
        }
        
        const { rowCount } = await pool.query('DELETE FROM assets WHERE asset_id = $1', [id]);
        if (rowCount === 0) {
            return res.status(404).json({ message: 'Asset not found' });
        }
        await logAudit({ userId, action: 'DELETE_ASSET', entityType: 'asset', entityId: id });
        res.status(204).send(); // 204 No Content is standard for a successful delete
    } catch (err) {
        logger.error(`[${requestId}] Error deleting asset: ${err.message}`);
        res.status(500).json({ message: 'Internal server error' });
    }
};


module.exports = {
  getAllAssets,
  createAsset,
  updateAsset,
  deleteAsset,
};

const pool = require('../db.cjs');
const logger = require('../utils/logger.cjs');
const { logAudit } = require('../utils/auditLogger.cjs');

const getAllAssets = async (req, res) => {
  const requestId = req.requestId;

  logger.info(`[${requestId}] Fetching all assets`);

  try {
    const queryText = `
      SELECT * FROM assets 
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
    const updates = req.body;
    const requestId = req.requestId;
    const userId = req.user.id;

    logger.info(`[${requestId}] User ${userId} updating asset_id: ${id} with data:`, updates);
    try {
        const currentAssetRes = await pool.query('SELECT * FROM assets WHERE asset_id = $1', [id]);
        if (currentAssetRes.rows.length === 0) {
            return res.status(404).json({ message: 'Asset not found' });
        }
        const currentAsset = currentAssetRes.rows[0];

        const newAsset = { ...currentAsset, ...updates };

        const { rows } = await pool.query(
            `UPDATE assets SET 
                asset_name = $1, 
                asset_type = $2, 
                qr_code_id = $3, 
                parent_asset_id = $4,
                latitude = $5,
                longitude = $6
             WHERE asset_id = $7 RETURNING *`,
            [
                newAsset.asset_name,
                newAsset.asset_type,
                newAsset.qr_code_id,
                newAsset.parent_asset_id,
                newAsset.latitude,
                newAsset.longitude,
                id
            ]
        );
        
        await logAudit({ userId, action: 'UPDATE_ASSET', entityType: 'asset', entityId: id, metadata: updates });
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
        const children = await pool.query('SELECT 1 FROM assets WHERE parent_asset_id = $1', [id]);
        if (children.rows.length > 0) {
            return res.status(400).json({ message: 'Cannot delete asset with child components. Please reassign or delete them first.' });
        }
        
        const { rowCount } = await pool.query('DELETE FROM assets WHERE asset_id = $1', [id]);
        if (rowCount === 0) {
            return res.status(404).json({ message: 'Asset not found' });
        }
        await logAudit({ userId, action: 'DELETE_ASSET', entityType: 'asset', entityId: id });
        res.status(204).send();
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


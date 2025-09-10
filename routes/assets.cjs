const express = require('express');
const { getAllAssets, createAsset, updateAsset, deleteAsset } = require('../controllers/assetController.cjs');
const { verifyToken } = require('../middleware/auth.cjs');
const { requireRole } = require('../middleware/requireRole.cjs');

const router = express.Router();

// This route can be used by any logged-in user to get the asset list.
router.get('/', verifyToken, getAllAssets);

// These routes for creating, updating, and deleting are protected for Managers only.
router.post('/', verifyToken, requireRole(['Manager']), createAsset);
router.put('/:id', verifyToken, requireRole(['Manager']), updateAsset);
router.delete('/:id', verifyToken, requireRole(['Manager']), deleteAsset);

module.exports = router;


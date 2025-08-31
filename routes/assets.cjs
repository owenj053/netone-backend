const express = require('express');
const { getAllAssets } = require('../controllers/assetController.cjs');
const { verifyToken } = require('../middleware/auth.cjs');

const router = express.Router();

router.get('/', verifyToken, getAllAssets);

module.exports = router;
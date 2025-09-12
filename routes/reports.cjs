const express = require('express');
const { getTeamSummary, getUserReport } = require('../controllers/reportController.cjs');
const { verifyToken } = require('../middleware/auth.cjs');
const { requireRole } = require('../middleware/requireRole.cjs');

const router = express.Router();

router.get('/summary', verifyToken, requireRole(['Manager']), getTeamSummary);
router.get('/user/:userId', verifyToken, requireRole(['Manager']), getUserReport);

module.exports = router;

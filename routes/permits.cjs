const express = require('express');
const { issuePermit, acknowledgePermit } = require('../controllers/permitController.cjs');
const { verifyToken } = require('../middleware/auth.cjs');
const { requireRole } = require('../middleware/requireRole.cjs');

const router = express.Router();

router.post('/ticket/:ticket_id', verifyToken, requireRole(['Manager']), issuePermit);
router.put('/:permit_id/acknowledge', verifyToken, requireRole(['Engineer']), acknowledgePermit);

module.exports = router;
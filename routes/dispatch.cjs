const express = require('express');
const { updateUserLocation, findClosestEngineers } = require('../controllers/dispatchController.cjs');
const { verifyToken } = require('../middleware/auth.cjs');
const { requireRole } = require('../middleware/requireRole.cjs');

const router = express.Router();

// Route for engineers to update their location
router.post('/location', verifyToken, requireRole(['Engineer']), updateUserLocation);

// Route for managers to find the closest engineers for a ticket
router.get('/ticket/:ticketId', verifyToken, requireRole(['Manager']), findClosestEngineers);

module.exports = router;
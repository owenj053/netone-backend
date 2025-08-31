const express = require('express');
const { requireRole } = require('../middleware/requireRole.cjs');
const { verifyToken } = require('../middleware/auth.cjs');
// CORRECTED: Import ALL the functions you need from the controller
const {
  getTickets,
  createTicket,
  getTicketById,
  addActivityLog,
  getAllTicketsForManager,
  getLogsForTicket,
  updateTicket
} = require('../controllers/ticketController.cjs');

const router = express.Router();

// Routes for Engineers and Managers
router.get('/', verifyToken, getTickets);
router.post('/', verifyToken, createTicket);
router.get('/:id', verifyToken, getTicketById);
router.post('/:id/logs', verifyToken, addActivityLog);
router.put('/:id', verifyToken, updateTicket); // For updates like reassigning

// Route for fetching logs
router.get('/:id/logs', verifyToken, getLogsForTicket); 

// Route specifically for Managers
router.get('/manager/all', verifyToken, requireRole(['Manager']), getAllTicketsForManager);

module.exports = router;
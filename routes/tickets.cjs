const express = require('express');
const { 
    // We are no longer exporting the old, separate functions
    getTickets, 
    getAllTicketsForManager, 
    createTicket, 
    getTicketById, 
    getLogsForTicket, 
    unifiedUpdateTicket // <-- The ONLY update/post function needed besides create
} = require('../controllers/ticketController.cjs');
const { verifyToken } = require('../middleware/auth.cjs');

const router = express.Router();

// --- REFACTORED: Specific log/close PUT/POST routes are now removed ---

// General GET routes remain the same
router.get('/', verifyToken, (req, res, next) => {
    if (req.user.role?.toLowerCase() === 'manager') {
        return getAllTicketsForManager(req, res, next);
    }
    return getTickets(req, res, next);
});
router.post('/', verifyToken, createTicket);

// The GET route for logs is still needed to fetch the list
router.get('/:id/logs', verifyToken, getLogsForTicket);
router.get('/:id', verifyToken, getTicketById);

// --- REFACTORED: All PUT requests now go to a single, powerful controller ---
// This one route now handles adding logs, closing tickets, and general updates.
router.put('/:id', verifyToken, unifiedUpdateTicket);

module.exports = router;


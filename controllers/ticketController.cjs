const pool = require('../db.cjs');
const logger = require('../utils/logger.cjs');
const { logAudit } = require('../utils/auditLogger.cjs');
const axios = require('axios');

const unifiedUpdateTicket = async (req, res) => {
  const { id: ticket_id } = req.params;
  const updates = req.body;
  const { id: userId, role } = req.user;
  const requestId = req.requestId;

  try {
    // --- ACTION 1: ADD A LOG ---
    if (updates.log_entry) {
      logger.info(`[${requestId}] Unified Update: Adding log to ticket ${ticket_id}`);
      const logQuery = `INSERT INTO activity_logs (ticket_id, user_id, log_entry) VALUES ($1, $2, $3) RETURNING *`;
      await pool.query(logQuery, [ticket_id, userId, updates.log_entry]);
      await logAudit({ userId, action: 'ADD_ACTIVITY_LOG', entityType: 'ticket', entityId: ticket_id });
      return res.status(200).json({ message: 'Log added successfully' });
    }

    // --- ACTION 2: CLOSE THE TICKET ---
    if (updates.status && updates.status.toLowerCase() === 'closed') {
      logger.info(`[${requestId}] Unified Update: Closing ticket ${ticket_id}`);
      if (!updates.resolution_summary) {
        return res.status(400).json({ message: 'Resolution summary is required to close a ticket.' });
      }

      const ticketRes = await pool.query('SELECT status FROM tickets WHERE ticket_id = $1', [ticket_id]);
      if (ticketRes.rows.length === 0) return res.status(404).json({ message: 'Ticket not found' });
      if (ticketRes.rows[0].status.toLowerCase() !== 'resolved') {
        return res.status(400).json({ message: 'A ticket must be in "Resolved" status before it can be closed.' });
      }

      const closeQuery = `UPDATE tickets SET status = 'Closed', closed_at = NOW(), closed_by_id = $1, resolution_summary = $2 WHERE ticket_id = $3 RETURNING *`;
      const { rows } = await pool.query(closeQuery, [userId, updates.resolution_summary, ticket_id]);
      await logAudit({ userId, action: 'CLOSE_TICKET', entityType: 'ticket', entityId: ticket_id });
      return res.json(rows[0]);
    }

    // --- DEFAULT ACTION: GENERAL UPDATE ---
    logger.info(`[${requestId}] Unified Update: General update for ticket ${ticket_id}`);
    const currentTicketRes = await pool.query('SELECT * FROM tickets WHERE ticket_id = $1', [ticket_id]);
    if (currentTicketRes.rows.length === 0) return res.status(404).json({ message: 'Ticket not found' });
    const currentTicket = currentTicketRes.rows[0];
    
    if (role.toLowerCase() === 'engineer' && currentTicket.assigned_to_id !== userId) {
      return res.status(403).json({ message: 'Access denied: You can only update tickets assigned to you.' });
    }

    const newTicketData = { ...currentTicket, ...updates };
    if (updates.status && updates.status.toLowerCase() === 'resolved' && currentTicket.status.toLowerCase() !== 'resolved') {
      newTicketData.resolved_at = new Date();
    }
    
    const updateQuery = `UPDATE tickets SET assigned_to_id = $1, status = $2, resolved_at = $3 WHERE ticket_id = $4 RETURNING *`;
    const { rows } = await pool.query(updateQuery, [newTicketData.assigned_to_id, newTicketData.status, newTicketData.resolved_at, ticket_id]);
    await logAudit({ userId, action: 'UPDATE_TICKET', entityType: 'ticket', entityId: ticket_id, metadata: updates });
    return res.json(rows[0]);

  } catch (err) {
    logger.error(`[${requestId}] Error in unified update for ticket ${ticket_id}: ${err.message}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const getTickets = async (req, res) => {
  const requestId = req.requestId;
  const userId = req.user.id;

  logger.info(`[${requestId}] Fetching tickets for user_id: ${userId}`);
  try {
    const queryText = `
      SELECT t.*, a.asset_name
      FROM tickets t
      LEFT JOIN assets a ON t.asset_id = a.asset_id
      WHERE t.assigned_to_id = $1 
      ORDER BY t.created_at DESC
    `;

    const { rows } = await pool.query(queryText, [userId]);
    logger.info(`[${requestId}] Retrieved ${rows.length} tickets`);
    res.json(rows);
  } catch (err) {
    logger.error(`[${requestId}] Error fetching tickets: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const getAllTicketsForManager = async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] Manager fetching all tickets`);
  try {
    const queryText = `
      SELECT 
        t.*, 
        a.asset_name, 
        u.full_name as assigned_to_full_name
      FROM tickets t
      LEFT JOIN assets a ON t.asset_id = a.asset_id
      LEFT JOIN users u ON t.assigned_to_id = u.user_id
      ORDER BY t.created_at DESC
    `;
    const { rows } = await pool.query(queryText);
    res.json(rows);
  } catch (err) {
    logger.error(`[${requestId}] Error fetching all tickets for manager: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};


const createTicket = async (req, res) => {
  const { asset_id, description, urgency, status, latitude, longitude } = req.body;
  const created_by_id = req.user.id;
  const requestId = req.requestId;
  logger.info(`[${requestId}] Creating ticket for asset_id: ${asset_id}`);
  let ticket;

  try {
    const queryText = `
      INSERT INTO tickets (asset_id, created_by_id, assigned_to_id, description, urgency, status, latitude, longitude) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *
    `;
    const { rows } = await pool.query(queryText, [asset_id, created_by_id, created_by_id, description, urgency, status, latitude, longitude]);
    ticket = rows[0];

    logger.info(`[${requestId}] Ticket created: ${ticket.ticket_id}`);
    res.status(201).json(ticket);

    await logAudit({
      userId: created_by_id,
      action: 'CREATE_TICKET',
      entityType: 'ticket',
      entityId: ticket.ticket_id,
      metadata: { asset_id, urgency, status },
    });
  } catch (err) {
    logger.error(`[${requestId}] Error creating ticket: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Internal server error' });
    }
    return; // Stop execution if ticket creation failed.
  }

  // --- BACKGROUND WEATHER FETCH ---
  // This runs after the user has already received their success response.
  try {
    let finalLatitude, finalLongitude;
    
    // 3. The Intelligent Fallback Logic
    if (ticket.latitude && ticket.longitude) {
      // Ideal case: Use the live GPS coordinates that were sent with the ticket.
      finalLatitude = ticket.latitude;
      finalLongitude = ticket.longitude;
      logger.info(`[${requestId}] Using live GPS coordinates for weather fetch.`);
    } else {
      // Fallback case: Get the asset's static "commissioned" location from the database.
      const assetRes = await pool.query('SELECT latitude, longitude FROM assets WHERE asset_id = $1', [asset_id]);
      finalLatitude = assetRes.rows[0]?.latitude;
      finalLongitude = assetRes.rows[0]?.longitude;
      logger.info(`[${requestId}] No live GPS. Falling back to asset's static coordinates.`);
    }

    // 4. Fetch and save the weather data if we have coordinates and an API key.
    if (finalLatitude && finalLongitude && process.env.OPENWEATHER_API_KEY) {
      const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${finalLatitude}&lon=${finalLongitude}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`;
      const weatherResponse = await axios.get(weatherApiUrl);
      const weatherData = weatherResponse.data;

      await pool.query('UPDATE tickets SET weather_data = $1 WHERE ticket_id = $2', [weatherData, ticket.ticket_id]);
      logger.info(`[${requestId}] Successfully added weather data to ticket ${ticket.ticket_id}`);
    }
  } catch (weatherErr) {
    // We only log this error; we don't send another response because the user already has one.
    logger.error(`[${requestId}] Failed to fetch or save weather data for ticket ${ticket.ticket_id}: ${weatherErr.message}`);
  }
};

const getTicketById = async (req, res) => {
  const { id } = req.params;
  try {
    const queryText = `
      SELECT t.*, a.asset_name, u.full_name as assigned_to_full_name
      FROM tickets t
      LEFT JOIN assets a ON t.asset_id = a.asset_id
      LEFT JOIN users u ON t.assigned_to_id = u.user_id
      WHERE t.ticket_id = $1
    `;
    const { rows } = await pool.query(queryText, [id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Ticket not found' });
    res.json(rows[0]);
  } catch (err) {
    logger.error(`Error fetching ticket by ID: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const addActivityLog = async (req, res) => {
  const { log_entry, parts_used } = req.body;
  const { id: ticket_id } = req.params;
  const user_id = req.user.id;
  const requestId = req.requestId;

  logger.info(`[${requestId}] Adding activity log to ticket_id: ${ticket_id} by user_id: ${user_id}`);
  try {
    // REVERTED: Simple insert that returns the new log directly.
    const queryText = `
      INSERT INTO activity_logs 
        (ticket_id, user_id, log_entry, parts_used) 
      VALUES ($1, $2, $3, $4) 
      RETURNING *
    `;
    const { rows } = await pool.query(queryText, [ticket_id, user_id, log_entry, parts_used]);
    const log = rows[0];

    logger.info(`[${requestId}] Activity log added: ${log.log_id}`);
    await logAudit({
      userId: user_id,
      action: 'ADD_ACTIVITY_LOG',
      entityType: 'ticket',
      entityId: ticket_id,
      metadata: { log_entry, parts_used },
    });
    res.status(201).json(log);
  } catch (err) {
    logger.error(`[${requestId}] Error adding activity log: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const getLogsForTicket = async (req, res) => {
  const { id } = req.params;
  try {
    const queryText = `
      SELECT l.*, u.full_name
      FROM activity_logs l
      JOIN users u ON l.user_id = u.user_id
      WHERE l.ticket_id = $1 ORDER BY l.created_at DESC
    `;
    const { rows } = await pool.query(queryText, [id]);
    res.json(rows);
  } catch (err) {
    logger.error(`Error fetching logs for ticket: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const updateTicket = async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const { id: userId, role } = req.user;
    try {
        const currentTicketRes = await pool.query('SELECT * FROM tickets WHERE ticket_id = $1', [id]);
        if (currentTicketRes.rows.length === 0) return res.status(404).json({ message: 'Ticket not found' });
        const currentTicket = currentTicketRes.rows[0];

        if (role.toLowerCase() === 'engineer' && currentTicket.assigned_to_id !== userId) {
            return res.status(403).json({ message: 'Access denied: You can only update tickets assigned to you.' });
        }
        
        if (updates.status && updates.status.toLowerCase() === 'resolved' && currentTicket.status.toLowerCase() !== 'resolved') {
            updates.resolved_at = new Date();
        }

        const newTicketData = { ...currentTicket, ...updates };
        const { rows } = await pool.query(
            `UPDATE tickets SET assigned_to_id = $1, status = $2 WHERE ticket_id = $3 RETURNING *`,
            [newTicketData.assigned_to_id, newTicketData.status, id]
        );
        
        await logAudit({ userId, action: 'UPDATE_TICKET', entityType: 'ticket', entityId: id, metadata: updates });
        res.json(rows[0]);
    } catch (err) {
        logger.error(`Error updating ticket: ${err.message}`);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const closeTicket = async (req, res) => {
  const { id: ticket_id } = req.params;
  const { resolution_summary } = req.body;
  const { id: userId, role } = req.user;
  try {
    const currentTicketRes = await pool.query('SELECT * FROM tickets WHERE ticket_id = $1', [ticket_id]);
    if (currentTicketRes.rows.length === 0) return res.status(404).json({ message: 'Ticket not found' });
    const currentTicket = currentTicketRes.rows[0];

    if (role.toLowerCase() === 'engineer' && currentTicket.assigned_to_id !== userId) {
      return res.status(403).json({ message: 'Access denied: You can only close tickets assigned to you.' });
    }

    if (currentTicket.status.toLowerCase() !== 'resolved') {
        return res.status(400).json({ message: 'A ticket must be in "Resolved" status before it can be closed.' });
    }

    const queryText = `
      UPDATE tickets SET status = 'Closed', closed_at = NOW(), closed_by_id = $1, resolution_summary = $2
      WHERE ticket_id = $3 RETURNING *
    `;
    const { rows } = await pool.query(queryText, [userId, resolution_summary, ticket_id]);
    
    await logAudit({ userId, action: 'CLOSE_TICKET', entityType: 'ticket', entityId: ticket_id });
    res.json(rows[0]);
  } catch (err) {
    logger.error(`Error closing ticket: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getTickets,
  getAllTicketsForManager,
  createTicket,
  getTicketById,
  addActivityLog,
  getLogsForTicket,
  updateTicket,
  closeTicket,
  unifiedUpdateTicket,
};
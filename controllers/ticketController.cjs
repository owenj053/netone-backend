const pool = require('../db.cjs');
const logger = require('../utils/logger.cjs');
const { logAudit } = require('../utils/auditLogger.cjs');
const axios = require('axios');

const getTickets = async (req, res) => {
  const requestId = req.requestId;
  const userId = req.user.id;
  logger.info(`[${requestId}] Fetching tickets for user_id: ${userId}`);
  try {
    const { rows } = await pool.query("SELECT * FROM tickets WHERE assigned_to_id = $1 ORDER BY created_at DESC", [userId]);
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
    const { rows } = await pool.query("SELECT * FROM tickets ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    logger.error(`[${requestId}] Error fetching all tickets for manager: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};


const createTicket = async (req, res) => {
  // 1. Accept optional latitude and longitude from the frontend.
  const { asset_id, description, urgency, status, latitude, longitude } = req.body;
  const created_by_id = req.user.id;
  const requestId = req.requestId;

  logger.info(`[${requestId}] Creating ticket for asset_id: ${asset_id}`);
  
  let ticket;

  try {
    // 2. Save the ticket to the database, including the (potentially null) GPS coordinates.
    const queryText = `
      INSERT INTO tickets (asset_id, created_by_id, assigned_to_id, description, urgency, status, latitude, longitude) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING *
    `;
    const { rows } = await pool.query(queryText, [asset_id, created_by_id, created_by_id, description, urgency, status, latitude, longitude]);
    ticket = rows[0];

    logger.info(`[${requestId}] Ticket created: ${ticket.ticket_id}`);
    res.status(201).json(ticket); // Send a success response to the user immediately.

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
  const requestId = req.requestId;

  logger.info(`[${requestId}] Fetching ticket by ID: ${id}`);

  try {
    const { rows } = await pool.query(
      'SELECT * FROM tickets WHERE ticket_id = $1',
      [id]
    );

    if (rows.length === 0) {
      logger.warn(`[${requestId}] Ticket not found: ${id}`);
      return res.status(404).json({ message: 'Ticket not found' });
    }

    logger.info(`[${requestId}] Ticket retrieved: ${id}`);
    res.json(rows[0]);
  } catch (err) {
    logger.error(`[${requestId}] Error fetching ticket: ${err.message}`);
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
    const queryText = `
      INSERT INTO activity_logs 
        (ticket_id, user_id, log_entry, parts_used) 
      VALUES ($1, $2, $3, $4) 
      RETURNING *
    `;

    const { rows } = await pool.query(queryText, [
      ticket_id,
      user_id,
      log_entry,
      parts_used,
    ]);

    const log = rows[0];

    logger.info(`[${requestId}] Activity log added: ${log.id}`);

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
  const requestId = req.requestId;
  logger.info(`[${requestId}] Fetching logs for ticket_id: ${id}`);
  try {
    const { rows } = await pool.query("SELECT * FROM activity_logs WHERE ticket_id = $1 ORDER BY created_at ASC", [id]);
    res.json(rows);
  } catch (err) {
    logger.error(`[${requestId}] Error fetching logs: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const updateTicket = async (req, res) => {
  const { id } = req.params;
  const { assigned_to_id, status, root_cause } = req.body;
  const requestId = req.requestId;
  logger.info(`[${requestId}] Updating ticket_id: ${id}`);
  try {
    // A more robust query that only updates non-null fields
    const currentTicket = await pool.query('SELECT * FROM tickets WHERE ticket_id = $1', [id]);
    if (currentTicket.rows.length === 0) {
        return res.status(404).json({ message: 'Ticket not found' });
    }

    const newAssignedId = assigned_to_id !== undefined ? assigned_to_id : currentTicket.rows[0].assigned_to_id;
    const newStatus = status !== undefined ? status : currentTicket.rows[0].status;
    const newRootCause = root_cause !== undefined ? root_cause : currentTicket.rows[0].root_cause;

    const { rows } = await pool.query(
        "UPDATE tickets SET assigned_to_id = $1, status = $2, root_cause = $3 WHERE ticket_id = $4 RETURNING *",
        [newAssignedId, newStatus, newRootCause, id]
    );
    res.json(rows[0]);
  } catch (err) {
    logger.error(`[${requestId}] Error updating ticket: ${err.message}`);
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
};
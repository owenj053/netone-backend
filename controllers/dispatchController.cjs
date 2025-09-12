const pool = require('../db.cjs');
const logger = require('../utils/logger.cjs');

// This is a helper function to calculate the distance between two GPS coordinates.
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

// This function updates an engineer's current location.
const updateUserLocation = async (req, res) => {
  const { latitude, longitude } = req.body;
  const userId = req.user.id;
  const requestId = req.requestId;

  logger.info(`[${requestId}] Updating location for user_id: ${userId}`);
  try {
    const query = `
      INSERT INTO technician_locations (user_id, latitude, longitude, last_updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        last_updated_at = NOW();
    `;
    await pool.query(query, [userId, latitude, longitude]);
    res.status(200).json({ message: 'Location updated successfully' });
  } catch (err) {
    logger.error(`[${requestId}] Error updating location: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// This is the main function for the "Smart Assign" feature.
const findClosestEngineers = async (req, res) => {
  const { ticketId } = req.params;
  const requestId = req.requestId;
  logger.info(`[${requestId}] Finding closest engineers for ticket_id: ${ticketId}`);

  try {
    // 1. Get the ticket's location.
    const ticketRes = await pool.query('SELECT latitude, longitude FROM tickets WHERE ticket_id = $1', [ticketId]);
    if (ticketRes.rows.length === 0) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    const ticketLocation = ticketRes.rows[0];

    // 2. Get all engineers with their current location and workload.
    const engineersQuery = `
      SELECT
        u.user_id,
        u.full_name,
        u.engineer_id,
        loc.latitude,
        loc.longitude,
        (SELECT COUNT(*) FROM tickets t WHERE t.assigned_to_id = u.user_id AND t.status = 'Open') AS open_tickets
      FROM users u
      LEFT JOIN technician_locations loc ON u.user_id = loc.user_id
      WHERE u.role = 'engineer';
    `;
    const engineersRes = await pool.query(engineersQuery);
    const engineers = engineersRes.rows;

    // 3. Calculate the distance for each engineer who has a location.
    const rankedEngineers = engineers
      .filter(eng => eng.latitude && eng.longitude) // Only include engineers with a location
      .map(eng => ({
        ...eng,
        distance_km: getDistance(ticketLocation.latitude, ticketLocation.longitude, eng.latitude, eng.longitude),
      }))
      .sort((a, b) => a.distance_km - b.distance_km); // Sort by distance, closest first

    res.json(rankedEngineers);
  } catch (err) {
    logger.error(`[${requestId}] Error finding closest engineers: ${err.message}`);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  updateUserLocation,
  findClosestEngineers,
};

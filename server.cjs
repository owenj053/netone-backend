const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger.cjs');
const { attachRequestId } = require('./middleware/requestLogger.cjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(attachRequestId);

// Routes
const userRoutes = require('./routes/users.cjs');
const ticketRoutes = require('./routes/tickets.cjs');
const assetRoutes = require('./routes/assets.cjs');
const permitRoutes = require('./routes/permits.cjs');

app.use('/api/users', userRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/permits', permitRoutes);

// Home route
app.get('/', (req, res) => {
  res.send('NetOne Backend Server is running!');
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`[${req.requestId}] Uncaught error: ${err.message}`);
  res.status(500).json({ message: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server is listening on port ${PORT}`);
});
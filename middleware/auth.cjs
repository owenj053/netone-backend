const jwt = require('jsonwebtoken');
const logger = require('../utils/logger.cjs');

const verifyToken = (req, res, next) => {
  const requestId = req.requestId;
  const token = req.header('x-auth-token');

  if (!token) {
    logger.warn(`[${requestId}] No token provided`);
    return res.status(401).json({ message: 'Authorization denied: no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    logger.warn(`[${requestId}] Invalid token: ${err.message}`);
    res.status(401).json({ message: 'Authorization denied: invalid token' });
  }
};

module.exports = {
    verifyToken
};
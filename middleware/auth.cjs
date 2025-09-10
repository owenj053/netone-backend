const jwt = require('jsonwebtoken');
const logger = require('../utils/logger.cjs');

const verifyToken = (req, res, next) => {
  console.log('[DEBUG] Entered verifyToken middleware.'); // CHECKPOINT A
  const requestId = req.requestId;
  const token = req.header('x-auth-token');

  if (!token) {
    logger.warn(`[${requestId}] No token provided`);
    return res.status(401).json({ message: 'Authorization denied: no token' });
  }

  try {
    console.log('[DEBUG] Attempting to verify token...'); // CHECKPOINT B
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    console.log('[DEBUG] Token verified successfully. Proceeding to controller.'); // CHECKPOINT C
    next();
  } catch (err) {
    logger.warn(`[${requestId}] Invalid token: ${err.message}`);
    res.status(401).json({ message: 'Authorization denied: invalid token' });
  }
};

module.exports = {
    verifyToken
};

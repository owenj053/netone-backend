const logger = require('../utils/logger.cjs');

const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    const requestId = req.requestId;
    const userRole = req.user?.role;

    const hasPermission = userRole && allowedRoles.map(r => r.toLowerCase()).includes(userRole.toLowerCase());

    if (!hasPermission) {
      logger.warn(`[${requestId}] Access denied: role '${userRole}' is not one of [${allowedRoles.join(', ')}]`);
      return res.status(403).json({ message: 'Access denied: insufficient permissions' });
    }

    next();
  };
};

module.exports = {
  requireRole
};
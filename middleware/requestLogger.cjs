const { v4: uuidv4 } = require('uuid');

const attachRequestId = (req, res, next) => {
  req.requestId = uuidv4();
  next();
};

module.exports = {
    attachRequestId
};
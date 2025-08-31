const express = require('express');
const { verifyToken } = require('../middleware/auth.cjs');
const {
  registerUser,
  loginUser,
  getUsersByRole
} = require('../controllers/userController.cjs');

const router = express.Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);

// Protected route to get users by role
router.get('/', verifyToken, getUsersByRole);

module.exports = router;
const express = require('express');
const { registerUser, loginUser, getUsersByRole, updateUser } = require('../controllers/userController.cjs');
const { verifyToken } = require('../middleware/auth.cjs');
const { requireRole } = require('../middleware/requireRole.cjs');

const router = express.Router();

router.post('/login', loginUser);

router.get('/', verifyToken, requireRole(['Manager']), getUsersByRole);
router.post('/register', verifyToken, requireRole(['Manager']), registerUser);
router.put('/:id', verifyToken, requireRole(['Manager']), updateUser);

module.exports = router;
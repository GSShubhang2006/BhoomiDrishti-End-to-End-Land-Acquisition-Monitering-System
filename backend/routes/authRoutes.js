const express = require('express');
const { currentUser, demoLogin, login, logout, updateCurrentUser } = require('../controllers/authController');

const router = express.Router();

router.post('/login', login);
router.post('/demo-login', demoLogin);
router.get('/me', currentUser);
router.patch('/me', updateCurrentUser);
router.post('/logout', logout);

module.exports = router;

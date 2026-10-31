const express = require('express');
const { getFieldOfficers } = require('../controllers/userController');

const router = express.Router();

router.get('/field-officers', getFieldOfficers);

module.exports = router;

const express = require('express');
const { getAuditLogs } = require('../controllers/auditLogController');

const router = express.Router();

router.get('/', getAuditLogs);

module.exports = router;

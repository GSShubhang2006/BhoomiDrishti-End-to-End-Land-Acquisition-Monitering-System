const express = require('express');
const { requireRole } = require('../middleware/authentication');
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  resolveNotification,
} = require('../controllers/notificationController');

const router = express.Router();

router.get('/', getNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);
router.post('/:id/resolve', requireRole('admin', 'project_officer'), resolveNotification);

module.exports = router;

const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');

const visibleNotificationFilter = (userId) => ({
  $or: [
    { recipients: { $exists: false } },
    { recipients: { $size: 0 } },
    { recipients: userId },
  ],
});

const recordReadAudit = async (notifications, userId) => {
  if (!notifications.length) return;
  await AuditLog.insertMany(notifications.map((notification) => ({
    user: userId,
    action: 'read',
    entityType: 'Notification',
    entityId: notification._id,
    description: 'Notification marked as read.',
    isDemo: notification.isDemo,
  })));
};

const getNotifications = async (req, res) => {
  try {
    const filter = visibleNotificationFilter(req.user._id);
    const conditions = [];
    if (req.query.status === 'open') conditions.push({ resolvedAt: null });
    if (req.query.status === 'resolved') conditions.push({ resolvedAt: { $ne: null } });
    if (req.query.severity) conditions.push({ severity: req.query.severity });
    if (conditions.length) filter.$and = conditions;
    const notifications = await Notification.find(filter)
      .select('-recipients')
      .populate('project', 'name projectCode')
      .populate('landParcel', 'surveyNumber parcelCode acquisitionStatus')
      .populate('proposal', 'proposalNumber title status')
      .populate('resolvedBy', 'name email role')
      .sort({ resolvedAt: 1, severity: -1, createdAt: -1 })
      .limit(500)
      .lean();
    return res.status(200).json({ notifications });
  } catch (error) {
    console.error('Failed to load notifications:', error.message);
    return res.status(500).json({ message: 'Failed to load notifications' });
  }
};

const markNotificationRead = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ message: 'Invalid notification ID' });
  }
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...visibleNotificationFilter(req.user._id), readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } },
      { returnDocument: 'after' },
    ).select('-recipients').lean();
    if (notification) {
      await recordReadAudit([notification], req.user._id);
      return res.status(200).json({ message: 'Notification marked as read', notification });
    }

    const exists = await Notification.exists({ _id: req.params.id, ...visibleNotificationFilter(req.user._id) });
    if (!exists) return res.status(404).json({ message: 'Notification not found' });
    return res.status(200).json({ message: 'Notification is already read' });
  } catch (error) {
    console.error('Failed to mark notification as read:', error.message);
    return res.status(500).json({ message: 'Failed to mark notification as read' });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const unread = await Notification.find({ ...visibleNotificationFilter(req.user._id), readBy: { $ne: req.user._id } })
      .select('_id isDemo')
      .lean();
    if (!unread.length) {
      return res.status(200).json({ message: 'No unread notifications', markedCount: 0 });
    }

    await Notification.updateMany(
      { _id: { $in: unread.map((notification) => notification._id) }, ...visibleNotificationFilter(req.user._id), readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } },
    );
    await recordReadAudit(unread, req.user._id);
    return res.status(200).json({ message: 'All notifications marked as read', markedCount: unread.length });
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error.message);
    return res.status(500).json({ message: 'Failed to mark all notifications as read' });
  }
};

const resolveNotification = async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ message: 'Invalid notification ID' });
  }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 10 || reason.length > 500) {
    return res.status(400).json({ message: 'Provide a resolution reason between 10 and 500 characters' });
  }
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...visibleNotificationFilter(req.user._id), resolvedAt: null },
      { $set: { resolvedAt: new Date(), resolvedBy: req.user._id, resolutionReason: reason } },
      { returnDocument: 'after' },
    ).select('-recipients').populate('project', 'name projectCode').populate('landParcel', 'surveyNumber parcelCode acquisitionStatus').populate('proposal', 'proposalNumber title status').populate('resolvedBy', 'name email role');
    if (!notification) {
      const exists = await Notification.exists({ _id: req.params.id, ...visibleNotificationFilter(req.user._id) });
      return res.status(exists ? 409 : 404).json({
        message: exists ? 'Notification is already resolved' : 'Notification not found',
      });
    }
    await AuditLog.create({
      user: req.user._id,
      action: 'resolved',
      entityType: 'Notification',
      entityId: notification._id,
      description: `Notification ${notification._id} resolved: ${reason}`,
      isDemo: notification.isDemo,
    });
    return res.status(200).json({ message: 'Notification resolved', notification });
  } catch (error) {
    console.error('Failed to resolve notification:', error.message);
    return res.status(500).json({ message: 'Failed to resolve notification' });
  }
};

module.exports = { getNotifications, markNotificationRead, markAllNotificationsRead, resolveNotification };

const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const FieldVerification = require('../models/FieldVerification');

const getAuditLogs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.entityType) filter.entityType = req.query.entityType;
    if (req.query.entityId) {
      if (!mongoose.isObjectIdOrHexString(req.query.entityId)) {
        return res.status(400).json({ message: 'Invalid entity ID' });
      }
      filter.entityId = req.query.entityId;
    }
    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) {
        const from = new Date(req.query.from);
        if (Number.isNaN(from.getTime())) return res.status(400).json({ message: 'Invalid from date' });
        filter.timestamp.$gte = from;
      }
      if (req.query.to) {
        const to = new Date(req.query.to);
        if (Number.isNaN(to.getTime())) return res.status(400).json({ message: 'Invalid to date' });
        filter.timestamp.$lte = to;
      }
      if (filter.timestamp.$gte && filter.timestamp.$lte && filter.timestamp.$gte > filter.timestamp.$lte) {
        return res.status(400).json({ message: 'The from date must be earlier than or equal to the to date' });
      }
    }
    const [storedLogs, verifications] = await Promise.all([
      AuditLog.find(filter)
      .select('-__v')
      .populate('user', 'name email role')
      .sort({ timestamp: -1 })
      .limit(500)
      .lean(),
      filter.entityType && filter.entityType !== 'FieldVerification'
        ? Promise.resolve([])
        : FieldVerification.find(filter.entityId ? { _id: filter.entityId } : { history: { $exists: true, $ne: [] } })
          .populate('history.actor', 'name email role')
          .limit(500)
          .lean(),
    ]);
    const historyLogs = verifications.flatMap((verification) => (verification.history || [])
      .filter((entry) => !storedLogs.some((log) =>
        log.entityType === 'FieldVerification' &&
        String(log.entityId) === String(verification._id) &&
        log.action === entry.action &&
        Math.abs(new Date(log.timestamp).getTime() - new Date(entry.timestamp).getTime()) < 5000))
      .map((entry) => ({
        _id: `${verification._id}:${entry._id}`,
        user: entry.actor,
        action: entry.action,
        entityType: 'FieldVerification',
        entityId: verification._id,
        description: entry.remarks || `Field verification marked ${entry.action}.`,
        timestamp: entry.timestamp,
        isDemo: verification.isDemo,
      })));
    const auditLogs = [...storedLogs, ...historyLogs]
      .filter((entry) => !filter.timestamp ||
        (entry.timestamp >= (filter.timestamp.$gte || new Date(0)) &&
          entry.timestamp <= (filter.timestamp.$lte || new Date(8640000000000000))))
      .sort((first, second) => new Date(second.timestamp) - new Date(first.timestamp))
      .slice(0, 500);
    return res.status(200).json({ auditLogs });
  } catch (error) {
    console.error('Failed to load audit history:', error.message);
    return res.status(500).json({ message: 'Failed to load audit history' });
  }
};

module.exports = { getAuditLogs };

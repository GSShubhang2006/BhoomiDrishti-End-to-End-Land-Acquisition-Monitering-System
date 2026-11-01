const AuditLog = require('../models/AuditLog');

async function recordAudit({ actorId, action, entityType, entityId, description, isDemo = false }) {
  try {
    await AuditLog.create({
      user: actorId,
      action,
      entityType,
      entityId,
      description,
      isDemo,
    });
  } catch (error) {
    console.error(`Audit event could not be recorded for ${entityType} ${entityId}:`, error.message);
    const auditError = new Error('The record change may have been saved, but its audit event could not be written. Refresh before retrying.');
    auditError.code = 'AUDIT_WRITE_FAILED';
    throw auditError;
  }
}

module.exports = { recordAudit };

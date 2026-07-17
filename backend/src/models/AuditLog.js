const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    adminIdentifier: { type: String, required: true }, // admin username or telegram ID that performed the action
    action: { type: String, required: true }, // e.g. 'adjust_balance', 'ban_user', 'freeze_user', 'edit_mission'
    targetTelegramId: { type: String, default: null },
    reason: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // free-form extra detail (before/after values, etc.)
  },
  { timestamps: true }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);

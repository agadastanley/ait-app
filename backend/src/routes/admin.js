const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Mission = require('../models/Mission');
const AuditLog = require('../models/AuditLog');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

async function logAction(adminIdentifier, action, targetTelegramId, reason, meta = {}) {
  await AuditLog.create({ adminIdentifier, action, targetTelegramId, reason, meta });
}

// ---------- Auth ----------

/**
 * POST /api/admin/login
 * Body: { username, password }
 * Checked against ADMIN_USERNAME / ADMIN_PASSWORD env vars. Returns a short-lived JWT
 * signed with ADMIN_JWT_SECRET (a different secret from the one used for anything else).
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }

  const token = jwt.sign({ isAdmin: true, identifier: username }, process.env.ADMIN_JWT_SECRET, {
    expiresIn: '12h',
  });

  res.json({ token });
});

// Everything below requires a valid admin session.
router.use(adminAuth);

// ---------- Users ----------

/**
 * GET /api/admin/users?search=&status=&page=&limit=
 * Search by Telegram ID or username; optional status filter.
 */
router.get('/users', async (req, res) => {
  const { search = '', status, page = 1, limit = 25 } = req.query;

  const query = {};
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { telegramId: new RegExp(search, 'i') },
      { username: new RegExp(search, 'i') },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(query).sort({ balance: -1 }).skip(skip).limit(Number(limit)),
    User.countDocuments(query),
  ]);

  res.json({
    total,
    page: Number(page),
    users: users.map((u) => ({
      telegramId: u.telegramId,
      username: u.username,
      firstName: u.firstName,
      balance: Math.floor(u.balance),
      status: u.status,
      flagged: u.flagged,
      referralCount: u.referralCount,
      streakCount: u.streakCount,
      createdAt: u.createdAt,
    })),
  });
});

/**
 * POST /api/admin/users/:telegramId/adjust-balance
 * Body: { amount, reason } — amount may be positive or negative.
 */
router.post('/users/:telegramId/adjust-balance', async (req, res) => {
  const { telegramId } = req.params;
  const { amount, reason } = req.body;

  if (typeof amount !== 'number' || !reason) {
    return res.status(400).json({ error: 'amount (number) and reason (string) are required' });
  }

  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const before = user.balance;
  user.balance = Math.max(0, user.balance + amount);
  await user.save();

  await logAction(req.admin.identifier, 'adjust_balance', telegramId, reason, {
    before,
    after: user.balance,
    delta: amount,
  });

  res.json({ telegramId, newBalance: Math.floor(user.balance) });
});

/**
 * POST /api/admin/users/:telegramId/status
 * Body: { status: 'active' | 'frozen' | 'banned', reason }
 * Also optionally resets balance to 0 when banning, via { resetBalance: true }.
 */
router.post('/users/:telegramId/status', async (req, res) => {
  const { telegramId } = req.params;
  const { status, reason, resetBalance } = req.body;

  if (!['active', 'frozen', 'banned'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (!reason) return res.status(400).json({ error: 'reason is required' });

  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const beforeStatus = user.status;
  const beforeBalance = user.balance;
  user.status = status;
  if (resetBalance) user.balance = 0;
  await user.save();

  await logAction(req.admin.identifier, 'set_status', telegramId, reason, {
    beforeStatus,
    afterStatus: status,
    balanceReset: !!resetBalance,
    beforeBalance,
  });

  res.json({ telegramId, status: user.status, balance: Math.floor(user.balance) });
});

/**
 * POST /api/admin/users/:telegramId/flag
 * Body: { flagged: boolean, note }
 * Lightweight cheater-flagging, separate from a full ban.
 */
router.post('/users/:telegramId/flag', async (req, res) => {
  const { telegramId } = req.params;
  const { flagged, note = '' } = req.body;

  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.flagged = !!flagged;
  user.adminNote = note;
  await user.save();

  await logAction(req.admin.identifier, 'flag_user', telegramId, note, { flagged: !!flagged });

  res.json({ telegramId, flagged: user.flagged });
});

// ---------- Missions ----------

router.get('/missions', async (req, res) => {
  const missions = await Mission.find().sort({ order: 1, createdAt: 1 });
  res.json({ missions });
});

/**
 * PATCH /api/admin/missions/:id/link
 * Body: { url }
 * The intended day-to-day admin action for link-based missions (Telegram
 * channel / X account): update the destination URL only, no redeploy needed.
 * The mission list itself (titles/types/rewards) is fixed at build time.
 */
router.patch('/missions/:id/link', async (req, res) => {
  const { id } = req.params;
  const { url } = req.body;
  if (typeof url !== 'string') return res.status(400).json({ error: 'url (string) is required' });

  const mission = await Mission.findById(id);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });

  const before = mission.url;
  mission.url = url;
  await mission.save();

  await logAction(req.admin.identifier, 'edit_mission_link', null, `Updated link for: ${mission.title}`, {
    missionId: id,
    before,
    after: url,
  });

  res.json({ mission });
});

router.post('/missions', async (req, res) => {
  const { title, description, type, url, reward, order } = req.body;
  if (!title || !type || reward == null) {
    return res.status(400).json({ error: 'title, type, and reward are required' });
  }

  const mission = await Mission.create({ title, description, type, url, reward, order: order || 0 });
  await logAction(req.admin.identifier, 'create_mission', null, `Created mission: ${title}`, {
    missionId: mission._id,
  });

  res.status(201).json({ mission });
});

router.put('/missions/:id', async (req, res) => {
  const { id } = req.params;
  const update = req.body;

  const mission = await Mission.findByIdAndUpdate(id, update, { new: true });
  if (!mission) return res.status(404).json({ error: 'Mission not found' });

  await logAction(req.admin.identifier, 'edit_mission', null, `Edited mission: ${mission.title}`, {
    missionId: id,
    update,
  });

  res.json({ mission });
});

router.delete('/missions/:id', async (req, res) => {
  const { id } = req.params;
  const mission = await Mission.findByIdAndDelete(id);
  if (!mission) return res.status(404).json({ error: 'Mission not found' });

  await logAction(req.admin.identifier, 'delete_mission', null, `Deleted mission: ${mission.title}`, {
    missionId: id,
  });

  res.json({ success: true });
});

// ---------- Stats ----------

router.get('/stats', async (req, res) => {
  const [totalUsers, activeUsers, bannedUsers, circulationAgg, topUsers] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ status: 'banned' }),
    User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
    User.find().sort({ balance: -1 }).limit(10).select('telegramId username balance'),
  ]);

  res.json({
    totalUsers,
    activeUsers,
    bannedUsers,
    totalAiTInCirculation: Math.floor(circulationAgg[0]?.total || 0),
    mostActiveUsers: topUsers.map((u) => ({
      telegramId: u.telegramId,
      username: u.username,
      balance: Math.floor(u.balance),
    })),
  });
});

// ---------- Audit log ----------

router.get('/audit-log', async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [logs, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    AuditLog.countDocuments(),
  ]);

  res.json({ total, page: Number(page), logs });
});

module.exports = router;

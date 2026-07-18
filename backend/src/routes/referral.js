const express = require('express');
const User = require('../models/User');
const { telegramAuth } = require('../middleware/telegramAuth');
const { getTierInfo } = require('../utils/gameLogic');

const router = express.Router();

/**
 * GET /api/referral/me
 * Returns invite link/code, aggregate network stats (total nodes, active
 * today, total AiT earned across the whole network), and the full list of
 * recruited nodes with avatar, tier, and individual contribution.
 */
router.get('/me', telegramAuth, async (req, res) => {
  const user = req.user;
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
  const link = botUsername ? `https://t.me/${botUsername}?startapp=${user.referralCode}` : null;

  const invited = await User.find({ referredBy: user.telegramId })
    .select('telegramId username firstName photoUrl lifetimeEarned lastActiveAt createdAt')
    .sort({ createdAt: -1 });

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const activeToday = invited.filter((u) => new Date(u.lastActiveAt).getTime() > oneDayAgo).length;
  const totalEarnedFromNetwork = invited.reduce((sum, u) => sum + (u.lifetimeEarned || 0), 0);

  let invitedByUsername = null;
  if (user.referredBy) {
    const referrer = await User.findOne({ telegramId: user.referredBy }).select('username firstName');
    invitedByUsername = referrer ? referrer.username || referrer.firstName || 'a fellow node' : null;
  }

  res.json({
    referralCode: user.referralCode,
    referralLink: link,
    totalNodes: invited.length,
    activeToday,
    totalEarnedFromNetwork: Math.floor(totalEarnedFromNetwork),
    invitedBy: invitedByUsername,
    invited: invited.map((u) => ({
      telegramId: u.telegramId,
      username: u.username || u.firstName || `User ${u.telegramId.slice(-4)}`,
      photoUrl: u.photoUrl || '',
      tier: getTierInfo(u.lifetimeEarned || 0).name,
      contribution: Math.floor(u.lifetimeEarned || 0),
      joinedAt: u.createdAt,
    })),
  });
});

module.exports = router;

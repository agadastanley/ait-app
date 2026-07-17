const express = require('express');
const User = require('../models/User');
const { telegramAuth } = require('../middleware/telegramAuth');
const { getReferralTier } = require('../utils/gameLogic');

const router = express.Router();

/**
 * GET /api/referral/me
 * Returns this user's referral code/link, plus the full list of users they've
 * personally invited (queried by referredBy === this user's telegramId), each
 * with a display tier and their current balance as a rough "contribution" figure.
 * Also reports who invited *this* user, if anyone, for their own profile display.
 */
router.get('/me', telegramAuth, async (req, res) => {
  const user = req.user;
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
  const link = botUsername ? `https://t.me/${botUsername}?startapp=${user.referralCode}` : null;

  const invited = await User.find({ referredBy: user.telegramId })
    .select('telegramId username firstName balance createdAt')
    .sort({ createdAt: -1 });

  let invitedByUsername = null;
  if (user.referredBy) {
    const referrer = await User.findOne({ telegramId: user.referredBy }).select('username firstName');
    invitedByUsername = referrer ? referrer.username || referrer.firstName || 'a fellow node' : null;
  }

  res.json({
    referralCode: user.referralCode,
    referralLink: link,
    referralCount: user.referralCount,
    invitedBy: invitedByUsername,
    invited: invited.map((u) => ({
      telegramId: u.telegramId,
      username: u.username || u.firstName || `User ${u.telegramId.slice(-4)}`,
      tier: getReferralTier(u.balance),
      contribution: Math.floor(u.balance),
      joinedAt: u.createdAt,
    })),
  });
});

module.exports = router;

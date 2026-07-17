const express = require('express');
const User = require('../models/User');
const { telegramAuth } = require('../middleware/telegramAuth');

const router = express.Router();

/**
 * GET /api/leaderboard
 * Top 100 users by balance. Excludes banned accounts.
 */
router.get('/', telegramAuth, async (req, res) => {
  const topUsers = await User.find({ status: { $ne: 'banned' } })
    .sort({ balance: -1 })
    .limit(100)
    .select('telegramId username firstName balance');

  const rank = topUsers.findIndex((u) => u.telegramId === req.user.telegramId);

  res.json({
    leaderboard: topUsers.map((u, i) => ({
      rank: i + 1,
      username: u.username || u.firstName || `User ${u.telegramId.slice(-4)}`,
      balance: Math.floor(u.balance),
    })),
    myRank: rank === -1 ? null : rank + 1,
  });
});

module.exports = router;

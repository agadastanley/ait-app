const express = require('express');
const User = require('../models/User');
const { telegramAuth } = require('../middleware/telegramAuth');
const { getPassiveRatePerHour } = require('../utils/gameLogic');

const router = express.Router();

function rowView(u, rank, valueField) {
  return {
    rank,
    telegramId: u.telegramId,
    username: u.username || u.firstName || `User ${u.telegramId.slice(-4)}`,
    photoUrl: u.photoUrl || '',
    value: Math.floor(valueField),
  };
}

/**
 * GET /api/leaderboard?by=balance|pph
 * Two views: Top Holders (by spendable balance) and Top Earners (by current
 * profit-per-hour). Always includes the current user's own row (with their
 * real rank) even when they're outside the top 100 — never just a cut-off list.
 */
router.get('/', telegramAuth, async (req, res) => {
  const by = req.query.by === 'pph' ? 'pph' : 'balance';
  const me = req.user;

  if (by === 'balance') {
    const topUsers = await User.find({ status: { $ne: 'banned' } })
      .sort({ balance: -1 })
      .limit(100)
      .select('telegramId username firstName photoUrl balance');

    const leaderboard = topUsers.map((u, i) => rowView(u, i + 1, u.balance));
    let myRow = leaderboard.find((r) => r.telegramId === me.telegramId);

    if (!myRow) {
      const higherCount = await User.countDocuments({ status: { $ne: 'banned' }, balance: { $gt: me.balance } });
      myRow = rowView(me, higherCount + 1, me.balance);
    }

    return res.json({ leaderboard, myRow, by });
  }

  // 'pph' view — PPH is derived from upgrades/boosts, not a stored/sortable
  // field, so we compute it in memory. Fine at this app's current scale;
  // worth caching a denormalized field if the user base grows very large.
  const allUsers = await User.find({ status: { $ne: 'banned' } }).select(
    'telegramId username firstName photoUrl upgrades boosts'
  );

  const ranked = allUsers
    .map((u) => ({ user: u, pph: getPassiveRatePerHour(u) }))
    .sort((a, b) => b.pph - a.pph);

  const leaderboard = ranked.slice(0, 100).map((r, i) => rowView(r.user, i + 1, r.pph));
  let myRow = leaderboard.find((r) => r.telegramId === me.telegramId);

  if (!myRow) {
    const myIndex = ranked.findIndex((r) => r.user.telegramId === me.telegramId);
    const myPPH = myIndex >= 0 ? ranked[myIndex].pph : getPassiveRatePerHour(me);
    myRow = rowView(me, myIndex >= 0 ? myIndex + 1 : ranked.length + 1, myPPH);
  }

  res.json({ leaderboard, myRow, by });
});

module.exports = router;

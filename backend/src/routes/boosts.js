const express = require('express');
const { telegramAuth } = require('../middleware/telegramAuth');
const { BOOSTS } = require('../utils/gameConfig');
const { getBoostStatus, publicUserView } = require('../utils/gameLogic');

const router = express.Router();

/**
 * GET /api/boosts
 * Returns status (ready / active+remaining / on cooldown+remaining) for both
 * quick boosts, all timestamps computed server-side.
 */
router.get('/', telegramAuth, async (req, res) => {
  const user = req.user;
  res.json({
    ten_min: getBoostStatus(user, 'ten_min'),
    one_hour: getBoostStatus(user, 'one_hour'),
  });
});

/**
 * POST /api/boosts/:id/activate
 * Activates a boost if it's not already active and not on cooldown. Sets a
 * server timestamp for both the active window and the next-available time —
 * the client never supplies or controls either timestamp.
 */
router.post('/:id/activate', telegramAuth, async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const cfg = BOOSTS[id];
    if (!cfg) return res.status(404).json({ error: 'Unknown boost' });

    const status = getBoostStatus(user, id);
    if (status.active) return res.status(400).json({ error: 'Boost is already active' });
    if (!status.ready) {
      return res.status(429).json({ error: 'Boost is on cooldown', remainingSeconds: status.cooldownRemainingSeconds });
    }

    const now = new Date();
    if (!user.boosts) user.boosts = {};
    user.boosts[id] = {
      activeUntil: new Date(now.getTime() + cfg.durationSeconds * 1000),
      availableAt: new Date(now.getTime() + cfg.cooldownSeconds * 1000),
    };
    user.markModified('boosts');
    await user.save();

    res.json({ user: publicUserView(user) });
  } catch (err) {
    console.error('[boosts/activate] error:', err.message);
    res.status(500).json({ error: 'Failed to activate boost' });
  }
});

module.exports = router;

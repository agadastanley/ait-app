const express = require('express');
const { telegramAuth } = require('../middleware/telegramAuth');
const { tapLimiter } = require('../middleware/rateLimiter');
const { applyEnergyRegen, getTapValue, applyEarning, publicUserView } = require('../utils/gameLogic');

const router = express.Router();

/**
 * POST /api/tap
 * Body: { taps: number } — number of taps registered client-side since the last call
 * (the frontend batches taps, e.g. every 300-500ms, rather than firing one request per tap).
 *
 * Server is the source of truth: energy is recomputed from elapsed time, taps are
 * clamped to available energy, and the rate limiter above caps requests/second per user.
 */
router.post('/', telegramAuth, tapLimiter, async (req, res) => {
  try {
    const user = req.user;
    let { taps } = req.body;
    taps = Number(taps);

    if (!Number.isFinite(taps) || taps <= 0) {
      return res.status(400).json({ error: 'Invalid tap count' });
    }
    // Hard ceiling per request regardless of what the client claims.
    taps = Math.min(taps, 50);

    applyEnergyRegen(user);

    const affordableTaps = Math.min(taps, Math.floor(user.energy));
    if (affordableTaps <= 0) {
      return res.status(200).json({ user: publicUserView(user), tapsAccepted: 0 });
    }

    const tapValue = getTapValue(user);
    user.energy -= affordableTaps;
    applyEarning(user, affordableTaps * tapValue);
    user.lastActiveAt = new Date();

    await user.save();

    res.json({ user: publicUserView(user), tapsAccepted: affordableTaps });
  } catch (err) {
    console.error('[tap] error:', err.message);
    res.status(500).json({ error: 'Tap failed' });
  }
});

module.exports = router;

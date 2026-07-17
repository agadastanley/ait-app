const rateLimit = require('express-rate-limit');
const { MAX_TAPS_PER_SECOND } = require('../utils/gameConfig');

// Coarse network-level guard: blocks obvious bot/script flooding per Telegram user.
// This is on top of (not instead of) the per-request energy check done in routes/tap.js.
const tapLimiter = rateLimit({
  windowMs: 1000, // 1 second window
  max: MAX_TAPS_PER_SECOND,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.telegramId || req.ip,
  message: { error: 'Tapping too fast — slow down.' },
});

module.exports = { tapLimiter };

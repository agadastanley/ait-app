const express = require('express');
const { nanoid } = require('nanoid');
const User = require('../models/User');
const { telegramAuth, verifyInitData } = require('../middleware/telegramAuth');
const { REFERRAL_BONUS_REFERRER, REFERRAL_BONUS_REFEREE } = require('../utils/gameConfig');
const { publicUserView, applyEnergyRegen, applyPassiveIncome } = require('../utils/gameLogic');

const router = express.Router();

/**
 * POST /api/auth/telegram
 * Called once on Mini App launch. Validates initData, creates the user record
 * on first launch (tied to Telegram user ID), and applies a referral bonus
 * if a `startapp`/referral code was passed in.
 * Body: { initData: string, referralCode?: string }
 */
router.post('/telegram', async (req, res) => {
  try {
    const { initData, referralCode } = req.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgUser = verifyInitData(initData, botToken);

    if (!tgUser || !tgUser.id) {
      return res.status(401).json({ error: 'Invalid Telegram authentication data' });
    }

    let user = await User.findOne({ telegramId: String(tgUser.id) });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({
        telegramId: String(tgUser.id),
        username: tgUser.username || '',
        firstName: tgUser.first_name || '',
        referralCode: nanoid(8),
      });

      if (referralCode) {
        const referrer = await User.findOne({ referralCode });
        if (referrer && referrer.telegramId !== user.telegramId) {
          user.referredBy = referrer.telegramId;
          user.balance += REFERRAL_BONUS_REFEREE;

          referrer.balance += REFERRAL_BONUS_REFERRER;
          referrer.referralCount += 1;
          await referrer.save();
        }
      }
      await user.save();
    } else {
      // Keep username/first name fresh in case the user changed it on Telegram.
      user.username = tgUser.username || user.username;
      user.firstName = tgUser.first_name || user.firstName;
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: 'This account has been banned.' });
    }

    applyEnergyRegen(user);
    applyPassiveIncome(user);
    await user.save();

    res.json({ user: publicUserView(user), isNewUser });
  } catch (err) {
    console.error('[auth/telegram] error:', err.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * GET /api/auth/me
 * Returns current user state, applying energy regen + passive income first.
 * Requires X-Telegram-Init-Data header (validated fresh on every call).
 */
router.get('/me', telegramAuth, async (req, res) => {
  const user = req.user;
  applyEnergyRegen(user);
  applyPassiveIncome(user);
  await user.save();
  res.json({ user: publicUserView(user) });
});

module.exports = router;

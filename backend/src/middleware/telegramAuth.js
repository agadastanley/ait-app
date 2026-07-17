const crypto = require('crypto');
const User = require('../models/User');

/**
 * Validates Telegram WebApp `initData` per Telegram's documented algorithm:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * The Mini App frontend must send the raw initData string (window.Telegram.WebApp.initData)
 * on every request in the `X-Telegram-Init-Data` header. We re-verify the signature
 * server-side on every single call — we never trust a cached/previous validation.
 */
function verifyInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  // Optional freshness check — reject initData older than 24h to limit replay window.
  const authDate = Number(params.get('auth_date'));
  if (authDate && Date.now() / 1000 - authDate > 60 * 60 * 24) {
    return null;
  }

  const userJson = params.get('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

async function telegramAuth(req, res, next) {
  try {
    const initData = req.headers['x-telegram-init-data'];
    if (!initData) {
      return res.status(401).json({ error: 'Missing Telegram init data' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgUser = verifyInitData(initData, botToken);
    if (!tgUser || !tgUser.id) {
      return res.status(401).json({ error: 'Invalid or expired Telegram authentication' });
    }

    let user = await User.findOne({ telegramId: String(tgUser.id) });
    if (!user) {
      // First launch — this should normally happen via /api/auth/telegram,
      // but we create defensively here too so no endpoint ever 500s on a new user.
      const { nanoid } = require('nanoid');
      user = await User.create({
        telegramId: String(tgUser.id),
        username: tgUser.username || '',
        firstName: tgUser.first_name || '',
        referralCode: nanoid(8),
      });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ error: 'This account has been banned.' });
    }

    req.telegramUser = tgUser;
    req.user = user;
    next();
  } catch (err) {
    console.error('[telegramAuth] error:', err.message);
    res.status(500).json({ error: 'Authentication error' });
  }
}

module.exports = { telegramAuth, verifyInitData };

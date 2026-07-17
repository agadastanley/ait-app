const jwt = require('jsonwebtoken');

/**
 * Protects the admin dashboard API. Regular users authenticate via Telegram initData
 * (see telegramAuth.js) — this is a completely separate auth path that regular users
 * have no way to obtain a token for, since it requires either:
 *   1. The admin username/password (POST /api/admin/login), or
 *   2. A Telegram ID present in the ADMIN_TELEGRAM_IDS allowlist.
 */
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (!payload.isAdmin) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    req.admin = payload; // { isAdmin: true, identifier: 'admin' or telegramId }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }
}

module.exports = adminAuth;

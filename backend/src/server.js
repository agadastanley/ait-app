require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const tapRoutes = require('./routes/tap');
const upgradeRoutes = require('./routes/upgrades');
const missionRoutes = require('./routes/missions');
const referralRoutes = require('./routes/referral');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');

const app = express();

// --- CORS: only the frontend + admin dashboard origins may call this API ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / curl requests with no origin (e.g. health checks).
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
  })
);

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/tap', tapRoutes);
app.use('/api/upgrades', upgradeRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Generic error handler — keeps stack traces out of API responses.
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`[server] AiT backend listening on port ${PORT}`);
  });

  // Start the Telegram bot alongside the API (same process, free-tier friendly).
  require('./bot/bot');
}

start().catch((err) => {
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});

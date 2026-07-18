// One-off script: populates starter missions across all 4 categories.
// Run locally with: node src/seed.js
require('dotenv').config();
const connectDB = require('./config/db');
const Mission = require('./models/Mission');

async function seed() {
  await connectDB();

  const defaults = [
    {
      title: 'Join the AiT Telegram Channel',
      description: 'Stay updated on new Model Upgrades and events',
      category: 'social',
      type: 'telegram_join',
      url: 'https://t.me/your_ait_channel',
      reward: 500,
      order: 1,
    },
    {
      title: 'Follow AiT on X',
      description: 'Follow for announcements',
      category: 'social',
      type: 'x_follow',
      url: 'https://x.com/your_ait_handle',
      reward: 500,
      order: 2,
    },
    {
      title: 'Invite 3 Friends',
      description: 'Expand the Neural Network',
      category: 'engagement',
      type: 'invite_friends',
      url: '',
      reward: 1000,
      order: 3,
    },
    {
      title: 'Daily Training Bonus',
      description: 'Check in daily to build your streak',
      category: 'engagement',
      type: 'daily_checkin',
      url: '',
      reward: 0, // base reward comes from DAILY_BONUS_BASE + streak in gameConfig
      order: 4,
    },
    {
      title: 'Connect Your Wallet',
      description: 'Link a wallet for the upcoming token deployment (self-reported for now)',
      category: 'verification',
      type: 'wallet_connect',
      url: '',
      reward: 1000,
      order: 5,
    },
  ];

  for (const m of defaults) {
    const exists = await Mission.findOne({ title: m.title });
    if (!exists) {
      await Mission.create(m);
      console.log(`Created mission: ${m.title}`);
    } else {
      console.log(`Skipped (already exists): ${m.title}`);
    }
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

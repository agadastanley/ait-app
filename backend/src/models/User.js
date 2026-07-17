const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },

    balance: { type: Number, default: 0 },

    // GPU Power / energy
    energy: { type: Number, default: 500 },
    lastEnergyUpdate: { type: Date, default: Date.now },

    // Model Upgrades — map of upgrade key -> { level, upgradeCount, lastUpgradedAt }.
    // upgradeCount and lastUpgradedAt drive the server-authoritative cooldown:
    // both fields are only ever written by the backend on a successful purchase.
    upgrades: {
      type: Map,
      of: new mongoose.Schema(
        {
          level: { type: Number, default: 0 },
          upgradeCount: { type: Number, default: 0 },
          lastUpgradedAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: {},
    },

    // Background Training (passive income)
    lastActiveAt: { type: Date, default: Date.now },

    // Missions ("Training Tasks")
    completedMissions: [
      {
        missionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mission' },
        completedAt: { type: Date, default: Date.now },
      },
    ],
    // In-progress link-based missions — records when the user tapped "Start"
    // so the 45s claim delay is timestamp-based, not a client-side timer.
    missionProgress: {
      type: Map,
      of: new mongoose.Schema({ startedAt: { type: Date, default: Date.now } }, { _id: false }),
      default: {},
    },

    // Referrals ("Expand the Neural Network")
    referralCode: { type: String, unique: true, index: true },
    referredBy: { type: String, default: null }, // telegramId of referrer
    referralCount: { type: Number, default: 0 },

    // Daily Training Bonus / streaks
    streakCount: { type: Number, default: 0 },
    lastCheckInAt: { type: Date, default: null },

    // Daily Weight Sync progress — tracks which of the current combo's secret
    // cards this user has already discovered (by upgrading them), tied to the
    // active DailyCombo document's ID so a new day's combo resets progress.
    dailyCombo: {
      comboId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyCombo', default: null },
      foundKeys: { type: [String], default: [] },
      claimed: { type: Boolean, default: false },
    },

    // Account status (admin-controlled)
    status: {
      type: String,
      enum: ['active', 'frozen', 'banned'],
      default: 'active',
    },

    // Denormalized flag for quick admin flagging/notes
    flagged: { type: Boolean, default: false },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);

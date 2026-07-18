const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    photoUrl: { type: String, default: '' }, // from Telegram initData, for avatars in Ranks/Network

    balance: { type: Number, default: 0 }, // spendable
    lifetimeEarned: { type: Number, default: 0 }, // never decreases — drives tier

    // GPU Power / energy
    energy: { type: Number, default: 500 },
    lastEnergyUpdate: { type: Date, default: Date.now },

    // Model Upgrades — map of upgrade key -> { level, upgradeCount, lastUpgradedAt }
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

    // Quick Boosts (temporary PPH multipliers)
    boosts: {
      ten_min: {
        activeUntil: { type: Date, default: null },
        availableAt: { type: Date, default: null }, // null/past = ready to use
      },
      one_hour: {
        activeUntil: { type: Date, default: null },
        availableAt: { type: Date, default: null },
      },
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
    missionProgress: {
      type: Map,
      of: new mongoose.Schema({ startedAt: { type: Date, default: Date.now } }, { _id: false }),
      default: {},
    },

    // Referrals ("Expand the Neural Network")
    referralCode: { type: String, unique: true, index: true },
    referredBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 },

    // Daily Training Bonus / streaks
    streakCount: { type: Number, default: 0 },
    lastCheckInAt: { type: Date, default: null },

    // Daily Weight Sync progress
    dailyCombo: {
      comboId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyCombo', default: null },
      foundKeys: { type: [String], default: [] },
      claimed: { type: Boolean, default: false },
    },

    // Account status (admin-controlled)
    status: { type: String, enum: ['active', 'frozen', 'banned'], default: 'active' },
    flagged: { type: Boolean, default: false },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);

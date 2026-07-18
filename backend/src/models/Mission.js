const mongoose = require('mongoose');

const missionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: ['social', 'engagement', 'verification', 'partner'],
      default: 'social',
    },
    type: {
      type: String,
      enum: ['telegram_join', 'x_follow', 'invite_friends', 'wallet_connect', 'custom_link', 'daily_checkin'],
      required: true,
    },
    url: { type: String, default: '' },
    reward: { type: Number, required: true, default: 0 },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Mission', missionSchema);

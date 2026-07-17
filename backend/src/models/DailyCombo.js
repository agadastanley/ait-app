const mongoose = require('mongoose');

// One document represents "today's" secret 3-card combo. A new one is created
// whenever the previous one's activeUntil has passed — this is checked lazily
// on request rather than via a cron job, so it works fine on Render's free tier.
const dailyComboSchema = new mongoose.Schema(
  {
    cardKeys: { type: [String], required: true }, // the 3 secretly-chosen upgrade keys
    bonusAmount: { type: Number, required: true },
    activeUntil: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DailyCombo', dailyComboSchema);

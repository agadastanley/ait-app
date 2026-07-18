const DailyCombo = require('../models/DailyCombo');
const { UPGRADES, WEIGHT_SYNC_SLOT_COUNT, WEIGHT_SYNC_DURATION_HOURS, WEIGHT_SYNC_BONUS } = require('./gameConfig');

function pickRandomKeys(count) {
  const allKeys = Object.keys(UPGRADES);
  const chosen = new Set();
  while (chosen.size < count && chosen.size < allKeys.length) {
    chosen.add(allKeys[Math.floor(Math.random() * allKeys.length)]);
  }
  return [...chosen];
}

/**
 * Returns the currently-active DailyCombo, creating a new one if the previous
 * one has expired (or none exists yet). This is checked lazily on request
 * rather than via a cron job — fine for a free-tier single instance.
 */
async function getOrCreateCurrentCombo() {
  const now = new Date();
  let combo = await DailyCombo.findOne().sort({ createdAt: -1 });

  if (!combo || combo.activeUntil <= now) {
    combo = await DailyCombo.create({
      cardKeys: pickRandomKeys(WEIGHT_SYNC_SLOT_COUNT),
      bonusAmount: WEIGHT_SYNC_BONUS,
      activeUntil: new Date(now.getTime() + WEIGHT_SYNC_DURATION_HOURS * 60 * 60 * 1000),
    });
  }

  return combo;
}

/**
 * Ensures the user's dailyCombo progress is synced to the currently-active combo.
 * If the active combo has rotated since the user last interacted, their found
 * slots/claim state reset for the new combo.
 */
function syncUserToCombo(user, combo) {
  const currentComboId = String(combo._id);
  if (String(user.dailyCombo?.comboId || '') !== currentComboId) {
    user.dailyCombo = { comboId: combo._id, foundKeys: [], claimed: false };
  }
}

/**
 * Call this after a successful upgrade purchase. If the upgraded card is one
 * of today's secret picks and not already found, marks it found. If all slots
 * are now found and the bonus hasn't been paid yet, pays it out immediately.
 * Returns { slotFound: boolean, allFound: boolean, bonusAwarded: number }.
 */
async function applyUpgradeToWeightSync(user, upgradeKey) {
  const combo = await getOrCreateCurrentCombo();
  syncUserToCombo(user, combo);

  const result = { slotFound: false, allFound: false, bonusAwarded: 0 };

  if (!combo.cardKeys.includes(upgradeKey)) return result;
  if (user.dailyCombo.foundKeys.includes(upgradeKey)) return result; // already found

  user.dailyCombo.foundKeys.push(upgradeKey);
  result.slotFound = true;

  const allFound = combo.cardKeys.every((k) => user.dailyCombo.foundKeys.includes(k));
  if (allFound && !user.dailyCombo.claimed) {
    user.balance += combo.bonusAmount;
    user.dailyCombo.claimed = true;
    result.allFound = true;
    result.bonusAwarded = combo.bonusAmount;
  }

  return result;
}

/**
 * Read-only view for rendering the widget: which of the 3 slots are found
 * (icons revealed) vs still hidden, plus time remaining and the bonus amount.
 * Never reveals the un-found cards' identities to the client.
 */
async function getWeightSyncView(user) {
  const combo = await getOrCreateCurrentCombo();
  syncUserToCombo(user, combo);

  const slots = combo.cardKeys.map((key) => {
    const found = user.dailyCombo.foundKeys.includes(key);
    return found
      ? { found: true, key, name: UPGRADES[key]?.name, icon: UPGRADES[key]?.icon }
      : { found: false };
  });

  return {
    slots,
    claimed: user.dailyCombo.claimed,
    bonusAmount: combo.bonusAmount,
    activeUntil: combo.activeUntil,
  };
}

/**
 * Admin view — returns today's actual combo (not hidden), with card names,
 * for the admin dashboard's Weight Sync visibility section.
 */
async function getComboAdminView() {
  const combo = await getOrCreateCurrentCombo();
  return {
    comboId: combo._id,
    cardKeys: combo.cardKeys,
    cardNames: combo.cardKeys.map((k) => UPGRADES[k]?.name || k),
    bonusAmount: combo.bonusAmount,
    activeUntil: combo.activeUntil,
  };
}

/**
 * Admin override — replaces today's combo with an admin-chosen set of 3 cards,
 * keeping the same expiry window. User-side match detection and payout stay
 * fully automatic; this only changes which 3 cards are the secret picks.
 */
async function overrideCombo(cardKeys) {
  if (!Array.isArray(cardKeys) || cardKeys.length !== WEIGHT_SYNC_SLOT_COUNT) {
    throw new Error(`Must provide exactly ${WEIGHT_SYNC_SLOT_COUNT} card keys`);
  }
  const invalid = cardKeys.filter((k) => !UPGRADES[k]);
  if (invalid.length) throw new Error(`Unknown card key(s): ${invalid.join(', ')}`);

  const current = await getOrCreateCurrentCombo();
  current.cardKeys = cardKeys;
  await current.save();
  return current;
}

module.exports = {
  getOrCreateCurrentCombo,
  applyUpgradeToWeightSync,
  getWeightSyncView,
  getComboAdminView,
  overrideCombo,
};

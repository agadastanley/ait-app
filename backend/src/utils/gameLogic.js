const {
  BASE_TAP_VALUE,
  BASE_MAX_ENERGY,
  ENERGY_REGEN_PER_SECOND,
  UPGRADES,
  BASE_PASSIVE_RATE_PER_HOUR,
  MAX_OFFLINE_HOURS,
  UPGRADE_COOLDOWN_SECONDS,
  TIERS,
  BOOSTS,
} = require('./gameConfig');

// ---- Upgrade helpers ----

function getUpgradeEntry(user, key) {
  const entry = user.upgrades?.get ? user.upgrades.get(key) : user.upgrades?.[key];
  return entry || { level: 0, upgradeCount: 0, lastUpgradedAt: null };
}

function getUpgradeLevel(user, key) {
  return getUpgradeEntry(user, key).level || 0;
}

function getCardPPH(key, level) {
  const cfg = UPGRADES[key];
  if (!cfg) return 0;
  return level * cfg.pphPerLevel;
}

function sumCardsPPH(user) {
  let total = 0;
  for (const key of Object.keys(UPGRADES)) {
    total += getCardPPH(key, getUpgradeLevel(user, key));
  }
  return total;
}

function getUpgradeCost(key, currentLevel) {
  const cfg = UPGRADES[key];
  if (!cfg) return null;
  return Math.floor(cfg.baseCost * Math.pow(cfg.costMultiplier, currentLevel));
}

function checkUpgradeCooldown(user, key) {
  const entry = getUpgradeEntry(user, key);
  if (entry.upgradeCount === 0 || !entry.lastUpgradedAt) {
    return { allowed: true, remainingSeconds: 0 };
  }
  const requiredSeconds =
    entry.upgradeCount === 1 ? UPGRADE_COOLDOWN_SECONDS.afterFirst : UPGRADE_COOLDOWN_SECONDS.afterSecondPlus;
  const elapsedSeconds = (Date.now() - new Date(entry.lastUpgradedAt).getTime()) / 1000;
  const remaining = Math.max(0, requiredSeconds - elapsedSeconds);
  return { allowed: remaining <= 0, remainingSeconds: Math.ceil(remaining) };
}

// ---- Tier (driven by lifetime earned, never decreases) ----

function getTierInfo(lifetimeEarned) {
  let current = TIERS[0];
  let next = TIERS[1] || null;
  for (let i = 0; i < TIERS.length; i++) {
    if (lifetimeEarned >= TIERS[i].threshold) {
      current = TIERS[i];
      next = TIERS[i + 1] || null;
    }
  }
  const progress = next
    ? Math.min(1, (lifetimeEarned - current.threshold) / (next.threshold - current.threshold))
    : 1;
  return {
    number: current.number,
    name: current.name,
    nextName: next ? next.name : null,
    totalTiers: TIERS.length,
    progress, // 0-1
    amountToNext: next ? Math.max(0, next.threshold - lifetimeEarned) : 0,
  };
}

// Tap value and max energy grow slowly with tier (overall progress), rather
// than per-card, since every upgrade card now feeds PPH exclusively.
function getTapValue(user) {
  const tier = getTierInfo(user.lifetimeEarned || 0);
  return BASE_TAP_VALUE + Math.floor((tier.number - 1) / 2);
}

function getMaxEnergy(user) {
  const tier = getTierInfo(user.lifetimeEarned || 0);
  return BASE_MAX_ENERGY + (tier.number - 1) * 100;
}

// ---- Boosts ----

function getBoostStatus(user, boostId) {
  const cfg = BOOSTS[boostId];
  const b = user.boosts?.[boostId] || {};
  const now = Date.now();
  const active = b.activeUntil && new Date(b.activeUntil).getTime() > now;
  const onCooldown = b.availableAt && new Date(b.availableAt).getTime() > now;
  return {
    label: cfg.label,
    active,
    activeRemainingSeconds: active ? Math.ceil((new Date(b.activeUntil).getTime() - now) / 1000) : 0,
    ready: !active && !onCooldown,
    cooldownRemainingSeconds: onCooldown ? Math.ceil((new Date(b.availableAt).getTime() - now) / 1000) : 0,
  };
}

function getActiveBoostMultiplier(user) {
  const now = Date.now();
  let multiplier = 1;
  for (const boostId of Object.keys(BOOSTS)) {
    const b = user.boosts?.[boostId];
    if (b?.activeUntil && new Date(b.activeUntil).getTime() > now) {
      multiplier = Math.max(multiplier, BOOSTS[boostId].multiplier);
    }
  }
  return multiplier;
}

function getPassiveRatePerHour(user) {
  const base = BASE_PASSIVE_RATE_PER_HOUR + sumCardsPPH(user);
  return base * getActiveBoostMultiplier(user);
}

// ---- Energy / passive income / earnings ----

function applyEnergyRegen(user) {
  const now = Date.now();
  const maxEnergy = getMaxEnergy(user);
  const elapsedSeconds = Math.max(0, (now - new Date(user.lastEnergyUpdate).getTime()) / 1000);
  const regenerated = elapsedSeconds * ENERGY_REGEN_PER_SECOND;
  user.energy = Math.min(maxEnergy, user.energy + regenerated);
  user.lastEnergyUpdate = new Date(now);
  return user;
}

// Increments balance AND lifetimeEarned together — use this for every source
// of AiT (taps, passive income, missions, referral bonuses, weight sync) so
// tier progress always reflects total earned, never reduced by spending.
function applyEarning(user, amount) {
  if (amount <= 0) return user;
  user.balance += amount;
  user.lifetimeEarned = (user.lifetimeEarned || 0) + amount;
  return user;
}

function applyPassiveIncome(user) {
  const now = Date.now();
  const ratePerHour = getPassiveRatePerHour(user);
  if (ratePerHour > 0) {
    const elapsedHours = Math.min(
      MAX_OFFLINE_HOURS,
      Math.max(0, (now - new Date(user.lastActiveAt).getTime()) / (1000 * 60 * 60))
    );
    const earned = elapsedHours * ratePerHour;
    if (earned > 0) applyEarning(user, earned);
  }
  user.lastActiveAt = new Date(now);
  return user;
}

// ---- Public view ----

function upgradesToObject(user) {
  const out = {};
  const map = user.upgrades;
  if (!map) return out;
  const entries = map.entries ? map.entries() : Object.entries(map);
  for (const [key, val] of entries) {
    out[key] = {
      level: val.level || 0,
      upgradeCount: val.upgradeCount || 0,
      lastUpgradedAt: val.lastUpgradedAt || null,
    };
  }
  return out;
}

function publicUserView(user) {
  const tier = getTierInfo(user.lifetimeEarned || 0);
  return {
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    photoUrl: user.photoUrl || '',
    balance: Math.floor(user.balance),
    lifetimeEarned: Math.floor(user.lifetimeEarned || 0),
    energy: Math.floor(user.energy),
    maxEnergy: getMaxEnergy(user),
    regenRatePerSec: ENERGY_REGEN_PER_SECOND,
    lastSyncedAt: new Date().toISOString(),
    tapValue: getTapValue(user),
    passiveRatePerHour: getPassiveRatePerHour(user),
    upgrades: upgradesToObject(user),
    referralCode: user.referralCode,
    referralCount: user.referralCount,
    streakCount: user.streakCount,
    status: user.status,
    tier,
    boosts: {
      ten_min: getBoostStatus(user, 'ten_min'),
      one_hour: getBoostStatus(user, 'one_hour'),
    },
    dailyCombo: {
      comboId: user.dailyCombo?.comboId || null,
      foundKeys: user.dailyCombo?.foundKeys || [],
      claimed: user.dailyCombo?.claimed || false,
    },
  };
}

module.exports = {
  getUpgradeEntry,
  getUpgradeLevel,
  getCardPPH,
  sumCardsPPH,
  getUpgradeCost,
  checkUpgradeCooldown,
  getTierInfo,
  getTapValue,
  getMaxEnergy,
  getBoostStatus,
  getActiveBoostMultiplier,
  getPassiveRatePerHour,
  applyEnergyRegen,
  applyEarning,
  applyPassiveIncome,
  publicUserView,
};

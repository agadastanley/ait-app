const {
  BASE_TAP_VALUE,
  BASE_MAX_ENERGY,
  ENERGY_REGEN_PER_SECOND,
  UPGRADES,
  BASE_PASSIVE_RATE_PER_HOUR,
  MAX_OFFLINE_HOURS,
  UPGRADE_COOLDOWN_SECONDS,
  REFERRAL_TIERS,
} = require('./gameConfig');

// ---- Upgrade helpers (new shape: upgrades.get(key) => { level, upgradeCount, lastUpgradedAt }) ----

function getUpgradeEntry(user, key) {
  const entry = user.upgrades?.get ? user.upgrades.get(key) : user.upgrades?.[key];
  return entry || { level: 0, upgradeCount: 0, lastUpgradedAt: null };
}

function getUpgradeLevel(user, key) {
  return getUpgradeEntry(user, key).level || 0;
}

function sumEffect(user, effectName) {
  let total = 0;
  for (const [key, cfg] of Object.entries(UPGRADES)) {
    if (cfg.effect === effectName) {
      total += getUpgradeLevel(user, key) * cfg.effectPerLevel;
    }
  }
  return total;
}

function getTapValue(user) {
  return BASE_TAP_VALUE + sumEffect(user, 'tapValue');
}

function getMaxEnergy(user) {
  return BASE_MAX_ENERGY + sumEffect(user, 'maxEnergy');
}

function getPassiveRatePerHour(user) {
  return BASE_PASSIVE_RATE_PER_HOUR + sumEffect(user, 'passiveRate');
}

function getUpgradeCost(key, currentLevel) {
  const cfg = UPGRADES[key];
  if (!cfg) return null;
  return Math.floor(cfg.baseCost * Math.pow(cfg.costMultiplier, currentLevel));
}

/**
 * Server-authoritative cooldown check for a specific card.
 * Returns { allowed: boolean, remainingSeconds: number }.
 *   upgradeCount 0 -> no cooldown ever required (this would be the 1st upgrade)
 *   upgradeCount 1 -> 1 minute must have passed since lastUpgradedAt (2nd upgrade)
 *   upgradeCount 2+ -> 5 minutes must have passed since lastUpgradedAt (3rd+ upgrade)
 */
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

// ---- Energy / passive income ----

function applyEnergyRegen(user) {
  const now = Date.now();
  const maxEnergy = getMaxEnergy(user);
  const elapsedSeconds = Math.max(0, (now - new Date(user.lastEnergyUpdate).getTime()) / 1000);
  const regenerated = elapsedSeconds * ENERGY_REGEN_PER_SECOND;

  user.energy = Math.min(maxEnergy, user.energy + regenerated);
  user.lastEnergyUpdate = new Date(now);
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
    if (earned > 0) {
      user.balance += earned;
    }
  }
  user.lastActiveAt = new Date(now);
  return user;
}

// ---- Referral tiers (display-only labeling) ----

function getReferralTier(balance) {
  let tier = REFERRAL_TIERS[0].name;
  for (const t of REFERRAL_TIERS) {
    if (balance >= t.min) tier = t.name;
  }
  return tier;
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
  return {
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    balance: Math.floor(user.balance),
    energy: Math.floor(user.energy),
    maxEnergy: getMaxEnergy(user),
    tapValue: getTapValue(user),
    passiveRatePerHour: getPassiveRatePerHour(user),
    upgrades: upgradesToObject(user),
    referralCode: user.referralCode,
    referralCount: user.referralCount,
    streakCount: user.streakCount,
    status: user.status,
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
  getTapValue,
  getMaxEnergy,
  getPassiveRatePerHour,
  getUpgradeCost,
  checkUpgradeCooldown,
  applyEnergyRegen,
  applyPassiveIncome,
  getReferralTier,
  publicUserView,
};

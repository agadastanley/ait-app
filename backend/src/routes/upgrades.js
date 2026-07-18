const express = require('express');
const { telegramAuth } = require('../middleware/telegramAuth');
const { UPGRADES, CATEGORIES } = require('../utils/gameConfig');
const {
  getUpgradeEntry,
  getUpgradeCost,
  getCardPPH,
  checkUpgradeCooldown,
  publicUserView,
} = require('../utils/gameLogic');
const { applyUpgradeToWeightSync, getWeightSyncView } = require('../utils/weightSync');

const router = express.Router();

/**
 * GET /api/upgrades
 * Returns the full 39-card upgrade tree with per-user level/cost/cooldown and
 * each card's own PPH contribution (current level + what the next level adds).
 */
router.get('/', telegramAuth, async (req, res) => {
  const user = req.user;
  const list = Object.entries(UPGRADES).map(([key, cfg]) => {
    const entry = getUpgradeEntry(user, key);
    const cooldown = checkUpgradeCooldown(user, key);
    return {
      key,
      name: cfg.name,
      description: cfg.description,
      icon: cfg.icon,
      category: cfg.category,
      level: entry.level,
      maxLevel: cfg.maxLevel,
      nextCost: entry.level >= cfg.maxLevel ? null : getUpgradeCost(key, entry.level),
      currentPPH: getCardPPH(key, entry.level),
      nextLevelPPH: entry.level >= cfg.maxLevel ? null : getCardPPH(key, entry.level + 1),
      pphPerLevel: cfg.pphPerLevel,
      cooldownRemainingSeconds: cooldown.remainingSeconds,
    };
  });
  res.json({ upgrades: list, categories: CATEGORIES });
});

/**
 * GET /api/upgrades/weight-sync
 */
router.get('/weight-sync', telegramAuth, async (req, res) => {
  const view = await getWeightSyncView(req.user);
  await req.user.save();
  res.json(view);
});

/**
 * POST /api/upgrades/:key/buy
 */
router.post('/:key/buy', telegramAuth, async (req, res) => {
  try {
    const user = req.user;
    const { key } = req.params;
    const cfg = UPGRADES[key];

    if (!cfg) return res.status(404).json({ error: 'Unknown upgrade' });

    const entry = getUpgradeEntry(user, key);
    if (entry.level >= cfg.maxLevel) {
      return res.status(400).json({ error: 'Upgrade already at max level' });
    }

    const cooldown = checkUpgradeCooldown(user, key);
    if (!cooldown.allowed) {
      return res.status(429).json({
        error: 'This card is still cooling down',
        remainingSeconds: cooldown.remainingSeconds,
      });
    }

    const cost = getUpgradeCost(key, entry.level);
    if (user.balance < cost) {
      return res.status(400).json({ error: 'Insufficient AiT balance', cost });
    }

    user.balance -= cost; // spending never touches lifetimeEarned/tier
    if (!user.upgrades) user.upgrades = new Map();
    user.upgrades.set(key, {
      level: entry.level + 1,
      upgradeCount: entry.upgradeCount + 1,
      lastUpgradedAt: new Date(),
    });

    const weightSyncResult = await applyUpgradeToWeightSync(user, key);

    await user.save();
    res.json({ user: publicUserView(user), weightSync: weightSyncResult });
  } catch (err) {
    console.error('[upgrades/buy] error:', err.message);
    res.status(500).json({ error: 'Purchase failed' });
  }
});

module.exports = router;

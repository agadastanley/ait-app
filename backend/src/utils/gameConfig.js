// All game-balance numbers live here so they can be tuned without touching route logic.

// ---------------------------------------------------------------------------
// Model Upgrades — 5 categories, ~8 cards each (39 total). Every card boosts
// the SAME stat: passive AiT/hour ("profit per hour" / PPH). This matches how
// Hamster Kombat / Dropee-style upgrade trees work — the upgrade tree is the
// PPH engine; tap value and GPU Power capacity are simpler tier/base-driven
// stats, not per-card. That's what lets every card show its own PPH and have
// it visibly roll into the single aggregate Passive/Hr number.
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { key: 'compute', name: 'Compute', icon: '⚙️' },
  { key: 'architecture', name: 'Architecture', icon: '🧠' },
  { key: 'infra', name: 'Infra', icon: '🖧' },
  { key: 'data', name: 'Data', icon: '📊' },
  { key: 'specials', name: 'Specials', icon: '✦' },
];

const CARD_LISTS = {
  compute: [
    ['faster_inference', 'Faster Inference', 'Increases AiT earned per tap', '⚡'],
    ['more_gpus_compute', 'More GPUs', 'Adds raw tap throughput', '🎛️'],
    ['parallel_processing', 'Parallel Processing', 'Runs multiple inference streams at once', '🔀'],
    ['quantum_batching', 'Quantum Batching', 'Batches taps for higher yield', '🧬'],
    ['edge_caching', 'Edge Caching', 'Caches hot inference paths', '📦'],
    ['precision_tuning', 'Precision Tuning', 'Sharper outputs, more AiT per tap', '🎯'],
    ['cluster_scaling', 'Cluster Scaling', 'Scales inference across a cluster', '🗂️'],
    ['latency_reduction', 'Latency Reduction', 'Cuts response time, more taps register', '⏱️'],
  ],
  architecture: [
    ['larger_context', 'Larger Context Window', 'Increases max GPU Power capacity', '🪟'],
    ['deeper_layers', 'Deeper Layers', 'More layers, more capacity', '🧱'],
    ['attention_upgrade', 'Attention Upgrade', 'Better focus, larger capacity pool', '👁️'],
    ['mixture_of_experts', 'Mixture of Experts', 'Specialist sub-models expand capacity', '🧩'],
    ['sparse_activation', 'Sparse Activation', 'Efficient activation, bigger headroom', '🌌'],
    ['positional_encoding', 'Positional Encoding', 'Better structure, more capacity', '📐'],
    ['residual_connections', 'Residual Connections', 'Stabilizes and expands capacity', '🔗'],
    ['layer_norm_boost', 'Layer Norm Boost', 'Normalization headroom increase', '📈'],
  ],
  infra: [
    ['overclock', 'Overclock', 'Passive AiT/hour boost', '🔥'],
    ['cooling_system', 'Cooling System', 'Sustained passive output', '❄️'],
    ['power_grid_access', 'Power Grid Access', 'More stable passive throughput', '🔌'],
    ['redundant_nodes', 'Redundant Nodes', 'Backup nodes keep training going', '🖥️'],
    ['load_balancer', 'Load Balancer', 'Smooths and increases passive yield', '⚖️'],
    ['backup_generator', 'Backup Generator', 'Uptime insurance for passive income', '🔋'],
    ['rack_expansion', 'Rack Expansion', 'More racks, more passive AiT', '🗄️'],
    ['fiber_uplink', 'Fiber Uplink', 'Faster sync, higher passive rate', '🌐'],
  ],
  data: [
    ['curated_dataset', 'Curated Dataset', 'Higher quality training data', '🗃️'],
    ['synthetic_data_gen', 'Synthetic Data Gen', 'Generates extra training signal', '🧪'],
    ['rlhf_tuning', 'RLHF Tuning', 'Human-feedback tuning boosts yield', '🧑‍🏫'],
    ['active_learning_loop', 'Active Learning Loop', 'Learns from the highest-value data first', '🔁'],
    ['data_deduplication', 'Data Deduplication', 'Cleaner data, better throughput', '🧹'],
    ['label_quality_boost', 'Label Quality Boost', 'Better labels, better output', '🏷️'],
    ['feedback_loop', 'Feedback Loop', 'Continuous improvement loop', '🔃'],
    ['benchmark_suite', 'Benchmark Suite', 'Optimizes against benchmarks', '📋'],
  ],
  specials: [
    ['foundation_partnership', 'Foundation Partnership', 'Prestige-tier compute deal', '🤝'],
    ['open_source_release', 'Open Source Release', 'Community-driven gains', '📖'],
    ['research_grant', 'Research Grant', 'Funded research boosts output', '💰'],
    ['community_fine_tune', 'Community Fine-Tune', 'Crowd-tuned performance gains', '👥'],
    ['compute_grant', 'Compute Grant', 'Free compute, big PPH boost', '🎁'],
    ['model_merge', 'Model Merge', 'Merged checkpoints, stacked gains', '🧷'],
    ['flagship_release', 'Flagship Release', 'The big one — flagship-tier output', '🚀'],
  ],
};

function buildUpgrades() {
  const upgrades = {};
  CATEGORIES.forEach(({ key: catKey }) => {
    const cards = CARD_LISTS[catKey];
    cards.forEach(([key, name, description, icon], i) => {
      const tier = i + 1;
      const isSpecial = catKey === 'specials';
      upgrades[key] = {
        name,
        description,
        icon,
        category: catKey,
        baseCost: Math.round((isSpecial ? 5000 : 100) * Math.pow(1.6, tier - 1)),
        costMultiplier: isSpecial ? 1.22 : 1.15,
        pphPerLevel: isSpecial ? 400 * tier : Math.round(20 * (1 + tier * 0.2)), // AiT/hour added per level
        maxLevel: isSpecial ? 20 : 50,
      };
    });
  });
  return upgrades;
}

const UPGRADES = buildUpgrades();

// ---------------------------------------------------------------------------
// Tiers — driven by LIFETIME AiT earned (never decreases when the user
// spends on upgrades), so tier reflects overall progress/prestige rather
// than current spendable balance.
// ---------------------------------------------------------------------------
const TIER_NAMES = [
  'Seed Model', 'Prototype', 'Alpha Build', 'Beta Release', 'Stable Checkpoint',
  'Fine-Tuned', 'Optimized', 'Distilled', 'Multi-Modal', 'Instruction-Tuned',
  'Reasoning Model', 'Long-Context', 'Mixture of Experts', 'Frontier Candidate', 'Frontier Model',
  'State of the Art', 'Research Preview', 'Flagship', 'Superintelligent', 'AGI',
];
function buildTiers() {
  let threshold = 0;
  return TIER_NAMES.map((name, i) => {
    const tier = { number: i + 1, name, threshold };
    // Escalating thresholds — gentle early, steep later.
    threshold = i === 0 ? 1000 : Math.round(threshold * 1.9 + 500);
    return tier;
  });
}
const TIERS = buildTiers();

module.exports = {
  // --- Tap / Inference ---
  BASE_TAP_VALUE: 1,
  BASE_MAX_ENERGY: 500,
  ENERGY_REGEN_PER_SECOND: 1,
  MAX_TAPS_PER_SECOND: 10,

  CATEGORIES,
  UPGRADES,
  TIERS,

  // --- Escalating per-card upgrade cooldowns (server-authoritative) ---
  UPGRADE_COOLDOWN_SECONDS: {
    afterFirst: 60,
    afterSecondPlus: 300,
  },

  // --- Background Training (passive/offline income) ---
  BASE_PASSIVE_RATE_PER_HOUR: 0,
  MAX_OFFLINE_HOURS: 3,

  // --- Quick Boosts (Inference screen) — temporary PPH multipliers ---
  BOOSTS: {
    ten_min: { label: '10-Min Overdrive', durationSeconds: 600, cooldownSeconds: 2 * 60 * 60, multiplier: 2 },
    one_hour: { label: '1-Hour Overdrive', durationSeconds: 3600, cooldownSeconds: 8 * 60 * 60, multiplier: 2 },
  },

  // --- Referrals ("Expand the Neural Network") ---
  REFERRAL_BONUS_REFERRER: 500,
  REFERRAL_BONUS_REFEREE: 250,

  // --- Daily Training Bonus (login streaks) ---
  DAILY_BONUS_BASE: 100,
  DAILY_BONUS_PER_STREAK_DAY: 50,
  DAILY_BONUS_MAX_STREAK_DAYS: 10,
  STREAK_RESET_HOURS: 48,

  // --- Missions ("Training Tasks") ---
  MISSION_TYPES: ['telegram_join', 'x_follow', 'invite_friends', 'wallet_connect', 'custom_link', 'daily_checkin'],
  MISSION_CATEGORIES: ['social', 'engagement', 'verification', 'partner'],
  MISSION_CLAIM_DELAY_SECONDS: 45,

  // --- Daily Weight Sync ---
  WEIGHT_SYNC_SLOT_COUNT: 3,
  WEIGHT_SYNC_DURATION_HOURS: 24,
  WEIGHT_SYNC_BONUS: 200000,
};

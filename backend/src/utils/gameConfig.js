// All game-balance numbers live here so they can be tuned without touching route logic.

// ---------------------------------------------------------------------------
// Model Upgrades — 5 categories, ~8 cards each (Specials has 7), 39 cards total.
// Each category maps to one derived stat so gameLogic.js can sum levels cleanly:
//   compute      -> tapValue        ("Run Inference" gains per tap)
//   architecture -> maxEnergy       ("GPU Power" capacity)
//   infra        -> passiveRate     ("Background Training" AiT/hour)
//   data         -> passiveRate     (dataset/training quality also feeds passive income)
//   specials     -> tapValue        (flagship/prestige tier, larger per-level jumps)
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { key: 'compute', name: 'Compute', icon: '⚙️', effect: 'tapValue' },
  { key: 'architecture', name: 'Architecture', icon: '🧠', effect: 'maxEnergy' },
  { key: 'infra', name: 'Infra', icon: '🖧', effect: 'passiveRate' },
  { key: 'data', name: 'Data', icon: '📊', effect: 'passiveRate' },
  { key: 'specials', name: 'Specials', icon: '✦', effect: 'tapValue' },
];

// [key, name, description, icon]
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
    ['compute_grant', 'Compute Grant', 'Free compute, big per-tap boost', '🎁'],
    ['model_merge', 'Model Merge', 'Merged checkpoints, stacked gains', '🧷'],
    ['flagship_release', 'Flagship Release', 'The big one — flagship-tier output', '🚀'],
  ],
};

function buildUpgrades() {
  const upgrades = {};
  CATEGORIES.forEach(({ key: catKey, effect }) => {
    const cards = CARD_LISTS[catKey];
    cards.forEach(([key, name, description, icon], i) => {
      const tier = i + 1; // 1-indexed position within the category
      const isSpecial = catKey === 'specials';
      upgrades[key] = {
        name,
        description,
        icon,
        category: catKey,
        baseCost: Math.round((isSpecial ? 5000 : 100) * Math.pow(1.6, tier - 1)),
        costMultiplier: isSpecial ? 1.22 : 1.15,
        effect,
        effectPerLevel: isSpecial
          ? 5 * tier
          : Math.max(1, Math.round((effect === 'maxEnergy' ? 30 : effect === 'passiveRate' ? 8 : 1) * (1 + tier * 0.15))),
        maxLevel: isSpecial ? 20 : 50,
      };
    });
  });
  return upgrades;
}

const UPGRADES = buildUpgrades();

module.exports = {
  // --- Tap / Inference ---
  BASE_TAP_VALUE: 1,
  BASE_MAX_ENERGY: 500,
  ENERGY_REGEN_PER_SECOND: 1,
  MAX_TAPS_PER_SECOND: 10,

  CATEGORIES,
  UPGRADES,

  // --- Escalating per-card upgrade cooldowns (server-authoritative) ---
  //   upgradeCount 0 (about to become 1st upgrade) -> no cooldown
  //   upgradeCount 1 (about to become 2nd upgrade)  -> 1 minute
  //   upgradeCount 2+ (3rd upgrade onward)          -> 5 minutes
  UPGRADE_COOLDOWN_SECONDS: {
    afterFirst: 60,
    afterSecondPlus: 300,
  },

  // --- Background Training (passive/offline income) ---
  BASE_PASSIVE_RATE_PER_HOUR: 0,
  MAX_OFFLINE_HOURS: 3,

  // --- Referrals ("Expand the Neural Network") ---
  REFERRAL_BONUS_REFERRER: 500,
  REFERRAL_BONUS_REFEREE: 250,
  REFERRAL_TIERS: [
    { name: 'Node', min: 0 },
    { name: 'Cluster', min: 10000 },
    { name: 'Datacenter', min: 100000 },
    { name: 'Frontier', min: 1000000 },
  ],

  // --- Daily Training Bonus (login streaks) ---
  DAILY_BONUS_BASE: 100,
  DAILY_BONUS_PER_STREAK_DAY: 50,
  DAILY_BONUS_MAX_STREAK_DAYS: 10,
  STREAK_RESET_HOURS: 48,

  // --- Missions ("Training Tasks") ---
  MISSION_TYPES: ['telegram_join', 'x_follow', 'invite_friends', 'custom_link', 'daily_checkin'],
  MISSION_CLAIM_DELAY_SECONDS: 45,

  // --- Daily Weight Sync ---
  WEIGHT_SYNC_SLOT_COUNT: 3,
  WEIGHT_SYNC_DURATION_HOURS: 24,
  WEIGHT_SYNC_BONUS: 200000,
};

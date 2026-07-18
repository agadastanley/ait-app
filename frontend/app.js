// ---- Config ----
const API_BASE = window.AIT_API_BASE || 'https://ait-backend-fo4t.onrender.com/api';

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#07070d');
  tg.setBackgroundColor('#07070d');
}

const initData = tg?.initData || '';
const tgProfile = tg?.initDataUnsafe?.user || null;

// ---- State ----
let state = {
  user: null,
  upgrades: [],
  categories: [],
  activeCategory: 'compute',
  missions: [],
  activeMissionCategory: 'social',
  leaderboardBy: 'balance',
  leaderboard: [],
  leaderboardMe: null,
  pendingTaps: 0,
  weightSync: null,
  // Local energy-ticking state, synced from the server on every user update.
  energyBase: 0,
  energySyncedAt: Date.now(),
  regenRatePerSec: 1,
};

let tapFlushTimer = null;
let missionCountdownTimer = null;
let weightSyncTimer = null;
let energyTickTimer = null;
let boostCountdownTimer = null;

// ---- API helper ----
async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${path}`);
  return data;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function avatarInnerHtml(photoUrl, name) {
  if (photoUrl) return `<img src="${photoUrl}" alt="">`;
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return initial;
}

function avatarHtml(photoUrl, name, size) {
  const cls = size === 'lg' ? 'avatar avatar-lg' : 'avatar avatar-sm';
  return `<span class="${cls}">${avatarInnerHtml(photoUrl, name)}</span>`;
}

// ---- Render: profile header + user stats ----
function renderUser() {
  const u = state.user;
  if (!u) return;

  document.getElementById('balance-value').textContent = Math.floor(u.balance).toLocaleString();
  document.getElementById('tap-value').textContent = `+${u.tapValue}`;
  document.getElementById('passive-value').textContent = Math.floor(u.passiveRatePerHour).toLocaleString();
  document.getElementById('streak-value').textContent = `${u.streakCount}d`;

  const displayName = u.username || u.firstName || 'Node';
  document.getElementById('profile-name').textContent = displayName;
  document.getElementById('profile-avatar').innerHTML = avatarInnerHtml(u.photoUrl, displayName);

  // Tier
  const t = u.tier;
  document.getElementById('tier-name').textContent = t.name;
  document.getElementById('tier-fraction').textContent = `Tier ${t.number}/${t.totalTiers}`;
  document.getElementById('tier-fill').style.width = `${Math.round(t.progress * 100)}%`;
  document.getElementById('tier-amount-to-next').textContent = t.nextName
    ? `${Math.floor(t.amountToNext).toLocaleString()} AiT to ${t.nextName}`
    : 'Max tier reached';

  // Energy re-sync (local ticking picks this up)
  state.energyBase = u.energy;
  state.energySyncedAt = Date.now();
  state.regenRatePerSec = u.regenRatePerSec;
  state.maxEnergy = u.maxEnergy;
  renderEnergyDisplay();

  renderBoosts();
}

function renderEnergyDisplay() {
  const elapsed = (Date.now() - state.energySyncedAt) / 1000;
  const displayed = Math.min(state.maxEnergy, state.energyBase + elapsed * state.regenRatePerSec);
  document.getElementById('energy-value').textContent = Math.floor(displayed);
  document.getElementById('energy-max').textContent = state.maxEnergy;
  document.getElementById('energy-fill').style.width = `${(displayed / state.maxEnergy) * 100}%`;
}

function startEnergyTicker() {
  clearInterval(energyTickTimer);
  energyTickTimer = setInterval(renderEnergyDisplay, 1000);
}

// ---- Render: quick boosts ----
function renderBoosts() {
  const u = state.user;
  if (!u) return;
  ['ten_min', 'one_hour'].forEach((id) => {
    const b = u.boosts[id];
    const btn = document.querySelector(`[data-boost="${id}"]`);
    const stateEl = document.getElementById(`boost-${id}-state`);
    if (b.active) {
      stateEl.textContent = formatDuration(b.activeRemainingSeconds) + ' left';
      btn.disabled = true;
    } else if (!b.ready) {
      stateEl.textContent = 'Cooldown ' + formatDuration(b.cooldownRemainingSeconds);
      btn.disabled = true;
    } else {
      stateEl.textContent = 'Ready';
      btn.disabled = false;
    }
  });

  clearInterval(boostCountdownTimer);
  boostCountdownTimer = setInterval(() => {
    let changed = false;
    ['ten_min', 'one_hour'].forEach((id) => {
      const b = state.user?.boosts?.[id];
      if (!b) return;
      if (b.active && b.activeRemainingSeconds > 0) {
        b.activeRemainingSeconds -= 1;
        changed = true;
        if (b.activeRemainingSeconds <= 0) loadBoosts();
      } else if (!b.ready && b.cooldownRemainingSeconds > 0) {
        b.cooldownRemainingSeconds -= 1;
        changed = true;
        if (b.cooldownRemainingSeconds <= 0) loadBoosts();
      }
    });
    if (changed) renderBoosts();
  }, 1000);
}

async function loadBoosts() {
  try {
    const data = await api('/boosts');
    if (state.user) state.user.boosts = data;
    renderBoosts();
  } catch (err) {
    console.error(err);
  }
}

async function activateBoost(id) {
  try {
    const data = await api(`/boosts/${id}/activate`, { method: 'POST' });
    state.user = data.user;
    renderUser();
    showToast('Boost activated');
  } catch (err) {
    showToast(err.message);
  }
}

// ---- Render: category tabs (Upgrades) ----
function renderCategoryTabs() {
  const wrap = document.getElementById('category-tabs');
  wrap.innerHTML = '';
  state.categories.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'category-tab' + (cat.key === state.activeCategory ? ' active' : '');
    btn.textContent = `${cat.icon} ${cat.name}`;
    btn.addEventListener('click', () => {
      state.activeCategory = cat.key;
      renderCategoryTabs();
      renderUpgrades();
    });
    wrap.appendChild(btn);
  });
}

// ---- Render: upgrade cards ----
function renderUpgrades() {
  const list = document.getElementById('upgrades-list');
  list.innerHTML = '';
  const foundKeys = state.weightSync?.slots?.filter((s) => s.found).map((s) => s.key) || [];

  state.upgrades
    .filter((up) => up.category === state.activeCategory)
    .forEach((up) => {
      const card = document.createElement('div');
      card.className = 'card';
      const onCooldown = up.cooldownRemainingSeconds > 0;
      const synced = foundKeys.includes(up.key);

      card.innerHTML = `
        <div class="card-icon">${up.icon}</div>
        <div class="card-main">
          <div class="card-title">${up.name} ${synced ? '<span class="card-synced">SYNCED</span>' : ''}</div>
          <div class="card-sub">${up.description}</div>
          <div class="card-level">LV ${up.level}${up.maxLevel ? ' / ' + up.maxLevel : ''}</div>
          <div class="card-pph">+${up.currentPPH.toLocaleString()} AiT/hr${
        up.nextLevelPPH !== null ? ` → +${up.nextLevelPPH.toLocaleString()} AiT/hr next` : ' (max)'
      }</div>
          ${onCooldown ? `<div class="card-cooldown" data-cooldown="${up.key}">Cooling down: ${formatDuration(up.cooldownRemainingSeconds)}</div>` : ''}
        </div>
        <button class="btn-primary" ${up.nextCost === null || onCooldown ? 'disabled' : ''} data-key="${up.key}">
          ${up.nextCost === null ? 'MAX' : Math.floor(up.nextCost).toLocaleString()}
        </button>
      `;
      const btn = card.querySelector('button');
      if (!onCooldown) btn.addEventListener('click', () => buyUpgrade(up.key));
      list.appendChild(card);
    });

  startCooldownTicker();
}

function startCooldownTicker() {
  clearInterval(window._cooldownTickInterval);
  window._cooldownTickInterval = setInterval(() => {
    let anyChanged = false;
    state.upgrades.forEach((up) => {
      if (up.cooldownRemainingSeconds > 0) {
        up.cooldownRemainingSeconds -= 1;
        anyChanged = true;
        const el = document.querySelector(`[data-cooldown="${up.key}"]`);
        if (el) {
          if (up.cooldownRemainingSeconds <= 0) {
            renderUpgrades();
          } else {
            el.textContent = `Cooling down: ${formatDuration(up.cooldownRemainingSeconds)}`;
          }
        }
      }
    });
    if (!anyChanged) clearInterval(window._cooldownTickInterval);
  }, 1000);
}

// ---- Render: Daily Weight Sync (full widget + home mini widget) ----
function renderWeightSync() {
  const ws = state.weightSync;
  if (!ws) return;

  const wrap = document.getElementById('weight-sync');
  wrap.classList.toggle('claimed', ws.claimed);
  document.getElementById('ws-slots').innerHTML = ws.slots
    .map((s) => (s.found ? `<div class="ws-slot found" title="${s.name}">${s.icon}</div>` : `<div class="ws-slot">?</div>`))
    .join('');
  document.getElementById('ws-bonus').textContent = ws.bonusAmount.toLocaleString();

  document.getElementById('ws-mini-slots').innerHTML = ws.slots
    .map((s) => (s.found ? `<div class="ws-mini-slot found">${s.icon}</div>` : `<div class="ws-mini-slot">?</div>`))
    .join('');

  clearInterval(weightSyncTimer);
  const tick = () => {
    const remaining = (new Date(ws.activeUntil).getTime() - Date.now()) / 1000;
    const text = remaining > 0 ? formatDuration(remaining) : '00:00:00';
    document.getElementById('ws-timer').textContent = text;
    document.getElementById('ws-mini-timer').textContent = text;
  };
  tick();
  weightSyncTimer = setInterval(tick, 1000);
}

async function loadWeightSync() {
  try {
    state.weightSync = await api('/upgrades/weight-sync');
    renderWeightSync();
  } catch (err) {
    console.error(err);
  }
}

// ---- Render: missions (categorized) ----
const MISSION_CATEGORY_LABELS = { social: 'Social', engagement: 'Engagement', verification: 'Verification', partner: 'Partner' };

function renderMissionCategoryTabs() {
  const cats = [...new Set(state.missions.map((m) => m.category))];
  const wrap = document.getElementById('mission-category-tabs');
  wrap.innerHTML = '';
  cats.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'category-tab' + (cat === state.activeMissionCategory ? ' active' : '');
    btn.textContent = MISSION_CATEGORY_LABELS[cat] || cat;
    btn.addEventListener('click', () => {
      state.activeMissionCategory = cat;
      renderMissionCategoryTabs();
      renderMissionsList();
    });
    wrap.appendChild(btn);
  });
  if (!cats.includes(state.activeMissionCategory) && cats.length) state.activeMissionCategory = cats[0];
}

function renderMissionsList() {
  const list = document.getElementById('missions-list');
  list.innerHTML = '';
  state.missions
    .filter((m) => m.category === state.activeMissionCategory)
    .forEach((m) => {
      const card = document.createElement('div');
      card.className = 'card';

      let actionHtml;
      if (m.completed) {
        actionHtml = '<span class="badge-done">DONE</span>';
      } else if (m.type === 'telegram_join' && m.started) {
        actionHtml =
          m.claimReadyInSeconds > 0
            ? `<button class="btn-secondary" disabled data-countdown="${m.id}">${m.claimReadyInSeconds}s</button>`
            : `<button class="btn-primary" data-claim="${m.id}">Claim</button>`;
      } else if (m.type === 'telegram_join') {
        actionHtml = `<button class="btn-primary" data-start="${m.id}">Start</button>`;
      } else {
        actionHtml = `<button class="btn-primary" data-claim="${m.id}">${m.type === 'daily_checkin' ? 'CLAIM' : 'GO'}</button>`;
      }

      card.innerHTML = `
        <div class="card-main">
          <div class="card-title">${m.title}</div>
          <div class="card-sub">${m.description || ''} · <span class="gold">+${m.reward}</span> AiT</div>
        </div>
        ${actionHtml}
      `;

      const startBtn = card.querySelector('[data-start]');
      if (startBtn) startBtn.addEventListener('click', () => startMission(m));
      const claimBtn = card.querySelector('[data-claim]');
      if (claimBtn) claimBtn.addEventListener('click', () => completeMission(m));

      list.appendChild(card);
    });

  startMissionCountdownTicker();
}

function startMissionCountdownTicker() {
  clearInterval(missionCountdownTimer);
  missionCountdownTimer = setInterval(() => {
    let needsReload = false;
    state.missions.forEach((m) => {
      if (m.type === 'telegram_join' && m.started && m.claimReadyInSeconds > 0) {
        m.claimReadyInSeconds -= 1;
        if (m.claimReadyInSeconds <= 0) needsReload = true;
        const el = document.querySelector(`[data-countdown="${m.id}"]`);
        if (el) el.textContent = `${m.claimReadyInSeconds}s`;
      }
    });
    if (needsReload) renderMissionsList();
  }, 1000);
}

async function startMission(mission) {
  try {
    await api(`/missions/${mission.id}/start`, { method: 'POST' });
    if (mission.url) tg?.openLink ? tg.openLink(mission.url) : window.open(mission.url, '_blank');
    await loadMissions();
  } catch (err) {
    showToast(err.message);
  }
}

async function completeMission(mission) {
  if (mission.type !== 'daily_checkin' && mission.type !== 'telegram_join' && mission.url) {
    tg?.openLink ? tg.openLink(mission.url) : window.open(mission.url, '_blank');
  }
  try {
    const data = await api(`/missions/${mission.id}/complete`, { method: 'POST' });
    state.user = data.user;
    renderUser();
    await loadMissions();
    showToast(`+${data.rewardGranted} AiT`);
  } catch (err) {
    showToast(err.message);
  }
}

// ---- Render: leaderboard ----
function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = '';
  state.leaderboard.forEach((row) => {
    const el = document.createElement('div');
    const rankClass = row.rank <= 3 ? ` rank-${row.rank}` : '';
    el.className = 'leaderboard-row' + rankClass;
    el.innerHTML = `
      <span class="lb-rank">${row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : '#' + row.rank}</span>
      ${avatarHtml(row.photoUrl, row.username, 'sm')}
      <span class="lb-name">${row.username}</span>
      <span class="lb-balance gold">${row.value.toLocaleString()}</span>
    `;
    list.appendChild(el);
  });

  const meEl = document.getElementById('leaderboard-me');
  if (state.leaderboardMe) {
    const r = state.leaderboardMe;
    const alreadyShown = state.leaderboard.some((row) => row.telegramId === r.telegramId);
    meEl.innerHTML = alreadyShown
      ? ''
      : `
      <div class="leaderboard-row me">
        <span class="lb-rank">#${r.rank}</span>
        ${avatarHtml(r.photoUrl, r.username, 'sm')}
        <span class="lb-name">${r.username} (you)</span>
        <span class="lb-balance gold">${r.value.toLocaleString()}</span>
      </div>`;
  }

  // Tier card on Ranks screen mirrors the home tier panel
  if (state.user) {
    const t = state.user.tier;
    document.getElementById('lb-tier-name').textContent = t.name;
    document.getElementById('lb-tier-fraction').textContent = `Tier ${t.number}/${t.totalTiers}`;
    document.getElementById('lb-tier-fill').style.width = `${Math.round(t.progress * 100)}%`;
    document.getElementById('lb-tier-amount').textContent = t.nextName
      ? `${Math.floor(t.amountToNext).toLocaleString()} AiT to ${t.nextName}`
      : 'Max tier reached';
  }
}

async function loadLeaderboard() {
  const data = await api(`/leaderboard?by=${state.leaderboardBy}`);
  state.leaderboard = data.leaderboard;
  state.leaderboardMe = data.myRow;
  renderLeaderboard();
}

// ---- Render: referral / network ----
function renderReferral(data) {
  document.getElementById('ref-total-nodes').textContent = data.totalNodes;
  document.getElementById('ref-active-today').textContent = data.activeToday;
  document.getElementById('ref-total-earned').textContent = data.totalEarnedFromNetwork.toLocaleString();
  document.getElementById('invited-by').textContent = data.invitedBy ? `Invited by: ${data.invitedBy}` : '';

  const list = document.getElementById('referral-list');
  if (!data.invited.length) {
    list.innerHTML = '<div class="empty-state">No nodes connected yet — share your invite link.</div>';
    return;
  }
  list.innerHTML = data.invited
    .map(
      (u) => `
    <div class="referral-row">
      ${avatarHtml(u.photoUrl, u.username, 'sm')}
      <span class="name">${u.username}</span>
      <span class="tier">${u.tier}</span>
      <span class="contribution gold">${u.contribution.toLocaleString()}</span>
    </div>`
    )
    .join('');
}

// ---- Render: profile view ----
function renderProfileView() {
  const u = state.user;
  if (!u) return;
  const displayName = u.username || u.firstName || 'Node';
  document.getElementById('profile-view-avatar').innerHTML = avatarInnerHtml(u.photoUrl, displayName);
  document.getElementById('profile-view-name').textContent = displayName;
  document.getElementById('profile-view-tier').textContent = `${u.tier.name} · Tier ${u.tier.number}/${u.tier.totalTiers}`;
  document.getElementById('profile-lifetime').textContent = u.lifetimeEarned.toLocaleString();
  document.getElementById('profile-streak').textContent = `${u.streakCount}d`;
  document.getElementById('profile-referrals').textContent = u.referralCount;
}

// ---- Tap actions ----
function spawnFloater(x, y) {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = `+${state.user?.tapValue || 1}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.getElementById('app').appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function handleTap(e) {
  const displayedEnergy = state.energyBase + ((Date.now() - state.energySyncedAt) / 1000) * state.regenRatePerSec;
  if (!state.user || displayedEnergy < 1) return;

  state.energyBase = Math.max(0, displayedEnergy - 1);
  state.energySyncedAt = Date.now();
  state.user.balance += state.user.tapValue;
  state.pendingTaps += 1;
  document.getElementById('balance-value').textContent = Math.floor(state.user.balance).toLocaleString();
  renderEnergyDisplay();

  const rect = e.currentTarget.getBoundingClientRect();
  const x = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left + rect.left;
  const y = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top + rect.top - 20;
  spawnFloater(x, y);

  const ring = e.currentTarget.parentElement.querySelector('.tap-pulse');
  if (ring) {
    ring.classList.remove('animate');
    void ring.offsetWidth;
    ring.classList.add('animate');
  }

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

  clearTimeout(tapFlushTimer);
  tapFlushTimer = setTimeout(flushTaps, 400);
}

async function flushTaps() {
  if (state.pendingTaps === 0) return;
  const taps = state.pendingTaps;
  state.pendingTaps = 0;
  try {
    const data = await api('/tap', { method: 'POST', body: JSON.stringify({ taps }) });
    state.user = data.user;
    renderUser();
  } catch (err) {
    showToast(err.message);
  }
}

async function buyUpgrade(key) {
  try {
    const data = await api(`/upgrades/${key}/buy`, { method: 'POST' });
    state.user = data.user;
    renderUser();
    await loadUpgrades();
    await loadWeightSync();
    if (data.weightSync?.allFound) {
      showToast(`Weight Sync complete! +${data.weightSync.bonusAwarded.toLocaleString()} AiT`);
    } else if (data.weightSync?.slotFound) {
      showToast('Weight Sync slot found!');
    } else {
      showToast('Upgrade installed');
    }
  } catch (err) {
    showToast(err.message);
  }
}

async function copyReferralLink() {
  try {
    const data = await api('/referral/me');
    const link = data.referralLink || data.referralCode;
    await navigator.clipboard.writeText(link);
    showToast('Invite link copied');
  } catch (err) {
    showToast(err.message);
  }
}

// ---- Loaders ----
async function loadUpgrades() {
  const data = await api('/upgrades');
  state.upgrades = data.upgrades;
  state.categories = data.categories;
  renderCategoryTabs();
  renderUpgrades();
}

async function loadMissions() {
  const data = await api('/missions');
  state.missions = data.missions;
  renderMissionCategoryTabs();
  renderMissionsList();
}

async function loadReferral() {
  const data = await api('/referral/me');
  renderReferral(data);
}

// ---- Navigation ----
function switchView(viewId) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === viewId));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === viewId));

  if (viewId === 'view-upgrades') {
    loadUpgrades();
    loadWeightSync();
  }
  if (viewId === 'view-missions') loadMissions();
  if (viewId === 'view-leaderboard') loadLeaderboard();
  if (viewId === 'view-referral') loadReferral();
  if (viewId === 'view-profile') renderProfileView();
}

// ---- Init ----
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const referralCode = urlParams.get('ref') || tg?.initDataUnsafe?.start_param;

  document.getElementById('tap-core').addEventListener('click', handleTap);
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('copy-referral').addEventListener('click', copyReferralLink);
  document.getElementById('profile-btn').addEventListener('click', () => switchView('view-profile'));
  document.getElementById('profile-back').addEventListener('click', () => switchView('view-main'));
  document.getElementById('home-weight-sync').addEventListener('click', () => switchView('view-upgrades'));
  document.querySelectorAll('.boost-btn').forEach((btn) => {
    btn.addEventListener('click', () => activateBoost(btn.dataset.boost));
  });
  document.querySelectorAll('#leaderboard-tabs .category-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.leaderboardBy = btn.dataset.lb;
      document.querySelectorAll('#leaderboard-tabs .category-tab').forEach((b) => b.classList.toggle('active', b === btn));
      loadLeaderboard();
    });
  });

  const core = document.getElementById('tap-core');
  const pulse = document.createElement('span');
  pulse.className = 'tap-pulse';
  core.parentElement.appendChild(pulse);

  if (!initData) {
    showToast('Open this from the Telegram bot, not a direct link.');
    return;
  }

  const MAX_ATTEMPTS = 6;
  const DELAYS_MS = [0, 3000, 6000, 10000, 15000, 20000];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      showToast('Connecting to AiT servers — this can take a bit on first load…');
      await new Promise((r) => setTimeout(r, DELAYS_MS[attempt]));
    }
    try {
      const data = await api('/auth/telegram', {
        method: 'POST',
        body: JSON.stringify({ initData, referralCode }),
      });
      state.user = data.user;
      renderUser();
      startEnergyTicker();
      loadWeightSync();

      setInterval(async () => {
        if (state.pendingTaps > 0) return;
        try {
          const data = await api('/auth/me');
          state.user = data.user;
          renderUser();
        } catch {
          /* silent — next tick will retry */
        }
      }, 15000);

      return;
    } catch (err) {
      console.error(`[init] auth attempt ${attempt + 1} failed:`, err);
      if (attempt === MAX_ATTEMPTS - 1) {
        showToast('Could not reach AiT servers — check your connection and reopen the app.');
      }
    }
  }
}

init();

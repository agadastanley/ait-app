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

// ---- State ----
let state = {
  user: null,
  upgrades: [],
  categories: [],
  activeCategory: 'compute',
  missions: [],
  leaderboard: [],
  pendingTaps: 0,
  weightSync: null,
};

let tapFlushTimer = null;
let missionCountdownTimer = null;
let weightSyncTimer = null;

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

// ---- Render: user stats ----
function renderUser() {
  const u = state.user;
  if (!u) return;
  document.getElementById('balance-value').textContent = Math.floor(u.balance).toLocaleString();
  document.getElementById('energy-value').textContent = Math.floor(u.energy);
  document.getElementById('energy-max').textContent = u.maxEnergy;
  document.getElementById('energy-fill').style.width = `${(u.energy / u.maxEnergy) * 100}%`;
  document.getElementById('tap-value').textContent = `+${u.tapValue}`;
  document.getElementById('passive-value').textContent = u.passiveRatePerHour;
  document.getElementById('streak-value').textContent = `${u.streakCount}d`;
  document.getElementById('referral-count').textContent = u.referralCount;
}

// ---- Render: category tabs ----
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

// ---- Render: upgrade cards (filtered by active category) ----
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

// Ticks visible cooldown labels down locally between server refreshes, purely
// for display — the server re-validates the real remaining time on every buy.
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
            renderUpgrades(); // re-render so the button re-enables
          } else {
            el.textContent = `Cooling down: ${formatDuration(up.cooldownRemainingSeconds)}`;
          }
        }
      }
    });
    if (!anyChanged) clearInterval(window._cooldownTickInterval);
  }, 1000);
}

// ---- Render: Daily Weight Sync widget ----
function renderWeightSync() {
  const ws = state.weightSync;
  if (!ws) return;
  const wrap = document.getElementById('weight-sync');
  wrap.classList.toggle('claimed', ws.claimed);

  const slotsEl = document.getElementById('ws-slots');
  slotsEl.innerHTML = ws.slots
    .map((s) => (s.found ? `<div class="ws-slot found" title="${s.name}">${s.icon}</div>` : `<div class="ws-slot">?</div>`))
    .join('');

  document.getElementById('ws-bonus').textContent = ws.bonusAmount.toLocaleString();

  clearInterval(weightSyncTimer);
  const tick = () => {
    const remaining = (new Date(ws.activeUntil).getTime() - Date.now()) / 1000;
    document.getElementById('ws-timer').textContent = remaining > 0 ? formatDuration(remaining) : '00:00:00';
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

// ---- Render: missions ----
function renderMissions() {
  const list = document.getElementById('missions-list');
  list.innerHTML = '';
  state.missions.forEach((m) => {
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
    if (needsReload) renderMissions();
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
    el.className = 'leaderboard-row' + (row.username === state.user?.username ? ' me' : '');
    el.innerHTML = `
      <span class="lb-rank">#${row.rank}</span>
      <span class="lb-name">${row.username}</span>
      <span class="lb-balance gold">${row.balance.toLocaleString()}</span>
    `;
    list.appendChild(el);
  });
}

// ---- Render: referral / network ----
function renderReferral(data) {
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
      <span class="name">${u.username}</span>
      <span class="tier">${u.tier}</span>
      <span class="contribution gold">${u.contribution.toLocaleString()}</span>
    </div>`
    )
    .join('');
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
  if (!state.user || state.user.energy < 1) return;

  state.user.energy = Math.max(0, state.user.energy - 1);
  state.user.balance += state.user.tapValue;
  state.pendingTaps += 1;
  renderUser();

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
  renderMissions();
}

async function loadLeaderboard() {
  const data = await api('/leaderboard');
  state.leaderboard = data.leaderboard;
  renderLeaderboard();
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
}

// ---- Init ----
async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const referralCode = urlParams.get('ref') || tg?.initDataUnsafe?.start_param;

  // Attach navigation + tap listeners up front, so the app is never fully
  // unresponsive even while we're still connecting or retrying below.
  document.getElementById('tap-core').addEventListener('click', handleTap);
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('copy-referral').addEventListener('click', copyReferralLink);

  const core = document.getElementById('tap-core');
  const pulse = document.createElement('span');
  pulse.className = 'tap-pulse';
  core.parentElement.appendChild(pulse);

  if (!initData) {
    // This is the one case where "open this from the Telegram bot" is actually
    // the correct diagnosis — there's no Telegram session at all (e.g. the raw
    // Vercel URL was opened directly in a normal browser tab).
    showToast('Open this from the Telegram bot, not a direct link.');
    return;
  }

  // Render's free tier spins down when idle — the first request after a
  // while can take 30-60s. Retry with backoff instead of failing once and
  // leaving the app looking dead; only show an error after real repeated failures.
  const MAX_ATTEMPTS = 6;
  const DELAYS_MS = [0, 3000, 6000, 10000, 15000, 20000]; // ~54s total worst case

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

      return; // connected successfully
    } catch (err) {
      console.error(`[init] auth attempt ${attempt + 1} failed:`, err);
      if (attempt === MAX_ATTEMPTS - 1) {
        showToast('Could not reach AiT servers — check your connection and reopen the app.');
      }
    }
  }
}

init();

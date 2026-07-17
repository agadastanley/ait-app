const API_BASE = window.AIT_ADMIN_API_BASE || 'https://your-ait-backend.onrender.com/api/admin';

let token = localStorage.getItem('ait_admin_token') || null;

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) logout();
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// ---- Auth ----
function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  loadStats();
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
}

function logout() {
  token = null;
  localStorage.removeItem('ait_admin_token');
  showLogin();
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    token = data.token;
    localStorage.setItem('ait_admin_token', token);
    showDashboard();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

// ---- Tabs ----
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tabId}`));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabId));

  if (tabId === 'stats') loadStats();
  if (tabId === 'users') loadUsers();
  if (tabId === 'missions') loadMissions();
  if (tabId === 'audit') loadAuditLog();
}

// ---- Stats ----
async function loadStats() {
  const data = await api('/stats');
  const grid = document.getElementById('stat-grid');
  grid.innerHTML = `
    <div class="stat-card"><div class="label">Total Users</div><div class="value">${data.totalUsers.toLocaleString()}</div></div>
    <div class="stat-card"><div class="label">Active</div><div class="value">${data.activeUsers.toLocaleString()}</div></div>
    <div class="stat-card"><div class="label">Banned</div><div class="value">${data.bannedUsers.toLocaleString()}</div></div>
    <div class="stat-card"><div class="label">AiT in Circulation</div><div class="value">${data.totalAiTInCirculation.toLocaleString()}</div></div>
  `;
  const tbody = document.querySelector('#top-users-table tbody');
  tbody.innerHTML = data.mostActiveUsers
    .map((u) => `<tr><td>${u.telegramId}</td><td>${u.username || '—'}</td><td>${u.balance.toLocaleString()}</td></tr>`)
    .join('');
}

// ---- Users ----
async function loadUsers() {
  const search = document.getElementById('user-search').value.trim();
  const status = document.getElementById('user-status-filter').value;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);

  const data = await api(`/users?${params.toString()}`);
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = data.users
    .map(
      (u) => `
    <tr>
      <td>${u.telegramId}</td>
      <td>${u.username || '—'}</td>
      <td>${u.balance.toLocaleString()}</td>
      <td class="status-${u.status}">${u.status}</td>
      <td>${u.referralCount}</td>
      <td>
        <button class="btn-secondary btn-small" onclick="openBalanceModal('${u.telegramId}')">Adjust</button>
        <button class="btn-secondary btn-small" onclick="openStatusModal('${u.telegramId}', '${u.status}')">Status</button>
        <button class="btn-secondary btn-small" onclick="openFlagModal('${u.telegramId}', ${!!u.flagged})">${u.flagged ? 'Unflag' : 'Flag'}</button>
      </td>
    </tr>`
    )
    .join('');
}

function openBalanceModal(telegramId) {
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <h3>Adjust Balance — ${telegramId}</h3>
    <label>Amount (use negative to deduct)</label>
    <input type="number" id="modal-amount" placeholder="e.g. 500 or -500" />
    <label>Reason (required, logged to audit trail)</label>
    <textarea id="modal-reason" rows="3" placeholder="Why is this adjustment being made?"></textarea>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitBalanceAdjust('${telegramId}')">Apply</button>
    </div>
  `;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

async function submitBalanceAdjust(telegramId) {
  const amount = Number(document.getElementById('modal-amount').value);
  const reason = document.getElementById('modal-reason').value.trim();
  if (!reason) return alert('A reason is required for the audit log.');

  try {
    await api(`/users/${telegramId}/adjust-balance`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    });
    closeModal();
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

function openStatusModal(telegramId, currentStatus) {
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <h3>Change Status — ${telegramId}</h3>
    <label>New status</label>
    <select id="modal-status">
      <option value="active" ${currentStatus === 'active' ? 'selected' : ''}>Active</option>
      <option value="frozen" ${currentStatus === 'frozen' ? 'selected' : ''}>Frozen</option>
      <option value="banned" ${currentStatus === 'banned' ? 'selected' : ''}>Banned</option>
    </select>
    <label><input type="checkbox" id="modal-reset-balance" style="width:auto;display:inline-block;margin-right:6px;" />Reset balance to 0</label>
    <label>Reason (required, logged to audit trail)</label>
    <textarea id="modal-reason" rows="3" placeholder="Why is this status change being made?"></textarea>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitStatusChange('${telegramId}')">Apply</button>
    </div>
  `;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

async function submitStatusChange(telegramId) {
  const status = document.getElementById('modal-status').value;
  const resetBalance = document.getElementById('modal-reset-balance').checked;
  const reason = document.getElementById('modal-reason').value.trim();
  if (!reason) return alert('A reason is required for the audit log.');

  try {
    await api(`/users/${telegramId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, resetBalance, reason }),
    });
    closeModal();
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

function openFlagModal(telegramId, currentlyFlagged) {
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <h3>${currentlyFlagged ? 'Unflag' : 'Flag'} — ${telegramId}</h3>
    <p style="color:var(--text-lo);font-size:12px;">Use this for accounts suspected of abusing self-reported missions (e.g. claiming an X-follow task without actually following).</p>
    <label>Note</label>
    <textarea id="modal-flag-note" rows="3" placeholder="Why is this account being flagged/unflagged?"></textarea>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitFlag('${telegramId}', ${!currentlyFlagged})">Apply</button>
    </div>
  `;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

async function submitFlag(telegramId, newFlaggedValue) {
  const note = document.getElementById('modal-flag-note').value.trim();
  try {
    await api(`/users/${telegramId}/flag`, {
      method: 'POST',
      body: JSON.stringify({ flagged: newFlaggedValue, note }),
    });
    closeModal();
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
}

// ---- Missions (link-only editor — the mission list itself is fixed) ----
async function loadMissions() {
  const data = await api('/missions');
  const tbody = document.getElementById('missions-table-body');
  tbody.innerHTML = data.missions
    .map(
      (m) => `
    <tr>
      <td>${m.title}</td>
      <td>${m.type}</td>
      <td>${m.reward}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.url || '—'}</td>
      <td>
        ${
          ['telegram_join', 'x_follow', 'custom_link'].includes(m.type)
            ? `<button class="btn-secondary btn-small" onclick='openLinkModal(${JSON.stringify({ id: m._id, title: m.title, url: m.url || '' })})'>Edit Link</button>`
            : '—'
        }
      </td>
    </tr>`
    )
    .join('');
}

function openLinkModal(mission) {
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <h3>Edit Link — ${mission.title}</h3>
    <label>Destination URL</label>
    <input id="m-url" value="${mission.url}" placeholder="https://t.me/yourchannel or https://x.com/yourhandle" />
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="submitLink('${mission.id}')">Save</button>
    </div>
  `;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

async function submitLink(id) {
  const url = document.getElementById('m-url').value.trim();
  try {
    await api(`/missions/${id}/link`, { method: 'PATCH', body: JSON.stringify({ url }) });
    closeModal();
    loadMissions();
  } catch (err) {
    alert(err.message);
  }
}

// ---- Audit log ----
async function loadAuditLog() {
  const data = await api('/audit-log');
  const tbody = document.getElementById('audit-table-body');
  tbody.innerHTML = data.logs
    .map(
      (l) => `
    <tr>
      <td>${new Date(l.createdAt).toLocaleString()}</td>
      <td>${l.adminIdentifier}</td>
      <td>${l.action}</td>
      <td>${l.targetTelegramId || '—'}</td>
      <td>${l.reason || '—'}</td>
    </tr>`
    )
    .join('');
}

// ---- Wire up ----
document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('user-search-btn').addEventListener('click', loadUsers);
document.getElementById('modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') closeModal();
});
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

if (token) {
  showDashboard();
} else {
  showLogin();
}

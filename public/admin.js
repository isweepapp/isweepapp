'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────────
function showAlert(el, type, msg) {
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideAlert(el) { el.classList.add('hidden'); }

async function adminFetch(url, opts = {}) {
  const r = await fetch(url, { credentials: 'same-origin', ...opts });
  return r;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
const loginSection = document.getElementById('login-section');
const adminPanel   = document.getElementById('admin-panel');
const loginAlert   = document.getElementById('login-alert');

async function checkAuth() {
  const r = await adminFetch('/api/admin/check');
  if (r.ok) showPanel();
  else      showLogin();
}

function showLogin() {
  loginSection.classList.remove('hidden');
  adminPanel.classList.add('hidden');
}

function showPanel() {
  loginSection.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  loadParticipants();
  loadMoneyTable();
  loadAdminMatches();
  loadGroupFinishes();
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert(loginAlert);
  const password = document.getElementById('password').value;
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    const r = await adminFetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const d = await r.json();
    if (!r.ok) { showAlert(loginAlert, 'error', d.error || 'Invalid password.'); return; }
    showPanel();
  } catch { showAlert(loginAlert, 'error', 'Network error.'); }
  finally  { btn.disabled = false; btn.textContent = 'Log In'; }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await adminFetch('/api/admin/logout', { method: 'POST' });
  showLogin();
});

// ── Participants ──────────────────────────────────────────────────────────────
async function loadParticipants() {
  const tbody = document.getElementById('admin-ptbody');
  try {
    const r = await adminFetch('/api/admin/participants');
    const rows = await r.json();
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-muted" style="padding:0.75rem">No entries yet.</td></tr>'; return; }
    tbody.innerHTML = rows.map((p, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.email)}</td>
      <td>${esc(p.known_by || '—')}</td>
      <td>${p.total_entries}</td>
      <td>£${p.amount_due}</td>
      <td>${p.tiebreak_guess ?? '—'}</td>
    </tr>`).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="7" class="text-muted" style="padding:0.75rem">Failed to load.</td></tr>'; }
}

// ── Money Table ───────────────────────────────────────────────────────────────
async function loadMoneyTable() {
  const tbody = document.getElementById('money-tbody');
  try {
    const r = await adminFetch('/api/admin/money');
    const rows = await r.json();
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="padding:0.75rem">No entries.</td></tr>'; return; }
    tbody.innerHTML = rows.map((row, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(row.email)}</td>
      <td>${row.teams.map(esc).join(', ')}</td>
      <td>${row.total_draws}</td>
      <td>£${row.total_due}</td>
      <td>
        <span class="paid-badge ${row.paid ? 'paid-yes' : 'paid-no'}">${row.paid ? '✓ Paid' : '✗ Owed'}</span>
        <button class="btn btn-outline btn-sm" style="margin-left:0.5rem"
          onclick="togglePaid('${esc(row.email)}', ${!row.paid}, this)">
          ${row.paid ? 'Mark Unpaid' : 'Mark Paid'}
        </button>
      </td>
    </tr>`).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="6" class="text-muted" style="padding:0.75rem">Failed to load.</td></tr>'; }
}

async function togglePaid(email, paid, btn) {
  btn.disabled = true;
  try {
    await adminFetch('/api/admin/money/paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, paid }),
    });
    loadMoneyTable();
  } finally { btn.disabled = false; }
}

// ── Admin match editor ────────────────────────────────────────────────────────
const STAGE_ORDER = [
  'Group A','Group B','Group C','Group D','Group E','Group F',
  'Group G','Group H','Group I','Group J','Group K','Group L',
  'Round of 32','Round of 16','Quarter-final','Semi-final','Third Place','Final'
];

async function loadAdminMatches() {
  const container = document.getElementById('admin-matches-list');
  try {
    const r = await adminFetch('/api/admin/matches');
    if (!r.ok) throw new Error();
    const matches = await r.json();
    if (!matches.length) { container.innerHTML = '<p class="text-muted">No matches yet.</p>'; return; }

    const byStage = {};
    matches.forEach(m => {
      if (!byStage[m.stage]) byStage[m.stage] = [];
      byStage[m.stage].push(m);
    });

    const stages = Object.keys(byStage).sort((a, b) => {
      const ia = STAGE_ORDER.indexOf(a), ib = STAGE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    container.innerHTML = stages.map(stage => {
      const ms = byStage[stage].sort((a, b) => new Date(a.date) - new Date(b.date));
      return `<div class="admin-stage-header">${stage}</div>` +
        ms.map(m => renderAdminMatch(m)).join('');
    }).join('');
  } catch { container.innerHTML = '<p class="text-muted">Failed to load matches.</p>'; }
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}

function renderAdminMatch(m) {
  const played = m.score_a !== null && m.score_b !== null;
  const result = played ? `${m.score_a}–${m.score_b}` : '—';
  return `<div class="admin-match-row" onclick="toggleMatchEdit('${m.id}')">
    <div class="admin-match-teams">${m.team_a} vs ${m.team_b}</div>
    <div class="admin-match-date">${fmtDate(m.date)}</div>
    <div class="admin-match-result${played ? ' played' : ''}">${result}</div>
    <div class="admin-match-chevron">▼</div>
  </div>
  <div class="admin-match-form hidden" id="mf-${m.id}">
    <div id="mf-alert-${m.id}" class="alert hidden"></div>
    <div class="match-edit-grid">
      <div class="match-edit-team">
        <div class="match-edit-label">${m.team_a}</div>
        <div class="match-edit-fields">
          <label>Score<input type="number" min="0" id="sa-${m.id}" value="${m.score_a ?? ''}" placeholder="—"></label>
          <label>Goals<input type="number" min="0" id="ga-${m.id}" value="${m.goals_a ?? ''}" placeholder="—"></label>
          <label>Yellows<input type="number" min="0" id="ya-${m.id}" value="${m.yellows_a ?? ''}" placeholder="—"></label>
          <label>Reds<input type="number" min="0" id="ra-${m.id}" value="${m.reds_a ?? ''}" placeholder="—"></label>
        </div>
      </div>
      <div class="match-edit-team">
        <div class="match-edit-label">${m.team_b}</div>
        <div class="match-edit-fields">
          <label>Score<input type="number" min="0" id="sb-${m.id}" value="${m.score_b ?? ''}" placeholder="—"></label>
          <label>Goals<input type="number" min="0" id="gb-${m.id}" value="${m.goals_b ?? ''}" placeholder="—"></label>
          <label>Yellows<input type="number" min="0" id="yb-${m.id}" value="${m.yellows_b ?? ''}" placeholder="—"></label>
          <label>Reds<input type="number" min="0" id="rb-${m.id}" value="${m.reds_b ?? ''}" placeholder="—"></label>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
      <button class="btn btn-teal btn-sm" onclick="saveMatchResult('${m.id}')">Save</button>
      <button class="btn btn-outline btn-sm" onclick="toggleMatchEdit('${m.id}')">Cancel</button>
    </div>
  </div>`;
}

function toggleMatchEdit(id) {
  const el = document.getElementById(`mf-${id}`);
  el.classList.toggle('hidden');
}

async function saveMatchResult(id) {
  const alertEl = document.getElementById(`mf-alert-${id}`);
  hideAlert(alertEl);
  const body = {
    score_a:   document.getElementById(`sa-${id}`).value,
    score_b:   document.getElementById(`sb-${id}`).value,
    goals_a:   document.getElementById(`ga-${id}`).value,
    goals_b:   document.getElementById(`gb-${id}`).value,
    yellows_a: document.getElementById(`ya-${id}`).value,
    yellows_b: document.getElementById(`yb-${id}`).value,
    reds_a:    document.getElementById(`ra-${id}`).value,
    reds_b:    document.getElementById(`rb-${id}`).value,
  };
  try {
    const r = await adminFetch(`/api/admin/match/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) { showAlert(alertEl, 'error', d.error || 'Save failed.'); return; }
    showAlert(alertEl, 'success', d.message || 'Saved.');
    loadAdminMatches();
  } catch { showAlert(alertEl, 'error', 'Network error.'); }
}

// ── Sync from football-data.org ───────────────────────────────────────────────
const syncAlert  = document.getElementById('sync-alert');
const syncLog    = document.getElementById('sync-log');

document.getElementById('sync-btn').addEventListener('click', async () => {
  hideAlert(syncAlert);
  const btn = document.getElementById('sync-btn');
  btn.disabled = true; btn.textContent = 'Syncing…';
  try {
    const r = await adminFetch('/api/admin/sync', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { showAlert(syncAlert, 'error', d.error || 'Sync failed.'); return; }
    showAlert(syncAlert, 'success', d.message);
    loadAdminMatches();
  } catch { showAlert(syncAlert, 'error', 'Network error.'); }
  finally  { btn.disabled = false; btn.textContent = 'Sync Fixtures & Scores'; }
});

document.getElementById('sync-cards-btn').addEventListener('click', async () => {
  hideAlert(syncAlert);
  syncLog.classList.remove('hidden');
  syncLog.textContent = 'Starting card sync…\n';
  const btn = document.getElementById('sync-cards-btn');
  btn.disabled = true; btn.textContent = 'Syncing cards…';

  try {
    const r = await adminFetch('/api/admin/sync-cards');
    if (!r.ok) {
      const d = await r.json();
      showAlert(syncAlert, 'error', d.error || 'Card sync failed.');
      return;
    }
    const reader = r.body.getReader();
    const dec    = new TextDecoder();
    let   buf    = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        const line = part.replace(/^data: /, '');
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === 'start')    syncLog.textContent += `Syncing ${ev.total} matches…\n`;
          if (ev.type === 'progress') syncLog.textContent += `  ${ev.processed}/${ev.total} done\n`;
          if (ev.type === 'error')    syncLog.textContent += `  ⚠ Match ${ev.matchId}: ${ev.message}\n`;
          if (ev.type === 'done')     syncLog.textContent += `✓ ${ev.message}\n`;
          syncLog.scrollTop = syncLog.scrollHeight;
        } catch (_) {}
      }
    }
    showAlert(syncAlert, 'success', 'Card sync complete.');
    loadAdminMatches();
  } catch (e) {
    showAlert(syncAlert, 'error', `Error: ${e.message}`);
  } finally {
    btn.disabled = false; btn.textContent = 'Sync Card Data (slow)';
  }
});

// ── Draw ──────────────────────────────────────────────────────────────────────
document.getElementById('draw-btn').addEventListener('click', async () => {
  const alertEl  = document.getElementById('draw-alert');
  const resultsEl = document.getElementById('draw-results');
  hideAlert(alertEl);
  resultsEl.classList.add('hidden');
  const btn = document.getElementById('draw-btn');
  btn.disabled = true; btn.textContent = 'Drawing…';

  try {
    const r = await adminFetch('/api/admin/draw', { method: 'POST' });
    const d = await r.json();
    showAlert(alertEl, r.ok ? 'success' : 'error', d.message || (r.ok ? 'Draw complete.' : 'Draw failed.'));
    if (d.details?.length) {
      resultsEl.classList.remove('hidden');
      resultsEl.innerHTML = d.details.map(e => {
        if (e.status === 'assigned') {
          return `<div class="draw-result-entry"><span class="ok">✓</span> Entry ${e.entryIndex + 1}: ${e.teams.join(' · ')}</div>`;
        }
        return `<div class="draw-result-entry"><span class="fail">✗</span> Entry ${e.entryIndex + 1}: ${e.status}</div>`;
      }).join('');
    }
    loadParticipants();
  } catch { showAlert(alertEl, 'error', 'Network error.'); }
  finally  { btn.disabled = false; btn.textContent = 'Run Draw Now'; }
});

// ── CSV Import ────────────────────────────────────────────────────────────────
document.getElementById('csv-form').addEventListener('submit', async e => {
  e.preventDefault();
  const alertEl = document.getElementById('csv-alert');
  hideAlert(alertEl);
  const file = document.getElementById('csvFile').files[0];
  if (!file) { showAlert(alertEl, 'error', 'Please select a CSV file.'); return; }
  const btn = document.getElementById('csv-btn');
  btn.disabled = true; btn.textContent = 'Uploading…';
  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await adminFetch('/api/admin/matches/import', { method: 'POST', body: fd });
    const d = await r.json();
    showAlert(alertEl, r.ok ? 'success' : 'error', d.message || d.error || (r.ok ? 'Imported.' : 'Failed.'));
    if (r.ok) loadAdminMatches();
  } catch { showAlert(alertEl, 'error', 'Network error.'); }
  finally  { btn.disabled = false; btn.textContent = 'Upload & Import'; }
});

// ── Group Finishes ────────────────────────────────────────────────────────────
async function loadGroupFinishes() {
  const tbody = document.getElementById('gf-tbody');
  try {
    const r = await adminFetch('/api/admin/group-finish');
    const rows = await r.json();
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="3" class="text-muted" style="padding:0.75rem">None saved yet.</td></tr>'; return; }
    tbody.innerHTML = rows.map(row => `<tr>
      <td>${esc(row.team)}</td>
      <td>${['—','1st','2nd','3rd','4th'][row.position] || row.position}</td>
      <td></td>
    </tr>`).join('');
  } catch { tbody.innerHTML = '<tr><td colspan="3" class="text-muted">Failed to load.</td></tr>'; }
}

document.getElementById('gf-form').addEventListener('submit', async e => {
  e.preventDefault();
  const alertEl = document.getElementById('gf-alert');
  hideAlert(alertEl);
  const team     = document.getElementById('gf-team').value.trim();
  const position = document.getElementById('gf-pos').value;
  if (!team) { showAlert(alertEl, 'error', 'Team name required.'); return; }
  const btn = document.getElementById('gf-btn');
  btn.disabled = true;
  try {
    const r = await adminFetch('/api/admin/group-finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team, position }),
    });
    const d = await r.json();
    showAlert(alertEl, r.ok ? 'success' : 'error', d.message || d.error);
    if (r.ok) { document.getElementById('gf-team').value = ''; loadGroupFinishes(); }
  } catch { showAlert(alertEl, 'error', 'Network error.'); }
  finally  { btn.disabled = false; }
});

// ── Clear entries ─────────────────────────────────────────────────────────────
document.getElementById('clear-btn').addEventListener('click', async () => {
  if (!confirm('Delete ALL entries and participants? This cannot be undone.')) return;
  const alertEl = document.getElementById('clear-alert');
  hideAlert(alertEl);
  try {
    const r = await adminFetch('/api/admin/clear-entries', { method: 'POST' });
    const d = await r.json();
    showAlert(alertEl, r.ok ? 'success' : 'error', d.message || d.error);
    if (r.ok) { loadParticipants(); loadMoneyTable(); }
  } catch { showAlert(alertEl, 'error', 'Network error.'); }
});

// ── Utility ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
checkAuth();

'use strict';

const loginSection = document.getElementById('login-section');
const adminPanel   = document.getElementById('admin-panel');
const loginForm    = document.getElementById('login-form');
const loginBtn     = document.getElementById('login-btn');
const loginAlert   = document.getElementById('login-alert');
const logoutBtn    = document.getElementById('logout-btn');

const drawBtn      = document.getElementById('draw-btn');
const drawAlert    = document.getElementById('draw-alert');
const drawResults  = document.getElementById('draw-results');

const csvForm      = document.getElementById('csv-form');
const csvBtn       = document.getElementById('csv-btn');
const csvAlert     = document.getElementById('csv-alert');

const gfForm       = document.getElementById('gf-form');
const gfBtn        = document.getElementById('gf-btn');
const gfAlert      = document.getElementById('gf-alert');
const gfTbody      = document.getElementById('gf-tbody');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showAlert(el, type, msg) {
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideAlert(el) { el.classList.add('hidden'); }

// ── Auth ──────────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const res = await fetch('/api/admin/check');
    if (res.ok) {
      showPanel();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  loginSection.classList.remove('hidden');
  adminPanel.classList.add('hidden');
}

function showPanel() {
  loginSection.classList.add('hidden');
  adminPanel.classList.remove('hidden');
  loadGroupFinishes();
  loadAdminParticipants();
  loadMoneyTable();
  loadAdminMatches();
}

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert(loginAlert);
  const password = document.getElementById('password').value;
  if (!password) { showAlert(loginAlert, 'error', 'Password required.'); return; }

  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="spinner"></span> Logging in…';

  try {
    const res  = await fetch('/api/admin/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showAlert(loginAlert, 'error', data.error || 'Login failed.');
    } else {
      showPanel();
    }
  } catch {
    showAlert(loginAlert, 'error', 'Network error.');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Log In';
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  showLogin();
});

// ── Draw ──────────────────────────────────────────────────────────────────────
drawBtn.addEventListener('click', async () => {
  hideAlert(drawAlert);
  drawResults.classList.add('hidden');
  drawBtn.disabled = true;
  drawBtn.innerHTML = '<span class="spinner"></span> Running draw…';

  try {
    const res  = await fetch('/api/admin/draw', { method: 'POST' });
    const data = await res.json();

    showAlert(drawAlert, data.ok ? 'success' : 'error', data.message || data.error);

    if (data.details && data.details.length > 0) {
      const rows = data.details.map(d => {
        if (d.status === 'assigned') {
          return `<div class="draw-result-entry">
            <span class="ok">✓</span>
            <span class="text-muted">Entry ${d.entryIndex}:</span>
            <span class="badge badge-pot1">${esc(d.teams[0])}</span>
            <span class="badge badge-pot2">${esc(d.teams[1])}</span>
            <span class="badge badge-pot2">${esc(d.teams[2])}</span>
            <span class="badge badge-pot3">${esc(d.teams[3])}</span>
            <span class="badge badge-pot3">${esc(d.teams[4])}</span>
            <span class="badge badge-pot3">${esc(d.teams[5])}</span>
          </div>`;
        }
        return `<div class="draw-result-entry">
          <span class="fail">✗</span>
          <span class="text-muted">Entry ${d.entryIndex}: ${esc(d.message || 'Exhausted')}</span>
        </div>`;
      }).join('');

      drawResults.innerHTML = `
        <p class="text-muted" style="margin-bottom:0.5rem;font-size:0.82rem;">
          ${data.assigned} assigned · ${data.remaining} of ${data.maxCombos} combos remaining
        </p>
        ${rows}`;
      drawResults.classList.remove('hidden');
    }
  } catch {
    showAlert(drawAlert, 'error', 'Network error — could not run draw.');
  } finally {
    drawBtn.disabled = false;
    drawBtn.textContent = 'Run Draw Now';
  }
});

// ── CSV Import ────────────────────────────────────────────────────────────────
csvForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert(csvAlert);

  const fileInput = document.getElementById('csvFile');
  if (!fileInput.files.length) {
    showAlert(csvAlert, 'error', 'Please select a CSV file.');
    return;
  }

  csvBtn.disabled = true;
  csvBtn.innerHTML = '<span class="spinner"></span> Importing…';

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const res  = await fetch('/api/admin/matches/import', { method: 'POST', body: formData });
    const data = await res.json();
    showAlert(csvAlert, res.ok ? 'success' : 'error', data.message || data.error);
    if (res.ok) csvForm.reset();
  } catch {
    showAlert(csvAlert, 'error', 'Network error — upload failed.');
  } finally {
    csvBtn.disabled = false;
    csvBtn.textContent = 'Upload & Import';
  }
});

// ── Group Finishes ────────────────────────────────────────────────────────────
gfForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert(gfAlert);

  const team     = document.getElementById('gf-team').value.trim();
  const position = document.getElementById('gf-pos').value;

  if (!team) { showAlert(gfAlert, 'error', 'Team name is required.'); return; }

  gfBtn.disabled = true;
  gfBtn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const res  = await fetch('/api/admin/group-finish', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ team, position }),
    });
    const data = await res.json();
    showAlert(gfAlert, res.ok ? 'success' : 'error', data.message || data.error);
    if (res.ok) {
      gfForm.reset();
      loadGroupFinishes();
    }
  } catch {
    showAlert(gfAlert, 'error', 'Network error.');
  } finally {
    gfBtn.disabled = false;
    gfBtn.textContent = 'Save';
  }
});

async function loadGroupFinishes() {
  try {
    const res  = await fetch('/api/admin/group-finish');
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      gfTbody.innerHTML = '<tr><td colspan="3" class="text-muted" style="padding:0.75rem 0.9rem;">None set yet.</td></tr>';
      return;
    }
    const posLabel = { 1: '🥇 1st', 2: '🥈 2nd', 3: '🥉 3rd', 4: '4th' };
    gfTbody.innerHTML = rows.map(r => `
      <tr>
        <td>${esc(r.team)}</td>
        <td>${posLabel[r.position] || r.position}</td>
        <td></td>
      </tr>
    `).join('');
  } catch {
    gfTbody.innerHTML = '<tr><td colspan="3" class="text-muted">Could not load.</td></tr>';
  }
}

// ── Admin Participants ────────────────────────────────────────────────────────
async function loadAdminParticipants() {
  const tbody = document.getElementById('admin-ptbody');
  try {
    const rows = await fetch('/api/admin/participants').then(r => r.json());
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-muted" style="padding:0.75rem 0.9rem;">No participants yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((r, i) => `
      <tr>
        <td class="text-muted">${i + 1}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.email)}</td>
        <td>${r.total_entries}</td>
        <td style="color:var(--gold)">£${r.amount_due}</td>
        <td>${r.tiebreak_guess !== null ? `<strong>${r.tiebreak_guess}</strong> goals` : '<span class="text-muted">—</span>'}</td>
        <td>${r.known_by ? esc(r.known_by) : '<span class="text-muted">—</span>'}</td>
        <td>${r.club_team ? esc(r.club_team) : '<span class="text-muted">—</span>'}</td>
        <td>${r.country_team ? esc(r.country_team) : '<span class="text-muted">—</span>'}</td>
      </tr>
    `).join('');
  } catch {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted">Could not load.</td></tr>';
  }
}

// ── Payment tracking (server-side) ───────────────────────────────────────────
async function togglePaid(email, newState) {
  try {
    await fetch('/api/admin/money/paid', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, paid: newState }),
    });
  } catch {
    console.error('Failed to update paid status for', email);
  }
  loadMoneyTable();
}

// ── Money by email ────────────────────────────────────────────────────────────
async function loadMoneyTable() {
  const tbody = document.getElementById('money-tbody');
  try {
    const rows = await fetch('/api/admin/money').then(r => r.json());
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-muted" style="padding:0.75rem 0.9rem;">No entries yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((r, i) => {
      const isPaid = !!r.paid;
      return `
        <tr class="${isPaid ? 'paid-row' : ''}">
          <td class="text-muted">${i + 1}</td>
          <td>${esc(r.email)}</td>
          <td>${r.known_by ? esc(r.known_by) : '<span class="text-muted">—</span>'}</td>
          <td>${r.teams.map(t => esc(t)).join(', ')}</td>
          <td>${r.total_draws}</td>
          <td class="paid-amount" style="color:${isPaid ? 'var(--teal)' : 'var(--gold)'}">£${r.total_due}</td>
          <td>
            <label class="paid-label">
              <input type="checkbox" class="paid-check" data-email="${esc(r.email)}" ${isPaid ? 'checked' : ''}>
              <span class="paid-status">${isPaid ? '✓ Paid' : 'Pending'}</span>
            </label>
          </td>
        </tr>
      `;
    }).join('');
    tbody.querySelectorAll('.paid-check').forEach(cb => {
      cb.addEventListener('change', () => togglePaid(cb.dataset.email, cb.checked));
    });
  } catch {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted">Could not load.</td></tr>';
  }
}

// ── Clear entries ─────────────────────────────────────────────────────────────
document.getElementById('clear-btn').addEventListener('click', async () => {
  const clearAlert = document.getElementById('clear-alert');
  hideAlert(clearAlert);
  if (!confirm('Are you sure? This will permanently delete ALL participants and entries and cannot be undone.')) return;

  const btn = document.getElementById('clear-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Deleting…';

  try {
    const res  = await fetch('/api/admin/clear-entries', { method: 'POST' });
    const data = await res.json();
    showAlert(clearAlert, res.ok ? 'success' : 'error', data.message || data.error);
    if (res.ok) { loadAdminParticipants(); loadMoneyTable(); }
  } catch {
    showAlert(clearAlert, 'error', 'Network error.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Delete All Entries';
  }
});

// ── Match Results ─────────────────────────────────────────────────────────────
const STAGE_ORDER = [
  'Group A','Group B','Group C','Group D','Group E','Group F',
  'Group G','Group H','Group I','Group J','Group K','Group L',
  'Round of 32','Quarter-final','Semi-final','Third Place','Final',
];

async function loadAdminMatches() {
  const container = document.getElementById('admin-matches-list');
  try {
    const matches = await fetch('/api/admin/matches').then(r => r.json());
    if (!Array.isArray(matches) || matches.length === 0) {
      container.innerHTML = '<p class="text-muted" style="padding:0.5rem 0;">No matches imported yet — use the CSV import below.</p>';
      return;
    }
    const byStage = {};
    for (const m of matches) {
      const s = m.stage || 'Other';
      if (!byStage[s]) byStage[s] = [];
      byStage[s].push(m);
    }
    const stages = Object.keys(byStage).sort((a, b) => {
      const ai = STAGE_ORDER.indexOf(a), bi = STAGE_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    container.innerHTML = stages.map(stage =>
      `<div class="admin-stage-header">${esc(stage)}</div>` +
      byStage[stage].map(m => renderAdminMatch(m)).join('')
    ).join('');
  } catch {
    container.innerHTML = '<p class="text-muted">Could not load matches.</p>';
  }
}

function renderAdminMatch(m) {
  const played = m.score_a !== null && m.score_b !== null;
  const result = played ? `${m.score_a} – ${m.score_b}` : '—';
  const dateStr = m.date ? new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const v = (x) => (x !== null && x !== undefined) ? x : '';
  return `
    <div class="admin-match-item" id="amatch-${m.id}">
      <div class="admin-match-row" onclick="toggleMatchEdit('${m.id}')">
        <span class="admin-match-teams">${esc(m.team_a)} <span class="text-muted">vs</span> ${esc(m.team_b)}</span>
        <span class="admin-match-date">${dateStr}</span>
        <span class="admin-match-result${played ? ' played' : ''}">${result}</span>
        <span class="admin-match-chevron">▾</span>
      </div>
      <div class="admin-match-form hidden" id="aform-${m.id}">
        <div class="match-edit-grid">
          <div class="match-edit-team">
            <div class="match-edit-label">${esc(m.team_a)}</div>
            <div class="match-edit-fields">
              <label>Score<input type="number" id="sa-${m.id}" value="${v(m.score_a)}" min="0" max="99" placeholder="—"></label>
              <label>Goals<input type="number" id="ga-${m.id}" value="${v(m.goals_a)}" min="0" placeholder="—"></label>
              <label>Yellows<input type="number" id="ya-${m.id}" value="${v(m.yellows_a)}" min="0" placeholder="—"></label>
              <label>Reds<input type="number" id="ra-${m.id}" value="${v(m.reds_a)}" min="0" placeholder="—"></label>
            </div>
          </div>
          <div class="match-edit-team">
            <div class="match-edit-label">${esc(m.team_b)}</div>
            <div class="match-edit-fields">
              <label>Score<input type="number" id="sb-${m.id}" value="${v(m.score_b)}" min="0" max="99" placeholder="—"></label>
              <label>Goals<input type="number" id="gb-${m.id}" value="${v(m.goals_b)}" min="0" placeholder="—"></label>
              <label>Yellows<input type="number" id="yb-${m.id}" value="${v(m.yellows_b)}" min="0" placeholder="—"></label>
              <label>Reds<input type="number" id="rb-${m.id}" value="${v(m.reds_b)}" min="0" placeholder="—"></label>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-teal btn-sm" onclick="saveMatchResult('${m.id}')">Save Result</button>
          <button class="btn btn-outline btn-sm" onclick="clearMatchResult('${m.id}')">Clear</button>
          <button class="btn btn-outline btn-sm" onclick="toggleMatchEdit('${m.id}')">Cancel</button>
          <span id="alert-${m.id}" class="text-muted" style="font-size:0.8rem;"></span>
        </div>
      </div>
    </div>`;
}

function toggleMatchEdit(id) {
  const form     = document.getElementById(`aform-${id}`);
  const chevron  = document.querySelector(`#amatch-${id} .admin-match-chevron`);
  const isHidden = form.classList.toggle('hidden');
  if (chevron) chevron.textContent = isHidden ? '▾' : '▴';
}

async function saveMatchResult(id) {
  const msgEl = document.getElementById(`alert-${id}`);
  msgEl.textContent = '';
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
    const res  = await fetch(`/api/admin/match/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    msgEl.textContent = data.message || data.error;
    msgEl.style.color = res.ok ? 'var(--teal)' : 'var(--red-dim)';
    if (res.ok) {
      const resultEl = document.querySelector(`#amatch-${id} .admin-match-result`);
      if (resultEl && body.score_a !== '' && body.score_b !== '') {
        resultEl.textContent = `${body.score_a} – ${body.score_b}`;
        resultEl.classList.add('played');
      }
    }
  } catch {
    msgEl.textContent = 'Network error.';
    msgEl.style.color = 'var(--red-dim)';
  }
}

async function clearMatchResult(id) {
  if (!confirm('Clear this result?')) return;
  const empty = { score_a:'', score_b:'', goals_a:'', goals_b:'', yellows_a:'', yellows_b:'', reds_a:'', reds_b:'' };
  try {
    const res = await fetch(`/api/admin/match/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(empty),
    });
    if (res.ok) {
      ['sa','sb','ga','gb','ya','yb','ra','rb'].forEach(p => { const el = document.getElementById(`${p}-${id}`); if (el) el.value = ''; });
      const resultEl = document.querySelector(`#amatch-${id} .admin-match-result`);
      if (resultEl) { resultEl.textContent = '—'; resultEl.classList.remove('played'); }
    }
  } catch {}
}

// ── Live Data Sync ────────────────────────────────────────────────────────────
document.getElementById('sync-btn').addEventListener('click', async () => {
  const syncAlert = document.getElementById('sync-alert');
  const btn = document.getElementById('sync-btn');
  hideAlert(syncAlert);
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Syncing…';
  try {
    const res  = await fetch('/api/admin/sync', { method: 'POST' });
    const data = await res.json();
    showAlert(syncAlert, res.ok ? 'success' : 'error', data.message || data.error);
    if (res.ok) loadAdminMatches();
  } catch {
    showAlert(syncAlert, 'error', 'Network error — sync failed.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '⚡ Sync Fixtures &amp; Scores';
  }
});

document.getElementById('sync-cards-btn').addEventListener('click', () => {
  const syncAlert   = document.getElementById('sync-alert');
  const progress    = document.getElementById('cards-progress');
  const progressBar = document.getElementById('cards-progress-bar');
  const progressTxt = document.getElementById('cards-progress-text');
  const btn         = document.getElementById('sync-cards-btn');
  hideAlert(syncAlert);
  btn.disabled = true;
  progress.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressTxt.textContent = 'Connecting…';

  const es = new EventSource('/api/admin/sync-cards');
  es.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.type === 'start') {
      const mins = Math.ceil(d.total * 6.5 / 60);
      progressTxt.textContent = `Fetching cards for ${d.total} match${d.total !== 1 ? 'es' : ''} — approx ${mins} min…`;
    } else if (d.type === 'progress') {
      const pct = Math.round((d.processed / d.total) * 100);
      progressBar.style.width = pct + '%';
      progressTxt.textContent = `${d.processed} / ${d.total} matches done…`;
    } else if (d.type === 'done') {
      progressBar.style.width = '100%';
      progress.classList.add('hidden');
      showAlert(syncAlert, 'success', d.message);
      loadAdminMatches();
      es.close();
      btn.disabled = false;
    } else if (d.type === 'error') {
      progressTxt.textContent = `⚠ Match ${d.matchId}: ${d.message}`;
    } else if (d.type === 'fatal') {
      progress.classList.add('hidden');
      showAlert(syncAlert, 'error', d.message);
      es.close();
      btn.disabled = false;
    }
  };
  es.onerror = () => {
    progress.classList.add('hidden');
    showAlert(syncAlert, 'error', 'Card sync connection lost.');
    es.close();
    btn.disabled = false;
  };
});

// ── Group Stage Newsletter ────────────────────────────────────────────────────
async function sendGsNewsletter(mode) {
  const alert = document.getElementById('gs-newsletter-alert');
  const testBtn = document.getElementById('gs-newsletter-test-btn');
  const allBtn  = document.getElementById('gs-newsletter-all-btn');
  hideAlert(alert);

  testBtn.disabled = true;
  allBtn.disabled  = true;
  const activeBtn  = mode === 'test' ? testBtn : allBtn;
  activeBtn.innerHTML = '<span class="spinner"></span> Sending…';

  try {
    const res  = await fetch('/api/admin/send-gs-newsletter', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mode }),
    });
    const data = await res.json();
    showAlert(alert, res.ok ? 'success' : 'error', data.message || data.error);
  } catch {
    showAlert(alert, 'error', 'Network error — could not send newsletter.');
  } finally {
    testBtn.disabled = false;
    allBtn.disabled  = false;
    testBtn.textContent = '📨 Send Test Newsletter';
    allBtn.textContent  = '📣 Send to All Participants';
  }
}

document.getElementById('gs-newsletter-test-btn')?.addEventListener('click', () => sendGsNewsletter('test'));
document.getElementById('gs-newsletter-all-btn')?.addEventListener('click', () => {
  if (!confirm('Send the Group Stage Newsletter to ALL participants? This cannot be undone.')) return;
  sendGsNewsletter('all');
});

// ── Init ──────────────────────────────────────────────────────────────────────
checkAuth();

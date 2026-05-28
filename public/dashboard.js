'use strict';

// ── Flag lookup from flags.js GROUPS ─────────────────────────────────────────
const FLAG_CODES = {};
if (typeof GROUPS !== 'undefined') {
  GROUPS.forEach(g => g.teams.forEach(t => { FLAG_CODES[t.name] = t.code; }));
}

function flag(team) {
  const code = FLAG_CODES[team];
  return code ? `<span class="fi fi-${code}" title="${team}"></span> ` : '';
}

let currentTab   = 'overall';
let previousRanks = {};

// ── Stats ─────────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const r = await fetch('/api/stats');
    if (!r.ok) return;
    const d = await r.json();
    document.getElementById('stat-matches').textContent      = d.matchesPlayed ?? '0';
    document.getElementById('stat-goals').textContent        = d.totalGoals    ?? '0';
    document.getElementById('stat-top').textContent          = d.topTeam       ?? '—';
    document.getElementById('stat-participants').textContent = d.participantCount ?? '0';
  } catch (_) {}
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  const endpoint = currentTab === 'overall'  ? '/api/leaderboard'
                 : currentTab === 'group'    ? '/api/leaderboard/group'
                 : '/api/leaderboard/knockout';

  const tbody = document.getElementById('standings-tbody');
  try {
    const r = await fetch(endpoint);
    if (!r.ok) throw new Error('Failed');
    const rows = await r.json();
    renderLeaderboard(rows, tbody);
  } catch {
    tbody.innerHTML = '<tr><td colspan="14" class="prem-loading">Failed to load — retrying…</td></tr>';
  }
}

function renderLeaderboard(rows, tbody) {
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="14" class="prem-loading text-muted">No entries yet.</td></tr>';
    return;
  }

  const newRanks = {};
  rows.forEach((r, i) => { newRanks[`${r.name}:${r.entryIndex}`] = i + 1; });

  tbody.innerHTML = rows.map((r, i) => {
    const pos  = i + 1;
    const key  = `${r.name}:${r.entryIndex}`;
    const prev = previousRanks[key];
    const movHtml = prev == null ? '<span class="mov-new">NEW</span>'
                  : prev > pos  ? `<span class="mov-up">▲${prev - pos}</span>`
                  : prev < pos  ? `<span class="mov-dn">▼${pos - prev}</span>`
                  : '<span class="mov-eq">—</span>';

    const posClass = pos === 1 ? 'pos-1' : pos === 2 ? 'pos-2' : pos === 3 ? 'pos-3' : '';
    const entryLabel = r.totalEntries > 1 ? ` <span class="entry-num">#${r.entryIndex + 1}</span>` : '';

    if (!r.assigned) {
      return `<tr class="${posClass}">
        <td class="td-pos">${pos}</td>
        <td class="td-mov">${movHtml}</td>
        <td class="td-name">${r.name}${entryLabel}</td>
        <td class="td-teams td-pending">Awaiting draw…</td>
        <td colspan="10" class="td-pts-pending">—</td>
      </tr>`;
    }

    const s = r.stats;
    const pts = s ? s.points : 0;

    // Build team badges — pot1(1) + pot2(2) + pot3(3)
    const badges = [
      r.pot1Team  ? `<span class="badge badge-pot1">${flag(r.pot1Team)}${r.pot1Team}</span>` : '',
      ...(r.pot2Teams || []).filter(Boolean).map(t => `<span class="badge badge-pot2">${flag(t)}${t}</span>`),
      ...(r.pot3Teams || []).filter(Boolean).map(t => `<span class="badge badge-pot3">${flag(t)}${t}</span>`),
    ].filter(Boolean).join('');

    return `<tr class="${posClass}">
      <td class="td-pos">${pos}</td>
      <td class="td-mov">${movHtml}</td>
      <td class="td-name">${r.name}${entryLabel}</td>
      <td class="td-teams"><div class="team-badges">${badges}</div></td>
      <td class="td-stat">${s ? s.played        : '—'}</td>
      <td class="td-stat pos">${s ? s.wins       : '—'}</td>
      <td class="td-stat">${s ? s.draws          : '—'}</td>
      <td class="td-stat">${s ? s.losses         : '—'}</td>
      <td class="td-stat pos">${s ? s.goalsFor   : '—'}</td>
      <td class="td-stat neg">${s ? s.goalsAgainst : '—'}</td>
      <td class="td-stat neg">${s ? s.yellowCards : '—'}</td>
      <td class="td-stat neg">${s ? s.redCards    : '—'}</td>
      <td class="td-stat">${s ? s.groupBonus      : '—'}</td>
      <td class="td-pts ${pos === 1 ? 'text-gold' : ''}">${pts}</td>
    </tr>`;
  }).join('');

  previousRanks = newRanks;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.tab;
    previousRanks = {};
    loadLeaderboard();
  });
});

// ── Refresh countdown ─────────────────────────────────────────────────────────
let secs = 60;
function tick() {
  document.getElementById('countdown').textContent = secs;
  if (--secs < 0) {
    secs = 60;
    loadStats();
    loadLeaderboard();
  }
}

loadStats();
loadLeaderboard();
setInterval(tick, 1000);

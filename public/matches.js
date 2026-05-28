'use strict';

const FLAG_CODES = {};
if (typeof GROUPS !== 'undefined') {
  GROUPS.forEach(g => g.teams.forEach(t => { FLAG_CODES[t.name] = t.code; }));
}

function flag(team) {
  const code = FLAG_CODES[team];
  return code ? `<span class="fi fi-${code}"></span>` : '';
}

function fmtDate(d) {
  return new Date(d).toLocaleString('en-GB', {
    weekday:'short', day:'numeric', month:'short',
    hour:'2-digit', minute:'2-digit'
  });
}

const STAGE_ORDER = [
  'Group A','Group B','Group C','Group D','Group E','Group F',
  'Group G','Group H','Group I','Group J','Group K','Group L',
];

async function loadMatches() {
  const container = document.getElementById('matches-container');
  try {
    const r = await fetch('/api/matches');
    if (!r.ok) throw new Error();
    const matches = await r.json();

    // Only group stage
    const groupMatches = matches.filter(m => m.stage && m.stage.startsWith('Group '));

    if (!groupMatches.length) {
      container.innerHTML = '<p class="text-muted">No group stage fixtures yet.</p>';
      return;
    }

    const byStage = {};
    groupMatches.forEach(m => {
      if (!byStage[m.stage]) byStage[m.stage] = [];
      byStage[m.stage].push(m);
    });

    const stages = Object.keys(byStage).sort((a, b) => {
      const ia = STAGE_ORDER.indexOf(a), ib = STAGE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    container.innerHTML = stages.map(stage => {
      const ms = byStage[stage].sort((a, b) => new Date(a.date) - new Date(b.date));
      const rows = ms.map(m => {
        const played = m.score_a !== null && m.score_b !== null;
        const scoreHtml = played
          ? `<span class="ms-a">${m.score_a}</span><span class="ms-sep">–</span><span class="ms-b">${m.score_b}</span>`
          : `<span class="ms-vs">vs</span>`;
        return `<div class="match-row${played ? ' played' : ''}">
          <div class="match-team team-a">${flag(m.team_a)} ${m.team_a}</div>
          <div class="match-score-box">${scoreHtml}</div>
          <div class="match-team">${flag(m.team_b)} ${m.team_b}</div>
          <div class="match-date">${m.date ? fmtDate(m.date) : '—'}</div>
        </div>`;
      }).join('');

      return `<div class="card stage-section" style="padding:0;margin-bottom:1rem;">
        <div class="stage-header">${stage}</div>
        ${rows}
      </div>`;
    }).join('');
  } catch {
    container.innerHTML = '<p class="text-muted">Failed to load fixtures.</p>';
  }
}

// Refresh countdown
let secs = 60;
function tick() {
  document.getElementById('countdown').textContent = secs;
  if (--secs < 0) { secs = 60; loadMatches(); }
}

loadMatches();
setInterval(tick, 1000);

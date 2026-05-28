'use strict';

const FLAG_CODES = {};
if (typeof GROUPS !== 'undefined') {
  GROUPS.forEach(g => g.teams.forEach(t => { FLAG_CODES[t.name] = t.code; }));
}

function flag(team) {
  if (!team || team === 'TBD') return '';
  const code = FLAG_CODES[team];
  return code ? `<span class="fi fi-${code}"></span> ` : '';
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', {
    weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'
  });
}

const STAGE_ORDER = ['Round of 32','Round of 16','Quarter-final','Semi-final','Third Place','Final'];

async function loadKnockout() {
  const container = document.getElementById('knockout-container');
  try {
    const r = await fetch('/api/matches');
    if (!r.ok) throw new Error();
    const matches = await r.json();

    const knockoutMatches = matches.filter(m => m.stage && !m.stage.startsWith('Group '));

    if (!knockoutMatches.length) {
      container.innerHTML = `<div class="card">
        <h2>🏆 Knockout Stage</h2>
        <p class="text-muted">Knockout fixtures will appear here once the group stage is complete.</p>
      </div>`;
      return;
    }

    const byStage = {};
    knockoutMatches.forEach(m => {
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
        const tba    = !m.team_a || !m.team_b || m.team_a === 'TBD' || m.team_b === 'TBD';
        const scoreHtml = played
          ? `<span class="ms-a">${m.score_a}</span><span class="ms-sep">–</span><span class="ms-b">${m.score_b}</span>`
          : `<span class="ms-vs">${tba ? 'TBD' : 'vs'}</span>`;
        const teamA = m.team_a || 'TBD';
        const teamB = m.team_b || 'TBD';
        return `<div class="match-row${played ? ' played' : ''}">
          <div class="match-team team-a">${flag(teamA)}${teamA}</div>
          <div class="match-score-box">${scoreHtml}</div>
          <div class="match-team">${flag(teamB)}${teamB}</div>
          <div class="match-date">${fmtDate(m.date)}</div>
        </div>`;
      }).join('');

      return `<div class="card stage-section" style="padding:0;margin-bottom:1rem;">
        <div class="stage-header">${stage}</div>
        ${rows}
      </div>`;
    }).join('');
  } catch {
    container.innerHTML = '<p class="text-muted">Failed to load knockout fixtures.</p>';
  }
}

let secs = 60;
function tick() {
  document.getElementById('countdown').textContent = secs;
  if (--secs < 0) { secs = 60; loadKnockout(); }
}

loadKnockout();
setInterval(tick, 1000);

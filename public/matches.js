'use strict';

// -- Build flag + group lookups from flags.js ----------------------------------
const FLAG_CODES = {};
const GROUP_MAP  = {};   // 'Group A' → { letter, teams:[{name,code}] }
if (typeof GROUPS !== 'undefined') {
  GROUPS.forEach(g => {
    g.teams.forEach(t => { FLAG_CODES[t.name] = t.code; });
    GROUP_MAP[`Group ${g.letter}`] = g;
  });
}

function flag(team) {
  const code = FLAG_CODES[team];
  return code ? `<span class="fi fi-${code}"></span>` : '';
}

// Date-only seeds (length ≤ 10) show as "Thu 11 Jun — time TBC"
// Full ISO strings show date + time in UK locale
function fmtDate(d) {
  if (!d) return '—';
  if (d.length <= 10) {
    const dt = new Date(d + 'T12:00:00Z');
    return dt.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })
           + ' — time TBC';
  }
  return new Date(d).toLocaleString('en-GB', {
    weekday:'short', day:'numeric', month:'short',
    hour:'2-digit', minute:'2-digit'
  });
}

// -- Group standings table -----------------------------------------------------
function buildStandings(groupKey, groupMatches) {
  const group = GROUP_MAP[groupKey];
  if (!group) return '';

  // Initialise a row for every team in the group
  const tbl = {};
  group.teams.forEach(t => {
    tbl[t.name] = { name:t.name, code:t.code, p:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 };
  });

  // Compute results from played matches
  groupMatches.forEach(m => {
    if (m.score_a === null || m.score_b === null) return;
    const a = tbl[m.team_a], b = tbl[m.team_b];
    if (!a || !b) return;
    const ga = m.goals_a ?? m.score_a, gb = m.goals_b ?? m.score_b;
    a.p++; b.p++;
    a.gf += ga; a.ga += gb;
    b.gf += gb; b.ga += ga;
    if (m.score_a > m.score_b)      { a.w++; a.pts += 3; b.l++; }
    else if (m.score_a < m.score_b) { b.w++; b.pts += 3; a.l++; }
    else                            { a.d++; a.pts++;    b.d++; b.pts++; }
  });

  const rows = Object.values(tbl).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdB = b.gf - b.ga, gdA = a.gf - a.ga;
    if (gdB !== gdA) return gdB - gdA;
    return b.gf - a.gf;
  });

  const tbody = rows.map((r, i) => {
    const gd  = r.gf - r.ga;
    const gdTxt = gd > 0 ? `+${gd}` : `${gd}`;
    const hi  = i < 2 ? ' gs-qualify' : i === 2 ? ' gs-playoff' : '';
    return `<tr class="${hi}">
      <td class="gs-pos">${i + 1}</td>
      <td class="gs-team"><span class="fi fi-${r.code}"></span> ${r.name}</td>
      <td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td>
      <td>${r.gf}</td><td>${r.ga}</td><td>${gdTxt}</td>
      <td class="gs-pts">${r.pts}</td>
    </tr>`;
  }).join('');

  return `<div class="gs-wrap">
    <table class="gs-table">
      <thead><tr>
        <th></th>
        <th class="gs-team-th">Team</th>
        <th title="Played">P</th>
        <th title="Won">W</th>
        <th title="Drawn">D</th>
        <th title="Lost">L</th>
        <th title="Goals For">GF</th>
        <th title="Goals Against">GA</th>
        <th title="Goal Difference">GD</th>
        <th title="Points">Pts</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  </div>`;
}

// -- Stage order ---------------------------------------------------------------
const STAGE_ORDER = [
  'Group A','Group B','Group C','Group D','Group E','Group F',
  'Group G','Group H','Group I','Group J','Group K','Group L',
];

// -- Main load -----------------------------------------------------------------
async function loadMatches() {
  const container = document.getElementById('matches-container');
  try {
    const r = await fetch('/api/matches');
    if (!r.ok) throw new Error();
    const matches = await r.json();

    const groupMatches = matches.filter(m => m.stage && m.stage.startsWith('Group '));
    if (!groupMatches.length) {
      container.innerHTML = '<p class="text-muted">No group stage fixtures yet.</p>';
      return;
    }

    // Bucket by group
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

      // Standings table
      const standingsHtml = buildStandings(stage, ms);

      // Fixture rows
      const fixtureRows = ms.map(m => {
        const played = m.score_a !== null && m.score_b !== null;
        const scoreHtml = played
          ? `<span class="ms-a">${m.score_a}</span><span class="ms-sep"></span><span class="ms-b">${m.score_b}</span>`
          : `<span class="ms-vs">vs</span>`;
        return `<div class="match-row${played ? ' played' : ''}">
          <div class="match-team team-a">${flag(m.team_a)} ${m.team_a}</div>
          <div class="match-score-box">${scoreHtml}</div>
          <div class="match-team">${flag(m.team_b)} ${m.team_b}</div>
          <div class="match-date">${m.date ? fmtDate(m.date) : '—'}</div>
        </div>`;
      }).join('');

      return `<div class="card stage-section" style="padding:0;margin-bottom:1.25rem;">
        <div class="stage-header">${stage}</div>
        ${standingsHtml}
        <div class="fixtures-divider">Fixtures</div>
        ${fixtureRows}
      </div>`;
    }).join('');

  } catch {
    container.innerHTML = '<p class="text-muted">Failed to load fixtures.</p>';
  }
}

// -- Refresh countdown ---------------------------------------------------------
let secs = 60;
function tick() {
  document.getElementById('countdown').textContent = secs;
  if (--secs < 0) { secs = 60; loadMatches(); }
}

loadMatches();
setInterval(tick, 1000);

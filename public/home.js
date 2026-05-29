'use strict';

// -- Kick-off timestamp --------------------------------------------------------
const WC_START = new Date('2026-06-11T19:00:00Z'); // Mexico vs South Africa

function pad(n) { return String(n).padStart(2, '0'); }
function trunc(s, max) { s = s || ''; return s.length > max ? s.slice(0, max - 1) + '…' : s; }

// Build flag-code lookup from flags.js GROUPS global
const HOME_FLAG = {};
if (typeof GROUPS !== 'undefined') {
  GROUPS.forEach(g => g.teams.forEach(t => { HOME_FLAG[t.name] = t.code; }));
}
function teamFlag(name) {
  const code = HOME_FLAG[name];
  return code ? `<span class="fi fi-${code}" title="${name}" style="font-size:1.1em;vertical-align:middle;margin-right:2px"></span>` : '';
}

// -- Countdown rendering -------------------------------------------------------
function renderCountdown(target) {
  const now  = new Date();
  const diff = target - now;
  if (diff <= 0) return false;
  const totalSecs = Math.floor(diff / 1000);
  const days  = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins  = Math.floor((totalSecs % 3600)  / 60);
  const secs  = totalSecs % 60;
  document.getElementById('cd-days').textContent  = days;
  document.getElementById('cd-hours').textContent = pad(hours);
  document.getElementById('cd-mins').textContent  = pad(mins);
  document.getElementById('cd-secs').textContent  = pad(secs);
  return true;
}

// -- Main init -----------------------------------------------------------------
async function initHome() {
  let matches = [];
  try {
    const r = await fetch('/api/matches');
    if (r.ok) matches = await r.json();
  } catch (_) {}

  const played = matches.filter(m => m.score_a !== null && m.score_b !== null);

  if (played.length === 0) {
    showCountdown(matches);
  } else {
    buildInsightsPanel();
    refreshInsights();
    startInsightTimer();
  }
}

function formatDate(d) {
  if (!d) return '';
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, mo, dy] = d.split('-').map(Number);
      return new Date(y, mo - 1, dy).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
      }) + ' | Time TBC';
    }
    const dt = new Date(d);
    return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      + ' | ' + dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

// -- Pre-tournament countdown --------------------------------------------------
function showCountdown(matches) {
  const now      = new Date();
  const upcoming = matches
    .filter(m => m.score_a === null && new Date(m.date) > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const first  = upcoming[0];
  const target = (first && new Date(first.date) < new Date('2026-06-30')) ? WC_START : WC_START;

  if (first) {
    document.getElementById('cd-match').textContent    = `${first.team_a} vs ${first.team_b}`;
    document.getElementById('cd-subtitle').textContent = `Opening match | ${formatDate(first.date)}`;
  } else {
    document.getElementById('cd-match').textContent    = 'Mexico vs South Africa';
    document.getElementById('cd-subtitle').textContent = 'Opening match | 11 Jun 2026';
  }

  renderCountdown(target);
  const id = setInterval(() => { if (!renderCountdown(target)) clearInterval(id); }, 1000);
}

// -- Insights panel ------------------------------------------------------------
let insightTimerId = null;
let insightSecs    = 60;

function loadHomeRanks() {
  try { return JSON.parse(localStorage.getItem('isweep_home_ranks') || '{}'); } catch { return {}; }
}
function saveHomeRanks(r) {
  try { localStorage.setItem('isweep_home_ranks', JSON.stringify(r)); } catch {}
}

function buildInsightsPanel() {
  const card = document.querySelector('.cd-card');
  // Reduce padding, left-align for the feed layout
  card.style.padding   = '1.5rem 1.5rem 1.4rem';
  card.style.textAlign = 'left';
  card.innerHTML = `
    <div class="ins-header">
      <span class="pulse-dot"></span>
      <span class="ins-title" id="ins-title">Sweepstake Highlights</span>
      <span class="ins-refresh-in" id="ins-refresh">Loading…</span>
    </div>
    <div class="insights-grid" id="insights-grid">
      <div class="ins-loading">Loading insights…</div>
    </div>
    <div id="ins-recent-wrap"></div>
  `;
}

function startInsightTimer() {
  insightSecs    = 60;
  insightTimerId = setInterval(() => {
    insightSecs--;
    const el = document.getElementById('ins-refresh');
    if (el) el.textContent = `Refreshing in ${insightSecs}s`;
    if (insightSecs <= 0) { insightSecs = 60; refreshInsights(); }
  }, 1000);
}

async function refreshInsights() {
  try {
    const [lbRes, mRes] = await Promise.all([
      fetch('/api/leaderboard'),
      fetch('/api/matches'),
    ]);
    const lb      = lbRes.ok ? await lbRes.json() : [];
    const matches = mRes.ok  ? await mRes.json()  : [];
    renderInsights(lb, matches);
  } catch (e) {
    console.error('Insights error', e);
  }
}

function renderInsights(lb, matches) {
  const now    = new Date();
  const played = matches.filter(m => m.score_a !== null && m.score_b !== null);

  // -- Position tracking (localStorage)
  const prevRanks = loadHomeRanks();
  const newRanks  = {};
  lb.forEach((r, i) => { newRanks[`${r.name}:${r.entryIndex}`] = i + 1; });
  saveHomeRanks(newRanks);

  const assigned = lb.filter(r => r.assigned && r.stats);

  // -- Live match detection (kicked off, no score yet, within 120 min)
  const liveMatch = matches.find(m => {
    if (m.score_a !== null) return false;
    const kick = new Date(m.date);
    return !isNaN(kick) && kick <= now && (now - kick) < 120 * 60 * 1000;
  });

  // -- Header
  const titleEl = document.getElementById('ins-title');
  if (titleEl) {
    titleEl.innerHTML = liveMatch
      ? `Sweepstake Highlights &nbsp;<span class="ins-live-badge">🔴 Live: ${trunc(liveMatch.team_a, 10)} vs ${trunc(liveMatch.team_b, 10)}</span>`
      : 'Sweepstake Highlights';
  }

  // -- Leader & wooden spoon
  const leader    = assigned[0]  || null;
  const lastPlace = assigned.length > 1 ? assigned[assigned.length - 1] : null;

  // -- Biggest climber & faller
  let biggestClimb = null, biggestFall = null;
  for (const [key, newPos] of Object.entries(newRanks)) {
    const oldPos = prevRanks[key];
    if (oldPos == null || oldPos === newPos) continue;
    const entry = lb.find(r => `${r.name}:${r.entryIndex}` === key);
    if (!entry || !entry.assigned) continue;
    const diff = oldPos - newPos; // positive = moved up
    if (diff > 0 && (!biggestClimb || diff > biggestClimb.diff)) biggestClimb = { diff, entry };
    if (diff < 0 && (!biggestFall  || Math.abs(diff) > biggestFall.diff))  biggestFall  = { diff: Math.abs(diff), entry };
  }

  // -- Team points (same team has same pts across all entries)
  const teamPtsMap = {};
  for (const r of lb) {
    if (!r.teamPts) continue;
    for (const [team, pts] of Object.entries(r.teamPts)) {
      if (team) teamPtsMap[team] = pts;
    }
  }

  // -- Drawn teams
  const drawnTeams = new Set();
  for (const r of lb) {
    if (!r.assigned) continue;
    [r.pot1Team, ...(r.pot2Teams || []), ...(r.pot3Teams || [])].filter(Boolean).forEach(t => drawnTeams.add(t));
  }

  let hottestTeam = null, hottestPts = -Infinity;
  let coldestTeam = null, coldestPts =  Infinity;
  for (const team of drawnTeams) {
    const pts = teamPtsMap[team] ?? 0;
    if (pts > hottestPts) { hottestPts = pts; hottestTeam = team; }
    if (pts < coldestPts) { coldestPts = pts; coldestTeam = team; }
  }

  // -- Highest-scoring single match
  let topMatch = null, topGoals = 0;
  for (const m of played) {
    // goals_a/goals_b if returned by API, else fall back to score_a/score_b
    const ga = m.goals_a ?? m.score_a ?? 0;
    const gb = m.goals_b ?? m.score_b ?? 0;
    const g  = ga + gb;
    if (g > topGoals) { topGoals = g; topMatch = m; }
  }

  // -- Most recent result
  const recentMatch = played.length ? played[played.length - 1] : null;

  // -- Points gap between 1st and 2nd
  const gapPts = (assigned.length >= 2)
    ? assigned[0].stats.points - assigned[1].stats.points
    : null;

  // -- Build insight cards
  const label = r => trunc(r.knownBy || r.name, 16);
  const cards = [];

  if (leader) {
    cards.push(mkCard('🏆', 'Leading', label(leader), `${leader.stats.points} pts`, 'gold'));
  }

  if (lastPlace && lastPlace !== leader) {
    cards.push(mkCard('🥄', 'Wooden Spoon', label(lastPlace), `${lastPlace.stats.points} pts`, 'red'));
  }

  if (gapPts !== null) {
    const gapTxt = gapPts === 0 ? 'Level on points!' : `${gapPts} pt${gapPts === 1 ? '' : 's'} clear`;
    cards.push(mkCard('📊', 'Leaders Gap', label(leader), gapTxt, gapPts === 0 ? 'teal' : 'gold'));
  }

  if (biggestClimb) {
    cards.push(mkCard('📈', 'Biggest Climber', label(biggestClimb.entry), `▲ ${biggestClimb.diff} place${biggestClimb.diff === 1 ? '' : 's'}`, 'teal'));
  }

  if (biggestFall) {
    cards.push(mkCard('📉', 'Biggest Faller', label(biggestFall.entry), `▼ ${biggestFall.diff} place${biggestFall.diff === 1 ? '' : 's'}`, 'red'));
  }

  if (hottestTeam && hottestPts > 0) {
    cards.push(mkCard('🔥', 'Hottest Nation', `${teamFlag(hottestTeam)}${trunc(hottestTeam, 18)}`, `${hottestPts} pts`, 'teal'));
  }

  // Only show struggling nation if they have negative or zero pts and at least one other team has scored
  if (coldestTeam && coldestTeam !== hottestTeam && coldestPts <= 0 && hottestPts > 0) {
    const coldLabel = coldestPts < 0 ? `${coldestPts} pts` : 'Yet to score';
    cards.push(mkCard('❄️', 'Struggling Nation', `${teamFlag(coldestTeam)}${trunc(coldestTeam, 18)}`, coldLabel, 'red'));
  }

  if (topMatch && topGoals >= 3) {
    const ta = trunc(topMatch.team_a, 12), tb = trunc(topMatch.team_b, 12);
    const sa = topMatch.goals_a ?? topMatch.score_a, sb = topMatch.goals_b ?? topMatch.score_b;
    cards.push(mkCard('⚽', 'Goal Fest', `${ta} ${sa}${sb} ${tb}`, `${topGoals} goals`, 'gold'));
  }

  // Entries + prize pot
  if (lb.length > 0) {
    cards.push(mkCard('👥', 'Entries', String(lb.length), `Prize pot: £${lb.length * 5}`, 'gold'));
  }

  const grid = document.getElementById('insights-grid');
  if (grid) {
    grid.innerHTML = cards.length
      ? cards.join('')
      : '<div class="ins-loading">No data yet  check back soon!</div>';
  }

  // -- Latest result strip
  const wrap = document.getElementById('ins-recent-wrap');
  if (wrap) {
    if (recentMatch) {
      const ra = recentMatch.goals_a ?? recentMatch.score_a;
      const rb = recentMatch.goals_b ?? recentMatch.score_b;
      wrap.innerHTML = `<div class="ins-recent">
        <span class="ins-recent-label">Latest Result</span>
        <span class="ins-recent-score">
          ${teamFlag(recentMatch.team_a)}${trunc(recentMatch.team_a, 14)}
          &nbsp;<strong>${ra}${rb}</strong>&nbsp;
          ${teamFlag(recentMatch.team_b)}${trunc(recentMatch.team_b, 14)}
        </span>
      </div>`;
    } else {
      wrap.innerHTML = '';
    }
  }
}

function mkCard(icon, label, value, sub, colorClass) {
  return `<div class="insight-card">
    <div class="insight-icon">${icon}</div>
    <div class="insight-label">${label}</div>
    <div class="insight-value ${colorClass}">${value}</div>
    <div class="insight-sub">${sub}</div>
  </div>`;
}

function formatDate(d) {
  if (!d) return '';
  if (d.length <= 10) {
    const [y, mo, dy] = d.split('-').map(Number);
    return new Date(y, mo - 1, dy).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    }) + '  time TBC';
  }
  return new Date(d).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

document.addEventListener('DOMContentLoaded', initHome);

'use strict';

// -- Flag lookup for World Cup teams (from flags.js GROUPS) --------------------
const FLAG_CODES = {};
if (typeof GROUPS !== 'undefined') {
  GROUPS.forEach(g => g.teams.forEach(t => { FLAG_CODES[t.name] = t.code; }));
}
function flag(team) {
  const code = FLAG_CODES[team];
  return code ? `<span class="fi fi-${code}" title="${team}"></span> ` : '';
}

// -- Country → ISO code (for favourite national team flags) -------------------
const COUNTRY_FLAG = {
  'Afghanistan':'af','Albania':'al','Algeria':'dz','Angola':'ao',
  'Argentina':'ar','Australia':'au','Austria':'at','Bahrain':'bh',
  'Belgium':'be','Bolivia':'bo','Bosnia & Herzegovina':'ba','Brazil':'br',
  'Bulgaria':'bg','Cameroon':'cm','Canada':'ca','Chile':'cl','China':'cn',
  'Colombia':'co','Costa Rica':'cr','Croatia':'hr','Czech Republic':'cz',
  'Denmark':'dk','DR Congo':'cd','Ecuador':'ec','Egypt':'eg',
  'England':'gb-eng','France':'fr','Germany':'de','Ghana':'gh','Greece':'gr',
  'Honduras':'hn','Hungary':'hu','India':'in','Indonesia':'id','Iran':'ir',
  'Iraq':'iq','Ireland':'ie','Israel':'il','Italy':'it','Ivory Coast':'ci',
  'Jamaica':'jm','Japan':'jp','Jordan':'jo','Kenya':'ke','Mexico':'mx',
  'Morocco':'ma','Netherlands':'nl','New Zealand':'nz','Nigeria':'ng',
  'Northern Ireland':'gb-nir','Norway':'no','Panama':'pa','Paraguay':'py',
  'Peru':'pe','Poland':'pl','Portugal':'pt','Qatar':'qa','Romania':'ro',
  'Russia':'ru','Saudi Arabia':'sa','Scotland':'gb-sct','Senegal':'sn',
  'Serbia':'rs','Slovakia':'sk','Slovenia':'si','South Africa':'za',
  'South Korea':'kr','Spain':'es','Sweden':'se','Switzerland':'ch',
  'Trinidad & Tobago':'tt','Tunisia':'tn','Turkey':'tr','Ukraine':'ua',
  'United States':'us','Uruguay':'uy','Venezuela':'ve','Wales':'gb-wls',
};

// -- Club → 3-letter abbreviation ---------------------------------------------
const CLUB_ABBR = {
  'Arsenal':'ARS','Aston Villa':'AVL','Bournemouth':'BOU','Brentford':'BRE',
  'Brighton & Hove Albion':'BHA','Chelsea':'CHE','Crystal Palace':'CRY',
  'Everton':'EVE','Fulham':'FUL','Ipswich Town':'IPS','Leicester City':'LEI',
  'Liverpool':'LIV','Manchester City':'MCI','Manchester United':'MUN',
  'Newcastle United':'NEW','Nottingham Forest':'NFO','Southampton':'SOU',
  'Tottenham Hotspur':'TOT','West Ham United':'WHU','Wolverhampton Wanderers':'WOL',
  'Birmingham City':'BIR','Blackburn Rovers':'BBR','Bristol City':'BSC',
  'Burnley':'BUR','Cardiff City':'CAR','Coventry City':'COV','Derby County':'DER',
  'Hull City':'HUL','Leeds United':'LEE','Luton Town':'LUT','Middlesbrough':'MID',
  'Millwall':'MWL','Norwich City':'NOR','Preston North End':'PNE',
  'Queens Park Rangers':'QPR','Sheffield United':'SHU','Sheffield Wednesday':'SHW',
  'Stoke City':'STK','Sunderland':'SUN','Swansea City':'SWA','Watford':'WAT',
  'West Bromwich Albion':'WBA','Aberdeen':'ABE','Celtic':'CEL','Hearts':'HEA',
  'Hibernian':'HIB','Rangers':'RAN','Athletic Club':'ATH','Atletico Madrid':'ATM',
  'Barcelona':'BAR','Real Betis':'BET','Real Madrid':'RMA','Real Sociedad':'RSO',
  'Sevilla':'SEV','Valencia':'VAL','Villarreal':'VIL','Bayer Leverkusen':'B04',
  'Bayern Munich':'BAY','Borussia Dortmund':'BVB','Borussia Mönchengladbach':'BMG',
  'Eintracht Frankfurt':'SGE','RB Leipzig':'RBL','Schalke 04':'S04',
  'Werder Bremen':'WER','AC Milan':'ACM','AS Roma':'ROM','Atalanta':'ATA',
  'Fiorentina':'FIO','Inter Milan':'INT','Juventus':'JUV','Lazio':'LAZ',
  'Napoli':'NAP','Lens':'LEN','Lille':'LIL','Lyon':'OL','Marseille':'OM',
  'Monaco':'MON','Paris Saint-Germain':'PSG','Ajax':'AJX','Feyenoord':'FEY',
  'PSV Eindhoven':'PSV','Anderlecht':'AND','Club Brugge':'BRU',
  'Fenerbahçe':'FEN','Galatasaray':'GAL','Shakhtar Donetsk':'SHA',
  'Dynamo Kyiv':'DYN','Benfica':'BEN','Porto':'POR','Sporting CP':'SCP',
  'Boca Juniors':'BOC','Flamengo':'FLA','River Plate':'RIV','Santos':'SAN',
  'São Paulo':'SAO','Al-Hilal':'HIL','Al-Nassr':'NAS','Club América':'AME',
  'Inter Miami':'MIA','Monterrey':'MTY','Tigres UANL':'TIG',
};

let currentTab    = 'overall';
let statsData     = {};

// Persist ranks across page refreshes via localStorage
function storageKey() { return `isweep_ranks_${currentTab}`; }
function loadPrevRanks() {
  try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); } catch { return {}; }
}
function savePrevRanks(ranks) {
  try { localStorage.setItem(storageKey(), JSON.stringify(ranks)); } catch {}
}
let previousRanks = loadPrevRanks();

// -- Stats cards ---------------------------------------------------------------
async function loadStats() {
  try {
    const r = await fetch('/api/stats');
    if (!r.ok) return;
    const d = await r.json();
    statsData = d;
    document.getElementById('stat-matches').textContent      = d.matchesPlayed  ?? '0';
    document.getElementById('stat-goals').textContent        = d.totalGoals     ?? '0';
    document.getElementById('stat-top').textContent          = d.topTeam        ?? '—';
    document.getElementById('stat-participants').textContent = d.participantCount ?? '0';
  } catch (_) {}
}

// -- Leaderboard ---------------------------------------------------------------
async function loadLeaderboard() {
  const endpoint = currentTab === 'overall'  ? '/api/leaderboard'
                 : currentTab === 'group'    ? '/api/leaderboard/group'
                 : '/api/leaderboard/knockout';
  const tbody = document.getElementById('standings-tbody');
  try {
    const r = await fetch(endpoint);
    if (!r.ok) throw new Error();
    renderLeaderboard(await r.json(), tbody);
  } catch {
    tbody.innerHTML = '<tr><td colspan="17" class="prem-loading">Failed to load — retrying…</td></tr>';
  }
}

function buildEntryRows(r, i, previousRanks) {
  const pos      = i + 1;
  const key      = `${r.name}:${r.entryIndex}`;
  const prev     = previousRanks[key];
  const expandId = `exp-${i}`;
  const trs      = [];

  const posClass   = pos === 1 ? 'pos-1' : pos === 2 ? 'pos-2' : pos === 3 ? 'pos-3' : '';
  const entryLabel = r.totalEntries > 1
    ? ` <span class="entry-num">#${r.entryIndex + 1}</span>` : '';

  const movHtml = prev == null ? '<span class="mov-new">NEW</span>'
                : prev > pos  ? `<span class="mov-up">▲${prev - pos}</span>`
                : prev < pos  ? `<span class="mov-dn">▼${pos - prev}</span>`
                : '<span class="mov-eq">—</span>';

  const nameCell  = `<td class="td-persona">${r.knownBy || '—'}</td>`;
  const flagCode  = r.countryTeam ? COUNTRY_FLAG[r.countryTeam] : null;
  const flagCell  = `<td class="td-persona">${
    flagCode ? `<span class="fi fi-${flagCode}" title="${r.countryTeam}" style="font-size:1.3rem"></span>` : '—'
  }</td>`;
  const abbr      = r.clubTeam ? (CLUB_ABBR[r.clubTeam] || r.clubTeam.slice(0,3).toUpperCase()) : null;
  const crestCell = `<td class="td-persona">${
    abbr ? `<span class="club-badge" title="${r.clubTeam}">${abbr}</span>` : '—'
  }</td>`;

  if (!r.assigned) {
    trs.push(`<tr class="${posClass}">
      <td class="td-pos">${pos}</td>
      <td class="td-mov">${movHtml}</td>
      <td class="td-name">${r.name}${entryLabel}</td>
      ${nameCell}${flagCell}${crestCell}
      <td class="td-stat">—</td><td class="td-stat">—</td><td class="td-stat">—</td>
      <td class="td-stat">—</td><td class="td-stat">—</td><td class="td-stat">—</td>
      <td class="td-stat">—</td><td class="td-stat">—</td><td class="td-stat">—</td>
      <td class="td-pts">—</td>
      <td class="td-expand-btn"></td>
    </tr>`);
    return trs;
  }

  const pts = r.stats ? r.stats.points : 0;
  const s   = r.stats;

  const allTeams = [
    r.pot1Team ? { team: r.pot1Team, pot: 1 } : null,
    ...(r.pot2Teams || []).filter(Boolean).map(t => ({ team: t, pot: 2 })),
    ...(r.pot3Teams || []).filter(Boolean).map(t => ({ team: t, pot: 3 })),
  ].filter(Boolean);

  const teamItems = allTeams.map(({ team, pot }) => {
    const tp = (r.teamPts && r.teamPts[team] != null) ? r.teamPts[team] : 0;
    return `<div class="team-pts-item">
      <span class="badge badge-pot${pot}">${flag(team)}${team}</span>
      <span class="team-pts-val">${tp} pts</span>
    </div>`;
  }).join('');

  trs.push(`<tr class="${posClass} main-row" data-expand="${expandId}">
    <td class="td-pos">${pos}</td>
    <td class="td-mov">${movHtml}</td>
    <td class="td-name">${r.name}${entryLabel}</td>
    ${nameCell}${flagCell}${crestCell}
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
    <td class="td-expand-btn"><button class="expand-btn" aria-expanded="false" title="Show drawn teams">▾</button></td>
  </tr>`);

  const statsHtml = s ? `
    <div class="exp-stats exp-stats-mobile">
      <span><em>${s.played}</em> P</span>
      <span class="pos"><em>${s.wins}</em> W</span>
      <span><em>${s.draws}</em> D</span>
      <span><em>${s.losses}</em> L</span>
      <span class="pos"><em>${s.goalsFor}</em> GF</span>
      <span class="neg"><em>${s.goalsAgainst}</em> GA</span>
      <span class="neg"><em>${s.yellowCards}</em> YC</span>
      <span class="neg"><em>${s.redCards}</em> RC</span>
      <span><em>${s.groupBonus}</em> Bon</span>
      <span style="color:var(--gold);font-weight:800"><em>${pts}</em> Pts</span>
    </div>` : '';

  trs.push(`<tr class="expand-row" id="${expandId}" hidden>
    <td colspan="15">
      <div class="exp-teams">${teamItems}</div>
      ${statsHtml}
    </td>
  </tr>`);

  return trs;
}

function buildNewsFeedRow(rows, newRanks) {
  // Compute insights from leaderboard data + cached stats
  const cards = [];

  // 1. Current leader
  const leader = rows[0];
  if (leader) {
    const leaderPts = leader.stats ? leader.stats.points : 0;
    cards.push({ icon: '🏆', label: 'Leading', value: leader.knownBy || leader.name, sub: `${leaderPts} pts` });
  }

  // 2. Biggest climber & faller
  let topClimber = null, topClimberDelta = 0;
  let topFaller  = null, topFallerDelta  = 0;
  let newCount   = 0;
  rows.forEach((r, i) => {
    const key  = `${r.name}:${r.entryIndex}`;
    const prev = previousRanks[key];
    if (prev == null) { newCount++; return; }
    const delta = prev - (i + 1);
    if (delta > topClimberDelta) { topClimberDelta = delta; topClimber = r; }
    if (delta < topFallerDelta)  { topFallerDelta  = delta; topFaller  = r; }
  });

  if (topClimber) {
    cards.push({ icon: '📈', label: 'On the Rise', value: topClimber.knownBy || topClimber.name, sub: `▲${topClimberDelta} place${topClimberDelta > 1 ? 's' : ''}` });
  }
  if (topFaller) {
    cards.push({ icon: '📉', label: 'Slipping', value: topFaller.knownBy || topFaller.name, sub: `▼${Math.abs(topFallerDelta)} place${Math.abs(topFallerDelta) > 1 ? 's' : ''}` });
  }

  // 3. New entries
  if (newCount > 0) {
    cards.push({ icon: '🆕', label: 'New Entries', value: `${newCount}`, sub: 'just joined' });
  }

  // 4. Stats-derived cards
  if (statsData.topTeam) {
    cards.push({ icon: '⭐', label: 'Hottest Nation', value: statsData.topTeam, sub: 'most pts so far' });
  }
  if (statsData.matchesPlayed > 0) {
    cards.push({ icon: '⚽', label: 'Goals', value: `${statsData.totalGoals}`, sub: `in ${statsData.matchesPlayed} matches` });
  }

  // 6. Total entries
  cards.push({ icon: '👥', label: 'Total Entries', value: `${rows.length}`, sub: 'sweepstakers' });

  // Build card HTML
  const cardHtml = cards.map(c => `
    <div class="nf-card">
      <div class="nf-icon">${c.icon}</div>
      <div class="nf-body">
        <div class="nf-label">${c.label}</div>
        <div class="nf-value">${c.value}</div>
        <div class="nf-sub">${c.sub}</div>
      </div>
    </div>`).join('');

  return `<tr class="news-feed-row">
    <td colspan="17">
      <div class="news-feed-wrap">
        <div class="news-feed-hd"><span class="nf-pulse"></span> iSweep News</div>
        <div class="news-feed-cards">${cardHtml}</div>
      </div>
    </td>
  </tr>`;
}

function renderLeaderboard(rows, tbody) {
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="17" class="prem-loading text-muted">No entries yet.</td></tr>';
    return;
  }

  const newRanks = {};
  rows.forEach((r, i) => { newRanks[`${r.name}:${r.entryIndex}`] = i + 1; });

  const trs = [];
  const SPLIT = 10;

  // Section label: Top 10
  trs.push(`<tr class="lb-section-row"><td colspan="17"><span class="lb-section-lbl">🏆 Top 10</span></td></tr>`);

  rows.forEach((r, i) => {
    // After top 10: inject news feed then "The Rest" header
    if (i === SPLIT) {
      trs.push(buildNewsFeedRow(rows, newRanks));
      trs.push(`<tr class="lb-section-row lb-section-rest"><td colspan="17"><span class="lb-section-lbl">The Rest</span></td></tr>`);
    }
    buildEntryRows(r, i, previousRanks).forEach(tr => trs.push(tr));
  });

  // If ≤10 entries, still show the news feed at the bottom
  if (rows.length <= SPLIT) {
    trs.push(buildNewsFeedRow(rows, newRanks));
  }

  tbody.innerHTML = trs.join('');
  savePrevRanks(newRanks);
  previousRanks  = newRanks;

  // Wire expand buttons
  tbody.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mainRow  = btn.closest('tr');
      const expandId = mainRow.dataset.expand;
      const expRow   = document.getElementById(expandId);
      const nowOpen  = expRow.hasAttribute('hidden');
      expRow.toggleAttribute('hidden', !nowOpen);
      btn.textContent = nowOpen ? '▴' : '▾';
      btn.setAttribute('aria-expanded', String(nowOpen));
    });
  });
}

// -- Tabs ----------------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTab    = btn.dataset.tab;
    previousRanks = loadPrevRanks();
    loadLeaderboard();
  });
});

// -- Refresh countdown ---------------------------------------------------------
let secs = 60;
function tick() {
  document.getElementById('countdown').textContent = secs;
  if (--secs < 0) { secs = 60; loadStats(); loadLeaderboard(); }
}

loadStats();
loadLeaderboard();
setInterval(tick, 1000);

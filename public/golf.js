'use strict';

/* ---------------------------------------------------------
   SCHEDULE — [holeNumber(1–7), playerAIdx, playerBIdx], 0-based.
   Single round-robin across 8 players: each plays every other once,
   4 simultaneous matches per hole, 7 holes total. Semis then play
   holes 8–10, the final holes 11–14. Holes 15–18 are personal-
   scorecard-only (still usable by Front Six/Middlesex/Back Six/PP).
--------------------------------------------------------- */
const SCHEDULE = [
  [1,0,7],[1,1,6],[1,2,5],[1,3,4],
  [2,0,1],[2,2,7],[2,3,6],[2,4,5],
  [3,0,2],[3,3,1],[3,4,7],[3,5,6],
  [4,0,3],[4,4,2],[4,5,1],[4,6,7],
  [5,0,4],[5,5,3],[5,6,2],[5,7,1],
  [6,0,5],[6,6,4],[6,7,3],[6,1,2],
  [7,0,6],[7,7,5],[7,1,4],[7,2,3],
];

const POLL_MS = 5000;
const MY_PLAYER_KEY = 'golf_my_player_idx';

const NUM_PLAYERS = 8;

let players = [
  {name:"Player 1",handicap:18},{name:"Player 2",handicap:18},{name:"Player 3",handicap:18},
  {name:"Player 4",handicap:18},{name:"Player 5",handicap:18},{name:"Player 6",handicap:18},
  {name:"Player 7",handicap:18},{name:"Player 8",handicap:18},
];
let course = {};    // holeNumber (1-18) -> {par, stroke_index}
let savedCourses = []; // [{id, name, created_at}]
let trophies = []; // [{id, competition, year, winner, created_at}]
const TROPHY_COMPETITIONS = [
  'St Georges Day', 'Christmas Crumble', 'Easter Brighton',
  'Champions League Final', 'Flying Ants Day', 'World Cup',
];
let scores = {};    // playerIdx -> { holeNumber -> {shots, fairway, gir, one_putt, putting_points} }
let sideDraw = { frontSix: null, middlesexSix: null };
let settings = { stake: 0, formats: { football: false, six66: false, pp: false } };

let currentTab = "scorecard";
let selectedPlayerIdx = parseInt(localStorage.getItem(MY_PLAYER_KEY), 10);
if(isNaN(selectedPlayerIdx) || selectedPlayerIdx < 0 || selectedPlayerIdx >= NUM_PLAYERS) selectedPlayerIdx = 0;

let pollTimer = null;
let inFlight = false;

/* ---------------------------------------------------------
   NETWORKING
--------------------------------------------------------- */
async function loadState(){
  try{
    const res = await fetch(`/api/golf/state?_=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    players = new Array(NUM_PLAYERS).fill(0).map((_,i)=>{
      const row = data.players.find(p=>p.idx===i);
      return row ? { name: row.name, handicap: row.handicap } : { name:`Player ${i+1}`, handicap:18 };
    });
    course = {};
    data.course.forEach(row=>{ course[row.hole_number] = { par: row.par, stroke_index: row.stroke_index }; });
    scores = {};
    for(let i=0;i<NUM_PLAYERS;i++) scores[i] = {};
    data.scores.forEach(row=>{
      scores[row.player_idx][row.hole_number] = {
        shots: row.shots, fairway: !!row.fairway, gir: !!row.gir, one_putt: !!row.one_putt,
        putting_points: row.putting_points || 0,
        lost_balls: row.lost_balls || 0,
      };
    });
    sideDraw = data.sideDraw || { frontSix: null, middlesexSix: null };
    if(data.settings){
      settings = {
        stake: data.settings.stake || 0,
        formats: data.settings.formats || { football:false, six66:false, pp:false },
      };
    }
    render();
  }catch(e){
    console.error('Failed to load golf state', e);
  }
}

async function postJson(url, body){
  try{
    await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  }catch(e){
    console.error('Failed to save', url, body, e);
  }
}

async function loadSavedCourses(){
  try{
    const res = await fetch('/api/golf/courses');
    savedCourses = await res.json();
    if(currentTab==='course' || currentTab==='setup') render();
  }catch(e){
    console.error('Failed to load saved courses', e);
  }
}

async function loadTrophies(){
  try{
    const res = await fetch('/api/golf/trophies');
    trophies = await res.json();
    if(currentTab==='trophies') render();
  }catch(e){
    console.error('Failed to load trophies', e);
  }
}

function startPolling(){
  if(pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(()=>{
    const typing = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT');
    if(!inFlight && !typing) loadState();
  }, POLL_MS);
}

/* ---------------------------------------------------------
   COURSE / SCORE HELPERS
--------------------------------------------------------- */
function courseInfo(holeNumber){ return course[holeNumber] || { par:4, stroke_index: holeNumber }; }
function scoreFor(playerIdx, holeNumber){ return (scores[playerIdx] && scores[playerIdx][holeNumber]) || {}; }

function strokesReceived(handicap, strokeIndex){
  const h = Math.max(0, parseInt(handicap,10) || 0);
  return Math.floor(h/18) + (strokeIndex <= (h % 18) ? 1 : 0);
}
// Standard Stableford points for one hole; null if no score entered yet.
function stablefordPoints(shots, handicap, par, strokeIndex){
  if(shots===null || shots===undefined || shots==='') return null;
  const rec = strokesReceived(handicap, strokeIndex);
  const net = shots - rec;
  return Math.max(0, 2 - (net - par));
}

// Sweepstake hole result: compares two players' Stableford points on a hole,
// awards 2/1/0 match points, and stacks each player's own bonus points on top.
function matchResultForHole(idxA, idxB, holeNumber){
  const { par, stroke_index } = courseInfo(holeNumber);
  const sA = scoreFor(idxA, holeNumber), sB = scoreFor(idxB, holeNumber);
  const ptsA = stablefordPoints(sA.shots, players[idxA].handicap, par, stroke_index);
  const ptsB = stablefordPoints(sB.shots, players[idxB].handicap, par, stroke_index);
  const bonusA = (sA.fairway?1:0)+(sA.gir?1:0)+(sA.one_putt?1:0);
  const bonusB = (sB.fairway?1:0)+(sB.gir?1:0)+(sB.one_putt?1:0);
  if(ptsA===null || ptsB===null){
    return { stableA:ptsA, stableB:ptsB, totalA:bonusA, totalB:bonusB, pending:true };
  }
  let matchA=0, matchB=0;
  if(ptsA>ptsB) matchA=2;
  else if(ptsB>ptsA) matchB=2;
  else { matchA=1; matchB=1; }
  return { stableA:ptsA, stableB:ptsB, totalA:matchA+bonusA, totalB:matchB+bonusB, pending:false };
}

function stageTotals(idxA, idxB, holeNumbers){
  let a=0, b=0, complete=true;
  holeNumbers.forEach(hn=>{
    const r = matchResultForHole(idxA, idxB, hn);
    if(r.pending) complete=false;
    a+=r.totalA; b+=r.totalB;
  });
  return { a, b, complete };
}
function stageWinner(idxA, idxB, holeNumbers, nameA, nameB){
  const t = stageTotals(idxA, idxB, holeNumbers);
  if(!t.complete) return null;
  if(t.a>t.b) return nameA;
  if(t.b>t.a) return nameB;
  return "TIE";
}

function computeStandings(){
  const pts = new Array(NUM_PLAYERS).fill(0);
  SCHEDULE.forEach(([holeNumber, aIdx, bIdx])=>{
    const r = matchResultForHole(aIdx, bIdx, holeNumber);
    pts[aIdx] += r.totalA;
    pts[bIdx] += r.totalB;
  });
  const rows = players.map((p,i)=>({idx:i, name:p.name, pts:pts[i]}));
  rows.sort((a,b)=> b.pts - a.pts);
  let rank=0, prevPts=null, seen=0;
  rows.forEach(r=>{
    seen++;
    if(r.pts !== prevPts){ rank = seen; prevPts = r.pts; }
    r.rank = rank;
  });
  return rows;
}

/* ---------------------------------------------------------
   SIDE COMPETITIONS — personal Stableford across arbitrary hole
   sets (Front Six / Middlesex / Back 6 / all 18), and Putting Points.
--------------------------------------------------------- */
function personalStablefordForHoles(playerIdx, holeNumbers){
  let total = 0;
  holeNumbers.forEach(hn=>{
    const s = scoreFor(playerIdx, hn);
    const info = courseInfo(hn);
    const p = stablefordPoints(s.shots, players[playerIdx].handicap, info.par, info.stroke_index);
    if(p!==null) total += p;
  });
  return total;
}
function personalPuttingPointsForHoles(playerIdx, holeNumbers){
  let total = 0;
  holeNumbers.forEach(hn=>{ total += scoreFor(playerIdx, hn).putting_points || 0; });
  return total;
}
function rankPlayers(scoreFn, idxs){
  const list = idxs || players.map((_,i)=>i);
  const rows = list.map(i=>({idx:i, name:players[i].name, pts:scoreFn(i)}));
  rows.sort((a,b)=> b.pts - a.pts);
  let rank=0, prevPts=null, seen=0;
  rows.forEach(r=>{
    seen++;
    if(r.pts !== prevPts){ rank = seen; prevPts = r.pts; }
    r.rank = rank;
  });
  return rows;
}
function namedPlayerIdxs(){
  return players.map((p,i)=>i).filter(i => (players[i].name || '').trim() !== '');
}
const ALL_18 = Array.from({length:18}, (_,i)=>i+1);
function overallStandings(){ return rankPlayers(i => personalStablefordForHoles(i, ALL_18), namedPlayerIdxs()); }
function puttingStandings(){ return rankPlayers(i => personalPuttingPointsForHoles(i, ALL_18), namedPlayerIdxs()); }
function sixHoleStandings(holeNumbers){ return rankPlayers(i => personalStablefordForHoles(i, holeNumbers), namedPlayerIdxs()); }
function backSixHoles(){
  if(!sideDraw.frontSix || !sideDraw.middlesexSix) return null;
  const used = new Set([...sideDraw.frontSix, ...sideDraw.middlesexSix]);
  return ALL_18.filter(h => !used.has(h));
}

/* ---------------------------------------------------------
   RENDER HELPERS
--------------------------------------------------------- */
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function ptsLabel(n){ return `${n} pt${n===1?'':'s'}`; }

function render(){
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab === currentTab);
  });
  const el = document.getElementById('golf-content');
  if(currentTab==='scorecard') el.innerHTML = renderScorecard();
  else if(currentTab==='setup') el.innerHTML = renderSetup();
  else if(currentTab==='course') el.innerHTML = renderCourse();
  else if(currentTab==='standings') el.innerHTML = renderStandings();
  else if(currentTab==='semis') el.innerHTML = renderSemis();
  else if(currentTab==='final') el.innerHTML = renderFinal();
  else if(currentTab==='sidebets') el.innerHTML = renderSideBets();
  else if(currentTab==='stats') el.innerHTML = renderStats();
  else if(currentTab==='trophies') el.innerHTML = renderTrophyCabinet();
  attachHandlers();
}

/* ---------------------------------------------------------
   MY SCORECARD TAB — each player enters their own round, 18 holes
--------------------------------------------------------- */
function scRowHtml(playerIdx, holeNumber){
  const info = courseInfo(holeNumber);
  const s = scoreFor(playerIdx, holeNumber);
  const pts = stablefordPoints(s.shots, players[playerIdx].handicap, info.par, info.stroke_index);
  return `
    <div class="sc-row" data-hole="${holeNumber}">
      <div class="sc-holecell">
        <div class="sc-hole">${holeNumber}</div>
        <div class="sc-muted">Par ${info.par}<br>SI ${info.stroke_index}</div>
      </div>
      <div class="sc-shots"><input type="number" min="1" max="20" inputmode="numeric" data-field="shots" value="${s.shots ?? ''}"></div>
      <div class="sc-pts" id="sc-pts-${holeNumber}">${pts===null?'–':pts}</div>
      <div class="sc-tick"><input type="checkbox" data-field="fairway" ${s.fairway?'checked':''}></div>
      <div class="sc-tick"><input type="checkbox" data-field="gir" ${s.gir?'checked':''}></div>
      <div class="sc-tick"><input type="checkbox" data-field="one_putt" ${s.one_putt?'checked':''}></div>
      <div class="sc-puttcell"><input type="number" min="0" max="6" inputmode="numeric" data-field="putting_points" value="${s.putting_points || 0}"></div>
      <div class="sc-lbcell"><input type="number" min="0" max="20" inputmode="numeric" data-field="lost_balls" value="${s.lost_balls || 0}"></div>
    </div>
  `;
}

function scSubtotalHtml(label, playerIdx, holeNumbers, cls){
  let shotsSum = 0, ptsSum = 0, puttSum = 0, lbSum = 0, anyShots = false;
  let fairwayCount = 0, girCount = 0, onePuttCount = 0;
  holeNumbers.forEach(hn=>{
    const s = scoreFor(playerIdx, hn);
    if(s.shots!=null){ shotsSum += s.shots; anyShots = true; }
    const info = courseInfo(hn);
    const p = stablefordPoints(s.shots, players[playerIdx].handicap, info.par, info.stroke_index);
    if(p!==null) ptsSum += p;
    puttSum += s.putting_points || 0;
    lbSum += s.lost_balls || 0;
    if(s.fairway) fairwayCount++;
    if(s.gir) girCount++;
    if(s.one_putt) onePuttCount++;
  });
  return `
    <div class="sc-row ${cls}">
      <div class="sc-holecell"><div class="sc-hole" style="font-size:0.85rem;">${label}</div></div>
      <div class="sc-shots" style="text-align:center;">${anyShots ? shotsSum : ''}</div>
      <div class="sc-pts">${ptsSum}</div>
      <div class="sc-tick">${fairwayCount}</div>
      <div class="sc-tick">${girCount}</div>
      <div class="sc-tick">${onePuttCount}</div>
      <div class="sc-puttcell" style="text-align:center;">${puttSum}</div>
      <div class="sc-lbcell" style="text-align:center;">${lbSum}</div>
    </div>
  `;
}

function scHeaderRowHtml(){
  return `
    <div class="sc-row sc-headerrow">
      <div class="sc-holecell">Hole</div>
      <div class="sc-shots">Score</div>
      <div class="sc-pts">Pts</div>
      <div class="sc-tick">F</div>
      <div class="sc-tick">GIR</div>
      <div class="sc-tick">1P</div>
      <div class="sc-puttcell">Putt</div>
      <div class="sc-lbcell">LB</div>
    </div>
  `;
}

function renderScorecard(){
  const chips = players.map((p,i)=>`<button class="player-chip ${i===selectedPlayerIdx?'selected':''}" data-select-player="${i}">${escapeHtml(p.name)}</button>`).join('');
  const out = []; for(let h=1;h<=9;h++) out.push(h);
  const inn = []; for(let h=10;h<=18;h++) inn.push(h);
  const p = players[selectedPlayerIdx];

  return `
    <div class="player-picker">${chips}</div>
    <div class="rules-note">
      <b>${escapeHtml(p.name)}</b> · handicap ${p.handicap} — enter your gross shots for each hole and the Stableford points work themselves out. Keep going through all 18 even after your bracket matches are decided. "Putt" is your score for the Putting Points competition (0–6, your call). "LB" is how many balls you lost on that hole.
    </div>
    <div class="scorecard" id="scorecard-body">
      ${scHeaderRowHtml()}
      ${out.map(h=>scRowHtml(selectedPlayerIdx,h)).join('')}
      ${scSubtotalHtml('OUT', selectedPlayerIdx, out, 'subtotal')}
      ${scHeaderRowHtml()}
      ${inn.map(h=>scRowHtml(selectedPlayerIdx,h)).join('')}
      ${scSubtotalHtml('IN', selectedPlayerIdx, inn, 'subtotal')}
      ${scSubtotalHtml('TOTAL', selectedPlayerIdx, out.concat(inn), 'total')}
    </div>
  `;
}

/* ---------------------------------------------------------
   SETUP (Players) TAB
--------------------------------------------------------- */
function renderSetup(){
  const rows = players.map((p,i)=>`
    <div class="player-row">
      <div class="player-badge">${i+1}</div>
      <div class="form-group" style="flex:1; margin-bottom:0;">
        <input type="text" data-player-idx="${i}" data-player-field="name" value="${escapeHtml(p.name)}" placeholder="Player ${i+1}">
      </div>
      <div class="form-group hcap-group" style="margin-bottom:0;">
        <input type="number" min="1" max="36" data-player-idx="${i}" data-player-field="handicap" value="${p.handicap}">
        <span class="hcap-label">h'cap</span>
      </div>
      <span class="save-tick" data-tick="${i}">Saved</span>
    </div>
  `).join('');
  return `
    <div class="rules-note">Type a name or handicap and it saves automatically for everyone. Each player enters their own scores on the My Scorecard tab.</div>
    <div class="card">${rows}</div>
    <div class="card">
      <h2>Competition</h2>
      <div style="font-size:0.85rem; color:var(--muted); margin-bottom:0.9rem;">Choose which competitions are being played this round. Switching one off hides it elsewhere on the site.</div>
      <div class="format-row">
        <label class="format-check">
          <input type="checkbox" id="fmt-football" ${settings.formats.football?'checked':''}>
          <span><b>Football</b> — the Table, Semis &amp; Final bracket</span>
        </label>
        <label class="format-check">
          <input type="checkbox" id="fmt-six66" ${settings.formats.six66?'checked':''}>
          <span><b>666</b> — Front Six, Middlesex &amp; Back 6</span>
        </label>
        <label class="format-check">
          <input type="checkbox" id="fmt-pp" ${settings.formats.pp?'checked':''}>
          <span><b>PP</b> — Putting Points</span>
        </label>
      </div>
    </div>
    <div class="card">
      <h2>Stake</h2>
      <div style="font-size:0.85rem; color:var(--muted); margin-bottom:0.9rem;">What each player is betting. The 666 and PP tab splits the total pot equally across whichever of 666/PP competitions are switched on above.</div>
      <div style="display:flex; align-items:center; gap:0.6rem;">
        <label for="stake-input" style="font-weight:800; color:var(--gold);">£</label>
        <input type="number" id="stake-input" min="0" step="0.5" value="${settings.stake || ''}" placeholder="0" style="width:100px;">
        <span style="font-size:0.8rem; color:var(--muted);">per player</span>
      </div>
      <div id="stake-msg"></div>
    </div>
    <div class="card">
      <h2>Course</h2>
      <div style="font-size:0.85rem; color:var(--muted); margin-bottom:0.9rem;">Load a saved course to fill in the Course tab's par and stroke index for you.</div>
      <div style="display:flex; gap:0.5rem;">
        <select id="format-course-select" style="flex:1;">
          <option value="">${savedCourses.length ? 'Choose a saved course…' : 'No saved courses yet'}</option>
          ${savedCourses.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" id="format-load-course-btn" style="width:auto; white-space:nowrap;" ${savedCourses.length?'':'disabled'}>Load</button>
      </div>
      <div id="format-course-msg"></div>
    </div>
    <div class="card">
      <h2>Scoring</h2>
      <div style="font-size:0.88rem; line-height:1.8; color:var(--muted);">
        Your <b style="color:var(--gold)">Scorecard</b> tab shows standard Stableford points (net score vs. par, using your handicap) for your own round.<br><br>
        For the group stage, semis and final, whoever scores more Stableford points on a shared hole wins it:<br>
        <b style="color:var(--gold)">2 pts</b> — win the hole · <b style="color:var(--gold)">1 pt</b> — halve it<br>
        plus <b style="color:var(--gold)">1 pt each</b> for fairway, GIR, and first-putt hole-outs.
      </div>
    </div>
    <div class="card" style="border-color:rgba(168,64,47,0.35);">
      <h2 style="color:var(--danger);">Danger zone</h2>
      <div style="font-size:0.85rem; color:var(--muted); margin-bottom:0.9rem;">
        Wipes every score, clears all eight player names back to blank, and resets handicaps, course settings, the stake and the competition picker back to defaults. Use this to start a fresh round.
      </div>
      <button class="btn btn-danger" id="resetAllBtn" style="width:100%;">Delete all golf data</button>
      <div id="reset-msg"></div>
    </div>
  `;
}

/* ---------------------------------------------------------
   COURSE TAB
--------------------------------------------------------- */
function renderCourse(){
  let rows = '';
  for(let h=1; h<=18; h++){
    const info = courseInfo(h);
    let section = '';
    if(h===1) section = 'Group stage · holes 1–10';
    if(h===11) section = 'Semi-finals · holes 11–13';
    if(h===14) section = 'Final · holes 14–17';
    if(h===18) section = 'Extra hole (personal scorecard only)';
    rows += `
      ${section ? `<div class="course-section">${section}</div>` : ''}
      <div class="course-row">
        <div class="course-hole">Hole ${h}</div>
        <div class="course-field"><label>Par</label><input type="number" min="3" max="6" data-hole="${h}" data-course-field="par" value="${info.par}"></div>
        <div class="course-field"><label>Stroke index</label><input type="number" min="1" max="18" data-hole="${h}" data-course-field="strokeIndex" value="${info.stroke_index}"></div>
      </div>
    `;
  }
  const presetRows = savedCourses.map(p=>`
    <div class="preset-row">
      <div class="preset-name">${escapeHtml(p.name)}</div>
      <button class="btn btn-outline btn-sm" data-load-course="${p.id}" data-course-name="${escapeHtml(p.name)}">Load</button>
      <button class="btn btn-sm preset-delete" data-delete-course="${p.id}" data-course-name="${escapeHtml(p.name)}">✕</button>
    </div>
  `).join('') || `<div class="tbd" style="padding:1rem;">No saved courses yet.</div>`;

  return `
    <div class="rules-note">Set the par and stroke index (1 = hardest, 18 = easiest) for each hole. This drives the automatic Stableford calculation everywhere else on this page.</div>
    <div class="card">${rows}</div>
    <div class="card">
      <h2>Saved courses</h2>
      <div style="font-size:0.85rem; color:var(--muted); margin-bottom:0.9rem;">Save the par/stroke-index setup above under a name so you can reuse this course another time, or load one you've saved before.</div>
      <div style="display:flex; gap:0.5rem; margin-bottom:1rem;">
        <input type="text" id="course-name-input" placeholder="e.g. Members' Course" style="flex:1;">
        <button class="btn btn-primary btn-sm" id="save-course-btn" style="width:auto; white-space:nowrap;">Save current</button>
      </div>
      <div id="course-list">${presetRows}</div>
      <div id="course-msg"></div>
    </div>
  `;
}

/* ---------------------------------------------------------
   STANDINGS TAB
--------------------------------------------------------- */
function renderStandings(){
  if(!settings.formats.football){
    return `<div class="card"><div class="tbd">Football isn't switched on for this round — turn it on in the Competition card on the Format tab to see the table.</div></div>`;
  }
  const rows = computeStandings();
  const body = rows.map((r,i)=>`
    <tr class="${i<4?'qualify':''}">
      <td><span class="rank-pill">${r.rank}</span></td>
      <td>${escapeHtml(r.name)}</td>
      <td style="text-align:right" class="pts-mono">${r.pts}</td>
    </tr>
  `).join('');
  const tie = rows[3] && rows[4] && rows[3].pts === rows[4].pts;
  return `
    <div class="card">
      <table class="standings">
        <thead><tr><th>Rank</th><th>Player</th><th style="text-align:right">Points</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="rules-note">
      Highlighted rows qualify for the semi-finals: 1st plays 4th, 2nd plays 3rd. Scores come straight from everyone's own Scorecard tab.
      ${tie ? '<br><b>Note:</b> there is a tie around 4th place — agree a tie-break before confirming the semi-final line-up.' : ''}
    </div>
  `;
}

/* ---------------------------------------------------------
   KNOCKOUT SUMMARY (read-only) — Semis / Final
--------------------------------------------------------- */
function renderStageSummary(opts){
  const { idxA, idxB, holeNumbers, nameA, nameB, title, championStyle } = opts;
  if(idxA===null || idxB===null){
    return `<h2 style="margin-bottom:0.75rem;">${title}</h2><div class="card"><div class="tbd">${opts.subtitle}</div></div>`;
  }
  const rows = holeNumbers.map(hn=>{
    const r = matchResultForHole(idxA, idxB, hn);
    const stableLabel = r.pending ? 'not played yet' : `${r.stableA} – ${r.stableB}`;
    return `
      <div class="ko-hole-row">
        <div class="hole-tag">Hole ${hn}</div>
        <div class="stable">${stableLabel}</div>
        <div class="pts">${r.pending ? '–' : `${r.totalA} – ${r.totalB}`}</div>
      </div>
    `;
  }).join('');
  const totals = stageTotals(idxA, idxB, holeNumbers);
  const winner = stageWinner(idxA, idxB, holeNumbers, nameA, nameB);

  let banner = '';
  if(totals.complete){
    if(winner === 'TIE'){
      banner = `<div class="winner-banner"><span class="label">Result</span><span class="name">Tied ${totals.a}–${totals.b}</span></div><div class="tie-note">Scores level — play a sudden-death hole to separate them.</div>`;
    } else {
      banner = `<div class="winner-banner ${championStyle?'champion-banner':''}">
        ${championStyle?'<span class="trophy">🏆</span>':''}
        <span class="label">${championStyle?'Champion':'Winner'}</span>
        <span class="name">${escapeHtml(winner)}</span>
      </div>`;
    }
  }

  return `
    <h2 style="margin-bottom:0.5rem;">${title}</h2>
    <div class="rules-note">${escapeHtml(nameA)} vs ${escapeHtml(nameB)} · holes ${holeNumbers[0]}–${holeNumbers[holeNumbers.length-1]} · most points wins. Both players keep entering scores on their own Scorecard tab — this updates automatically.</div>
    <div class="card">${rows}</div>
    <div class="card" style="display:flex; justify-content:space-between; font-family:ui-monospace,monospace; font-weight:700;">
      <span>${escapeHtml(nameA)}: ${totals.a}</span>
      <span>${escapeHtml(nameB)}: ${totals.b}</span>
    </div>
    ${banner}
  `;
}

function renderSemis(){
  if(!settings.formats.football){
    return `<div class="card"><div class="tbd">Football isn't switched on for this round — turn it on in the Competition card on the Format tab to see the semis.</div></div>`;
  }
  const standings = computeStandings();
  const [seed1, seed2, seed3, seed4] = standings;
  const groupHoles = SCHEDULE.map(s=>s[0]).filter((v,i,a)=>a.indexOf(v)===i);
  const groupDone = groupHoles.every(hn =>
    SCHEDULE.filter(s=>s[0]===hn).every(([, a, b]) => !matchResultForHole(a,b,hn).pending)
  );
  if(!groupDone){
    return `
      <h2 style="margin-bottom:0.75rem;">Semi-Final 1</h2>
      <div class="card"><div class="tbd">Finish all 7 holes of the group stage to lock in the semi-final line-up.</div></div>
      <h2 style="margin-bottom:0.75rem;">Semi-Final 2</h2>
      <div class="card"><div class="tbd">Finish all 7 holes of the group stage to lock in the semi-final line-up.</div></div>
    `;
  }
  const sf1 = renderStageSummary({
    idxA: seed1.idx, idxB: seed4.idx, holeNumbers:[8,9,10],
    nameA: seed1.name, nameB: seed4.name, title:'Semi-Final 1 (Seed 1 v Seed 4)',
  });
  const sf2 = renderStageSummary({
    idxA: seed2.idx, idxB: seed3.idx, holeNumbers:[8,9,10],
    nameA: seed2.name, nameB: seed3.name, title:'Semi-Final 2 (Seed 2 v Seed 3)',
  });
  return sf1 + sf2;
}

function renderFinal(){
  if(!settings.formats.football){
    return `<div class="card"><div class="tbd">Football isn't switched on for this round — turn it on in the Competition card on the Format tab to see the final.</div></div>`;
  }
  const standings = computeStandings();
  const [seed1, seed2, seed3, seed4] = standings;
  const w1 = stageWinner(seed1.idx, seed4.idx, [8,9,10], seed1.name, seed4.name);
  const w2 = stageWinner(seed2.idx, seed3.idx, [8,9,10], seed2.name, seed3.name);
  const idxA = w1===seed1.name ? seed1.idx : w1===seed4.name ? seed4.idx : null;
  const idxB = w2===seed2.name ? seed2.idx : w2===seed3.name ? seed3.idx : null;
  let subtitle = 'Complete both semi-finals to set the final.';
  if(w1==='TIE' || w2==='TIE') subtitle = 'A semi-final is tied — play a sudden-death hole there before the final can be set.';
  return renderStageSummary({
    idxA, idxB, holeNumbers:[11,12,13,14],
    nameA: idxA!==null?players[idxA].name:null, nameB: idxB!==null?players[idxB].name:null,
    title:'The Final', subtitle, championStyle:true,
  });
}

/* ---------------------------------------------------------
   SIDE BETS TAB — Front Six / Middlesex / Back 6 / Overall / Putting Points
--------------------------------------------------------- */
function miniLeaderboardHtml(rows){
  const body = rows.map(r=>`
    <tr class="${r.rank===1?'qualify':''}">
      <td><span class="rank-pill">${r.rank}</span></td>
      <td>${escapeHtml(r.name)}</td>
      <td style="text-align:right" class="pts-mono">${r.pts}</td>
    </tr>
  `).join('');
  return `<table class="standings"><thead><tr><th>Rank</th><th>Player</th><th style="text-align:right">Points</th></tr></thead><tbody>${body}</tbody></table>`;
}

function ballsInnerHtml(holeNumbers){
  return holeNumbers.slice().sort((a,b)=>a-b).map(h=>`<span class="hole-ball">${h}</span>`).join('');
}
function ballsHtml(holeNumbers){
  return `<div class="hole-balls">${ballsInnerHtml(holeNumbers)}</div>`;
}

function sixHoleSectionHtml(title, holeNumbers){
  const rows = sixHoleStandings(holeNumbers);
  if(rows.length === 0){
    return `<div class="card"><h2>${title}</h2><div class="tbd">Add player names on the Format tab to see this.</div></div>`;
  }
  const winner = rows[0];
  const tie = rows[1] && rows[1].pts === winner.pts;
  return `
    <div class="card">
      <h2>${title}</h2>
      ${ballsHtml(holeNumbers)}
      ${miniLeaderboardHtml(rows)}
      <div class="winner-banner" style="margin-top:0.9rem;">
        <span class="label">${tie ? 'Tied on top' : 'Winner'}</span>
        <span class="name">${tie ? rows.filter(r=>r.pts===winner.pts).map(r=>escapeHtml(r.name)).join(' & ') : escapeHtml(winner.name)}</span>
      </div>
    </div>
  `;
}

function spinPlaceholderHtml(id, label, buttonLabel, disabled, disabledNote){
  return `
    <div class="card">
      <h2>${label}</h2>
      <div class="hole-balls spin-display" id="${id}">${'<span class="hole-ball">?</span>'.repeat(6)}</div>
      ${disabled
        ? `<div class="tbd" style="padding:0.5rem 0 0;">${disabledNote}</div>`
        : `<button class="btn btn-primary" data-spin="${id}" style="width:100%; margin-top:0.9rem;">Spin the ${label}</button>`
      }
    </div>
  `;
}

function computeStakeTable(){
  const stake = settings.stake || 0;
  const activeIdxs = namedPlayerIdxs();
  if(activeIdxs.length < 2) return null;

  const categories = [];
  if(settings.formats.six66){
    if(sideDraw.frontSix) categories.push({ name:'Front Six', rows: rankPlayers(i => personalStablefordForHoles(i, sideDraw.frontSix), activeIdxs) });
    if(sideDraw.middlesexSix) categories.push({ name:'Middlesex', rows: rankPlayers(i => personalStablefordForHoles(i, sideDraw.middlesexSix), activeIdxs) });
    const bs = backSixHoles();
    if(bs) categories.push({ name:'Back 6', rows: rankPlayers(i => personalStablefordForHoles(i, bs), activeIdxs) });
  }
  if(settings.formats.pp){
    categories.push({ name:'Putting Points', rows: rankPlayers(i => personalPuttingPointsForHoles(i, ALL_18), activeIdxs) });
  }
  if(categories.length===0 || stake<=0) return null;

  const N = activeIdxs.length;
  const C = categories.length;
  const potPerCategory = stake * N / C;
  const contributionPerCategory = stake / C;
  const net = {};
  activeIdxs.forEach(idx => { net[idx] = { total:0, byCategory:{} }; });

  categories.forEach(cat=>{
    const topPts = cat.rows[0].pts;
    const winners = cat.rows.filter(r=>r.pts===topPts);
    const winShare = potPerCategory / winners.length;
    activeIdxs.forEach(idx=>{
      const isWinner = winners.some(w=>w.idx===idx);
      const amount = isWinner ? (winShare - contributionPerCategory) : -contributionPerCategory;
      net[idx].byCategory[cat.name] = amount;
      net[idx].total += amount;
    });
  });

  const settlements = computeSettlements(net, activeIdxs);

  return { categories, potPerCategory, contributionPerCategory, net, stake, N, C, activeIdxs, settlements };
}

// Turns each player's net win/loss into a minimal set of "who pays who" transfers.
function computeSettlements(net, activeIdxs){
  const creditors = [];
  const debtors = [];
  activeIdxs.forEach(idx=>{
    const amt = Math.round(net[idx].total * 100) / 100;
    if(amt > 0.005) creditors.push({ idx, amt });
    else if(amt < -0.005) debtors.push({ idx, amt: -amt });
  });
  creditors.sort((a,b)=> b.amt - a.amt);
  debtors.sort((a,b)=> b.amt - a.amt);

  const transfers = [];
  let ci = 0, di = 0;
  while(ci < creditors.length && di < debtors.length){
    const c = creditors[ci], d = debtors[di];
    const amount = Math.min(c.amt, d.amt);
    if(amount > 0.005) transfers.push({ from: d.idx, to: c.idx, amount });
    c.amt -= amount;
    d.amt -= amount;
    if(c.amt <= 0.005) ci++;
    if(d.amt <= 0.005) di++;
  }
  return transfers;
}

function moneyLabel(amount){
  const sign = amount > 0.001 ? '+' : '';
  return `${sign}£${amount.toFixed(2)}`;
}

function stakeTableHtml(){
  const data = computeStakeTable();
  if(!data){
    const named = namedPlayerIdxs().length;
    const note = named < 2
      ? 'Need at least 2 named players (on the Format tab) before stakes can be calculated.'
      : 'Set a stake on the Format tab (and make sure 666 and/or PP is switched on) to see the payout table.';
    return `
      <div class="card">
        <h2>Stakes</h2>
        <div class="tbd">${note}</div>
      </div>
    `;
  }
  const header = `<th>Player</th>` + data.categories.map(c=>`<th style="text-align:right">${escapeHtml(c.name)}</th>`).join('') + `<th style="text-align:right">Total</th>`;
  const rows = data.activeIdxs.map(idx=>{
    const p = players[idx];
    const cells = data.categories.map(c=>{
      const amt = data.net[idx].byCategory[c.name];
      const cls = amt > 0.001 ? 'stake-pos' : amt < -0.001 ? 'stake-neg' : '';
      return `<td style="text-align:right" class="${cls}">${moneyLabel(amt)}</td>`;
    }).join('');
    const totalAmt = data.net[idx].total;
    const totalCls = totalAmt > 0.001 ? 'stake-pos' : totalAmt < -0.001 ? 'stake-neg' : '';
    return `<tr><td>${escapeHtml(p.name)}</td>${cells}<td style="text-align:right" class="${totalCls}"><b>${moneyLabel(totalAmt)}</b></td></tr>`;
  }).join('');

  const settlementHtml = data.settlements.length === 0
    ? `<div class="tbd" style="padding:0.75rem 0 0;">Everyone's currently level — nothing to transfer.</div>`
    : `
      <div class="settle-list">
        ${data.settlements.map(t=>`
          <div class="settle-row">
            <span class="settle-from">${escapeHtml(players[t.from].name)}</span>
            <span class="settle-arrow">pays &rarr;</span>
            <span class="settle-to">${escapeHtml(players[t.to].name)}</span>
            <span class="settle-amount">£${t.amount.toFixed(2)}</span>
          </div>
        `).join('')}
      </div>
    `;

  return `
    <div class="card">
      <h2>Stakes</h2>
      <div class="rules-note">£${data.stake.toFixed(2)} per player &times; ${data.N} named players = £${(data.stake*data.N).toFixed(2)} total, split evenly across ${data.C} categor${data.C===1?'y':'ies'} &mdash; £${data.potPerCategory.toFixed(2)} each. Categories still to be drawn or with no scores yet aren't included until they're ready.</div>
      <div style="overflow-x:auto;">
        <table class="standings stake-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
    <div class="card">
      <h2>Who Owes Who</h2>
      <div class="rules-note">The fewest payments needed to settle everything up.</div>
      ${settlementHtml}
    </div>
  `;
}

function renderSideBets(){
  const six66On = settings.formats.six66;
  const ppOn = settings.formats.pp;
  const frontSix = sideDraw.frontSix;
  const middlesexSix = sideDraw.middlesexSix;
  const backSix = backSixHoles();

  const overall = overallStandings();
  const anyDrawn = frontSix || middlesexSix;

  const six66Html = !six66On ? '' : `
    ${frontSix ? sixHoleSectionHtml('Front Six', frontSix) : spinPlaceholderHtml('spin-front', 'Front Six', 'Front Six', false, '')}
    ${middlesexSix ? sixHoleSectionHtml('Middlesex', middlesexSix)
      : spinPlaceholderHtml('spin-middlesex', 'Middlesex', 'Middlesex', !frontSix, 'Spin the Front Six first.')}
    ${backSix ? sixHoleSectionHtml('Back 6', backSix)
      : `<div class="card"><h2>Back 6</h2><div class="tbd">Whatever's left once the Front Six and Middlesex are drawn.</div></div>`}
    ${anyDrawn ? `
      <div style="text-align:center; margin:0.5rem 0 1rem;">
        <button class="btn btn-outline btn-sm" id="redraw-btn">Redraw Front Six &amp; Middlesex</button>
      </div>
    ` : ''}
  `;

  const ppHtml = !ppOn ? '' : (()=>{
    const putting = puttingStandings();
    if(putting.length === 0){
      return `<div class="card"><h2>Putting Points</h2><div class="tbd">Add player names on the Format tab to see this.</div></div>`;
    }
    return `
      <div class="card">
        <h2>Putting Points</h2>
        <div class="rules-note">Each player's own 0&ndash;6 putting score, added up across all 18 holes &mdash; entered on the My Scorecard tab.</div>
        ${miniLeaderboardHtml(putting)}
        <div class="winner-banner" style="margin-top:0.9rem;">
          <span class="label">Winner</span>
          <span class="name">${escapeHtml(putting[0].name)}</span>
        </div>
      </div>
    `;
  })();

  if(!six66On && !ppOn){
    return `<div class="card"><div class="tbd">666 and PP are both switched off for this round — turn one or both on in the Competition card on the Format tab.</div></div>`;
  }

  if(overall.length === 0){
    return `<div class="card"><div class="tbd">Add player names on the Format tab to see 666 and PP.</div></div>`;
  }

  return `
    <div class="card">
      <h2>Overall Winner (18 Holes)</h2>
      <div class="rules-note">Total Stableford points across all 18 holes &mdash; the main personal-scoring competition, separate from the group/knockout bracket.</div>
      ${miniLeaderboardHtml(overall)}
      <div class="winner-banner champion-banner" style="margin-top:0.9rem;">
        <span class="trophy">🏆</span>
        <span class="label">Overall Champion</span>
        <span class="name">${escapeHtml(overall[0].name)}</span>
      </div>
    </div>

    ${six66Html}
    ${ppHtml}
    ${stakeTableHtml()}
  `;
}

/* ---------------------------------------------------------
   STATS TAB — Lost Balls / Scum Corner / Crumble chart
--------------------------------------------------------- */
function lostBallsTotal(playerIdx){
  let total = 0;
  ALL_18.forEach(hn => { total += scoreFor(playerIdx, hn).lost_balls || 0; });
  return total;
}
function rankPlayersAscending(scoreFn, idxs){
  const list = idxs || players.map((_,i)=>i);
  const rows = list.map(i=>({idx:i, name:players[i].name, pts:scoreFn(i)}));
  rows.sort((a,b)=> a.pts - b.pts);
  let rank=0, prevPts=null, seen=0;
  rows.forEach(r=>{
    seen++;
    if(r.pts !== prevPts){ rank = seen; prevPts = r.pts; }
    r.rank = rank;
  });
  return rows;
}
function lostBallsStandings(){ return rankPlayersAscending(i => lostBallsTotal(i), namedPlayerIdxs()); }

const CRUMBLE_COLORS = ['#FFBA00','#35D686','#FF6459','#5AC8FA','#C99BFF','#FF9F5A','#7FE3D0','#F06BAE'];

function crumbleChartSvg(){
  const activeIdxs = namedPlayerIdxs();
  if(activeIdxs.length === 0){
    return `<div class="tbd">Add player names on the Format tab to see this chart.</div>`;
  }
  const width = 700, height = 320;
  const padL = 30, padR = 12, padT = 14, padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxY = 6;
  const xFor = h => padL + (h - 1) * (plotW / (ALL_18.length - 1));
  const yFor = v => padT + plotH - (Math.max(0, Math.min(v, maxY)) / maxY) * plotH;

  let gridLines = '';
  [0,2,4,6].forEach(v=>{
    const y = yFor(v);
    gridLines += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width-padR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
    gridLines += `<text x="${padL-6}" y="${(y+3).toFixed(1)}" font-size="10" fill="#9C9CB4" text-anchor="end">${v}</text>`;
  });
  const baselineY = yFor(2);
  const baseline = `<line x1="${padL}" y1="${baselineY.toFixed(1)}" x2="${width-padR}" y2="${baselineY.toFixed(1)}" stroke="#FFBA00" stroke-width="1.5" stroke-dasharray="5 4"/>`;

  let xLabels = '';
  ALL_18.forEach(h=>{
    xLabels += `<text x="${xFor(h).toFixed(1)}" y="${height-padB+14}" font-size="9" fill="#9C9CB4" text-anchor="middle">${h}</text>`;
  });

  let lines = '';
  let legend = '';
  activeIdxs.forEach((idx,ci)=>{
    const color = CRUMBLE_COLORS[ci % CRUMBLE_COLORS.length];
    const pts = [];
    ALL_18.forEach(h=>{
      const s = scoreFor(idx, h);
      const info = courseInfo(h);
      const p = stablefordPoints(s.shots, players[idx].handicap, info.par, info.stroke_index);
      if(p !== null) pts.push([xFor(h), yFor(p)]);
    });
    if(pts.length > 0){
      const poly = pts.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      lines += `<polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach(([x,y])=>{ lines += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${color}"/>`; });
    }
    legend += `<span class="crumble-legend-item"><span class="crumble-dot" style="background:${color}"></span>${escapeHtml(players[idx].name)}</span>`;
  });

  return `
    <div class="crumble-chart-wrap">
      <svg viewBox="0 0 ${width} ${height}" class="crumble-svg" preserveAspectRatio="xMidYMid meet">
        ${gridLines}
        ${baseline}
        ${xLabels}
        ${lines}
      </svg>
    </div>
    <div class="crumble-legend">${legend}</div>
  `;
}

function braggingCounts(playerIdx){
  let eagles=0, birdies=0, pars=0, crumbles=0;
  ALL_18.forEach(hn=>{
    const s = scoreFor(playerIdx, hn);
    const info = courseInfo(hn);
    const p = stablefordPoints(s.shots, players[playerIdx].handicap, info.par, info.stroke_index);
    if(p===null) return;
    if(p>=4) eagles++;
    else if(p===3) birdies++;
    else if(p===2) pars++;
    else if(p===0) crumbles++;
  });
  return { eagles, birdies, pars, crumbles };
}

function braggingTableHtml(){
  const idxs = namedPlayerIdxs();
  if(idxs.length===0) return `<div class="tbd">Add player names on the Format tab to see this.</div>`;
  const rows = idxs.map(idx=>({ idx, name: players[idx].name, ...braggingCounts(idx) }));
  const body = rows.map(r=>`
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td style="text-align:center" class="pts-mono">${r.eagles}</td>
      <td style="text-align:center" class="pts-mono">${r.birdies}</td>
      <td style="text-align:center" class="pts-mono">${r.pars}</td>
      <td style="text-align:center" class="pts-mono">${r.crumbles}</td>
    </tr>
  `).join('');
  return `
    <table class="standings">
      <thead>
        <tr>
          <th>Player</th>
          <th style="text-align:center">Eagles</th>
          <th style="text-align:center">Birdies</th>
          <th style="text-align:center">Pars</th>
          <th style="text-align:center">Crumbles</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderStats(){
  const lostBalls = lostBallsStandings();
  const lostBallsHtml = lostBalls.length === 0
    ? `<div class="tbd">Add player names on the Format tab to see this.</div>`
    : miniLeaderboardHtml(lostBalls);

  return `
    <div class="card">
      <h2>Lost Balls</h2>
      <div class="rules-note">Total balls lost across the round, entered on the My Scorecard tab &mdash; fewest at the top.</div>
      ${lostBallsHtml}
    </div>

    ${sixHoleSectionHtml('Scum Corner', [7,8,9])}

    <div class="card">
      <h2>Bragging</h2>
      <div class="rules-note">Net eagles, birdies and pars across the round &mdash; plus Crumbles, a hole worth 0 Stableford points.</div>
      ${braggingTableHtml()}
    </div>

    <div class="card">
      <h2>Crumble</h2>
      <div class="rules-note">Everyone's Stableford points, hole by hole. The dashed line marks 2 points &mdash; the baseline (net par).</div>
      ${crumbleChartSvg()}
    </div>
  `;
}

/* ---------------------------------------------------------
   TROPHY CABINET — an honours board per competition, added to
   each time that competition is played.
--------------------------------------------------------- */
function trophyBoardHtml(competition){
  const entries = trophies.filter(t => t.competition === competition);
  const rows = entries.map(t => `
    <div class="trophy-row">
      <span class="trophy-year">${escapeHtml(t.year)}</span>
      <span class="trophy-winner">${escapeHtml(t.winner)}</span>
      <button class="trophy-delete" data-delete-trophy="${t.id}" title="Remove entry">&times;</button>
    </div>
  `).join('') || `<div class="trophy-empty">No winners engraved yet &mdash; be the first.</div>`;

  const namedChips = namedPlayerIdxs().map(idx=>`<button class="trophy-chip" data-fill-winner="${escapeHtml(players[idx].name)}">${escapeHtml(players[idx].name)}</button>`).join('');

  return `
    <div class="trophy-board">
      <div class="trophy-board-inner">
        <div class="trophy-title">${escapeHtml(competition)}</div>
        <div class="trophy-list">${rows}</div>
        <div class="trophy-add">
          <input type="text" class="trophy-year-input" placeholder="Year" data-comp="${escapeHtml(competition)}" maxlength="9">
          <input type="text" class="trophy-winner-input" placeholder="Winner's name" data-comp="${escapeHtml(competition)}" maxlength="60">
          <button class="btn btn-primary btn-sm trophy-add-btn" data-comp="${escapeHtml(competition)}">Add</button>
        </div>
        ${namedChips ? `<div class="trophy-chips">${namedChips}</div>` : ''}
        <div class="trophy-msg" data-comp-msg="${escapeHtml(competition)}"></div>
      </div>
    </div>
  `;
}

function renderTrophyCabinet(){
  return `
    <div class="rules-note">Every time one of these gets played, add the year and the winner's name to its board. Nothing here ever gets wiped by "Delete all golf data" &mdash; it's the permanent record.</div>
    ${TROPHY_COMPETITIONS.map(c => trophyBoardHtml(c)).join('')}
  `;
}


function attachHandlers(){
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.onclick = ()=>{
      currentTab = b.dataset.tab;
      render();
      if(currentTab==='course' || currentTab==='setup') loadSavedCourses();
      if(currentTab==='trophies') loadTrophies();
    };
  });

  if(currentTab==='scorecard'){
    document.querySelectorAll('.player-chip').forEach(chip=>{
      chip.onclick = ()=>{
        const newIdx = parseInt(chip.dataset.selectPlayer,10);
        if(newIdx === selectedPlayerIdx) return;
        if(!confirm(`Switch to entering scores for ${escapeHtml(players[newIdx].name)}?`)) return;
        selectedPlayerIdx = newIdx;
        localStorage.setItem(MY_PLAYER_KEY, selectedPlayerIdx);
        render();
      };
    });
    document.querySelectorAll('.sc-row[data-hole]').forEach(row=>{
      const holeNumber = parseInt(row.dataset.hole,10);
      const refreshRow = ()=>{
        const s = scoreFor(selectedPlayerIdx, holeNumber);
        const info = courseInfo(holeNumber);
        const pts = stablefordPoints(s.shots, players[selectedPlayerIdx].handicap, info.par, info.stroke_index);
        const ptsEl = document.getElementById(`sc-pts-${holeNumber}`);
        if(ptsEl) ptsEl.textContent = pts===null ? '–' : pts;
        // Refresh OUT/IN/TOTAL rows without losing focus on the input being edited
        const body = document.getElementById('scorecard-body');
        if(body){
          const out = []; for(let h=1;h<=9;h++) out.push(h);
          const inn = []; for(let h=10;h<=18;h++) inn.push(h);
          const subtotalEls = body.querySelectorAll('.sc-row.subtotal, .sc-row.total');
          if(subtotalEls[0]) subtotalEls[0].outerHTML = scSubtotalHtml('OUT', selectedPlayerIdx, out, 'subtotal');
          if(subtotalEls[1]) subtotalEls[1].outerHTML = scSubtotalHtml('IN', selectedPlayerIdx, inn, 'subtotal');
          if(subtotalEls[2]) subtotalEls[2].outerHTML = scSubtotalHtml('TOTAL', selectedPlayerIdx, out.concat(inn), 'total');
        }
      };

      const input = row.querySelector('input[data-field="shots"]');
      if(input){
        let debounce;
        input.onfocus = ()=>{
          if(input.dataset.originalValue === undefined){
            const existing = scoreFor(selectedPlayerIdx, holeNumber).shots;
            input.dataset.originalValue = existing===null||existing===undefined ? '' : String(existing);
          }
        };
        input.oninput = ()=>{
          if(!scores[selectedPlayerIdx]) scores[selectedPlayerIdx] = {};
          if(!scores[selectedPlayerIdx][holeNumber]) scores[selectedPlayerIdx][holeNumber] = {};
          scores[selectedPlayerIdx][holeNumber].shots = input.value === '' ? null : parseInt(input.value,10);
          refreshRow();
          clearTimeout(debounce);
          debounce = setTimeout(()=>{
            const original = input.dataset.originalValue ?? '';
            const changingExisting = original !== '' && original !== input.value;
            const proceed = ()=>{
              input.dataset.originalValue = input.value;
              inFlight = true;
              postJson('/api/golf/score', { playerIdx: selectedPlayerIdx, holeNumber, field:'shots', value: input.value })
                .finally(()=>{ inFlight = false; });
            };
            if(changingExisting){
              const label = input.value === '' ? `clear hole ${holeNumber}'s score of ${original}` : `change hole ${holeNumber} from ${original} to ${input.value}`;
              if(confirm(`Are you sure you want to ${label}?`)){
                proceed();
              } else {
                input.value = original;
                scores[selectedPlayerIdx][holeNumber].shots = original === '' ? null : parseInt(original,10);
                refreshRow();
              }
            } else {
              proceed();
            }
          }, 500);
        };
      }
      row.querySelectorAll('.sc-tick input[type=checkbox]').forEach(cb=>{
        cb.onchange = ()=>{
          const f = cb.dataset.field;
          if(!scores[selectedPlayerIdx]) scores[selectedPlayerIdx] = {};
          if(!scores[selectedPlayerIdx][holeNumber]) scores[selectedPlayerIdx][holeNumber] = {};
          const wasOn = !!scores[selectedPlayerIdx][holeNumber][f];
          const nowOn = cb.checked;
          if(wasOn && !nowOn){
            const label = { fairway:'fairway', gir:'GIR', one_putt:'first putt' }[f] || f;
            if(!confirm(`Are you sure you want to change hole ${holeNumber}'s ${label} tick back off?`)){
              cb.checked = true;
              return;
            }
          }
          scores[selectedPlayerIdx][holeNumber][f] = nowOn;
          inFlight = true;
          postJson('/api/golf/score', { playerIdx: selectedPlayerIdx, holeNumber, field:f, value: nowOn })
            .finally(()=>{ inFlight = false; });
        };
      });

      const puttInput = row.querySelector('input[data-field="putting_points"]');
      if(puttInput){
        let debounce;
        puttInput.onfocus = ()=>{
          if(puttInput.dataset.originalValue === undefined){
            const existing = scoreFor(selectedPlayerIdx, holeNumber).putting_points || 0;
            puttInput.dataset.originalValue = String(existing);
          }
        };
        puttInput.oninput = ()=>{
          if(!scores[selectedPlayerIdx]) scores[selectedPlayerIdx] = {};
          if(!scores[selectedPlayerIdx][holeNumber]) scores[selectedPlayerIdx][holeNumber] = {};
          let v = puttInput.value === '' ? 0 : parseInt(puttInput.value,10);
          if(isNaN(v)) v = 0;
          if(v < 0) v = 0; if(v > 6) v = 6;
          scores[selectedPlayerIdx][holeNumber].putting_points = v;
          clearTimeout(debounce);
          debounce = setTimeout(()=>{
            const original = puttInput.dataset.originalValue ?? '0';
            const changingExisting = original !== '0' && original !== String(v);
            const proceed = ()=>{
              puttInput.dataset.originalValue = String(v);
              inFlight = true;
              postJson('/api/golf/score', { playerIdx: selectedPlayerIdx, holeNumber, field:'putting_points', value: v })
                .finally(()=>{ inFlight = false; });
            };
            if(changingExisting){
              if(confirm(`Are you sure you want to change hole ${holeNumber}'s putting points from ${original} to ${v}?`)){
                proceed();
              } else {
                puttInput.value = original;
                scores[selectedPlayerIdx][holeNumber].putting_points = parseInt(original,10);
              }
            } else {
              proceed();
            }
          }, 500);
        };
      }

      const lbInput = row.querySelector('input[data-field="lost_balls"]');
      if(lbInput){
        let lbDebounce;
        lbInput.onfocus = ()=>{
          if(lbInput.dataset.originalValue === undefined){
            const existing = scoreFor(selectedPlayerIdx, holeNumber).lost_balls || 0;
            lbInput.dataset.originalValue = String(existing);
          }
        };
        lbInput.oninput = ()=>{
          if(!scores[selectedPlayerIdx]) scores[selectedPlayerIdx] = {};
          if(!scores[selectedPlayerIdx][holeNumber]) scores[selectedPlayerIdx][holeNumber] = {};
          let v = lbInput.value === '' ? 0 : parseInt(lbInput.value,10);
          if(isNaN(v)) v = 0;
          if(v < 0) v = 0; if(v > 20) v = 20;
          scores[selectedPlayerIdx][holeNumber].lost_balls = v;
          clearTimeout(lbDebounce);
          lbDebounce = setTimeout(()=>{
            const original = lbInput.dataset.originalValue ?? '0';
            const changingExisting = original !== '0' && original !== String(v);
            const proceed = ()=>{
              lbInput.dataset.originalValue = String(v);
              inFlight = true;
              postJson('/api/golf/score', { playerIdx: selectedPlayerIdx, holeNumber, field:'lost_balls', value: v })
                .finally(()=>{ inFlight = false; });
            };
            if(changingExisting){
              if(confirm(`Are you sure you want to change hole ${holeNumber}'s lost balls from ${original} to ${v}?`)){
                proceed();
              } else {
                lbInput.value = original;
                scores[selectedPlayerIdx][holeNumber].lost_balls = parseInt(original,10);
              }
            } else {
              proceed();
            }
          }, 500);
        };
      }
    });
  }

  if(currentTab==='sidebets'){
    function runSpin(displayId, stage, btn){
      btn.disabled = true;
      const displayEl = document.getElementById(displayId);
      let ticks = 0;
      const spinTimer = setInterval(()=>{
        const randomSix = [];
        while(randomSix.length < 6){
          const n = 1 + Math.floor(Math.random()*18);
          if(!randomSix.includes(n)) randomSix.push(n);
        }
        if(displayEl) displayEl.innerHTML = ballsInnerHtml(randomSix);
        ticks++;
      }, 90);

      postJson('/api/golf/side-draw', { stage }).then(async ()=>{
        // postJson swallows the response; refetch state to get the real result
        await loadState();
      }).finally(()=>{
        setTimeout(()=>{ clearInterval(spinTimer); render(); }, 1100);
      });
    }

    const frontBtn = document.querySelector('[data-spin="spin-front"]');
    if(frontBtn) frontBtn.onclick = ()=> runSpin('spin-front', 'front', frontBtn);

    const midBtn = document.querySelector('[data-spin="spin-middlesex"]');
    if(midBtn) midBtn.onclick = ()=> runSpin('spin-middlesex', 'middlesex', midBtn);

    const redrawBtn = document.getElementById('redraw-btn');
    if(redrawBtn){
      redrawBtn.onclick = async ()=>{
        if(!confirm('Redraw the Front Six and Middlesex? This clears the current draw so you can spin again.')) return;
        await postJson('/api/golf/side-draw/reset', {});
        await loadState();
      };
    }
  }

  if(currentTab==='setup'){
    document.querySelectorAll('input[data-player-idx]').forEach(inp=>{
      let debounce;
      inp.oninput = ()=>{
        const i = parseInt(inp.dataset.playerIdx,10);
        const field = inp.dataset.playerField;
        if(field==='name') players[i].name = inp.value;
        else players[i].handicap = parseInt(inp.value,10) || 0;
        clearTimeout(debounce);
        debounce = setTimeout(async ()=>{
          inFlight = true;
          const body = { idx:i };
          if(field==='name') body.name = inp.value; else body.handicap = inp.value;
          await postJson('/api/golf/players', body);
          inFlight = false;
          const tick = document.querySelector(`.save-tick[data-tick="${i}"]`);
          if(tick){ tick.classList.add('show'); setTimeout(()=>tick.classList.remove('show'), 1200); }
        }, 500);
      };
    });

    const stakeInput = document.getElementById('stake-input');
    if(stakeInput){
      let stakeDebounce;
      stakeInput.oninput = ()=>{
        clearTimeout(stakeDebounce);
        stakeDebounce = setTimeout(async ()=>{
          const v = stakeInput.value === '' ? 0 : parseFloat(stakeInput.value);
          settings.stake = isNaN(v) ? 0 : v;
          await postJson('/api/golf/settings', { field:'stake', value: settings.stake });
          const msgEl = document.getElementById('stake-msg');
          if(msgEl){
            msgEl.innerHTML = `<div class="alert alert-success" style="margin-top:0.6rem;">Saved.</div>`;
            setTimeout(()=>{ if(msgEl) msgEl.innerHTML=''; }, 1500);
          }
        }, 500);
      };
    }

    ['football','six66','pp'].forEach(key=>{
      const cb = document.getElementById(`fmt-${key}`);
      if(cb){
        cb.onchange = async ()=>{
          settings.formats[key] = cb.checked;
          await postJson('/api/golf/settings', { field:'formats', value: settings.formats });
        };
      }
    });

    const formatLoadBtn = document.getElementById('format-load-course-btn');
    if(formatLoadBtn){
      formatLoadBtn.onclick = async ()=>{
        const select = document.getElementById('format-course-select');
        const id = select.value;
        if(!id) return;
        const name = select.options[select.selectedIndex].text;
        if(!confirm(`Load "${name}"? This will overwrite the current par and stroke index for every hole on the Course tab.`)) return;
        formatLoadBtn.disabled = true;
        await postJson('/api/golf/courses/load', { id });
        await loadState();
        const msgEl = document.getElementById('format-course-msg');
        if(msgEl) msgEl.innerHTML = `<div class="alert alert-success" style="margin-top:0.9rem;">Loaded "${escapeHtml(name)}" onto the Course tab.</div>`;
      };
    }

    const resetBtn = document.getElementById('resetAllBtn');
    if(resetBtn){
      resetBtn.onclick = async ()=>{
        if(!confirm('Delete every golf score and reset players, handicaps and course settings to defaults? This can\'t be undone.')) return;
        resetBtn.disabled = true;
        try{
          const res = await fetch('/api/golf/reset', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
          if(res.ok){
            await loadState();
            const msgEl = document.getElementById('reset-msg');
            if(msgEl) msgEl.innerHTML = `<div class="alert alert-success" style="margin-top:0.9rem;">Golf sweepstake reset — all clear.</div>`;
          } else {
            const msgEl = document.getElementById('reset-msg');
            if(msgEl) msgEl.innerHTML = `<div class="alert alert-error" style="margin-top:0.9rem;">Something went wrong — try again.</div>`;
          }
        } catch(e){
          const msgEl = document.getElementById('reset-msg');
          if(msgEl) msgEl.innerHTML = `<div class="alert alert-error" style="margin-top:0.9rem;">Couldn't reach the server — check your connection and try again.</div>`;
        } finally {
          const freshBtn = document.getElementById('resetAllBtn');
          if(freshBtn) freshBtn.disabled = false;
        }
      };
    }
  }

  if(currentTab==='course'){
    document.querySelectorAll('input[data-hole]').forEach(inp=>{
      let debounce;
      inp.oninput = ()=>{
        const h = parseInt(inp.dataset.hole,10);
        const field = inp.dataset.courseField;
        if(!course[h]) course[h] = { par:4, stroke_index:h };
        if(field==='par') course[h].par = parseInt(inp.value,10) || 4;
        else course[h].stroke_index = parseInt(inp.value,10) || h;
        clearTimeout(debounce);
        debounce = setTimeout(()=>{
          inFlight = true;
          postJson('/api/golf/course', { holeNumber:h, field, value: inp.value }).finally(()=>{ inFlight=false; });
        }, 500);
      };
    });

    const saveBtn = document.getElementById('save-course-btn');
    const nameInput = document.getElementById('course-name-input');
    if(saveBtn){
      saveBtn.onclick = async ()=>{
        const name = (nameInput.value || '').trim();
        if(!name){ nameInput.focus(); return; }
        saveBtn.disabled = true;
        try{
          const res = await fetch('/api/golf/courses', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
          if(res.ok){
            await loadSavedCourses();
            const msgEl = document.getElementById('course-msg');
            if(msgEl) msgEl.innerHTML = `<div class="alert alert-success" style="margin-top:0.9rem;">Saved "${escapeHtml(name)}".</div>`;
          } else {
            const data = await res.json().catch(()=>({}));
            const msgEl = document.getElementById('course-msg');
            if(msgEl) msgEl.innerHTML = `<div class="alert alert-error" style="margin-top:0.9rem;">${escapeHtml(data.error || 'Could not save the course.')}</div>`;
          }
        } finally {
          saveBtn.disabled = false;
        }
      };
    }

    document.querySelectorAll('[data-load-course]').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.dataset.loadCourse;
        const name = btn.dataset.courseName;
        if(!confirm(`Load "${name}"? This will overwrite the current par and stroke index for every hole.`)) return;
        await postJson('/api/golf/courses/load', { id });
        await loadState();
        const msgEl = document.getElementById('course-msg');
        if(msgEl) msgEl.innerHTML = `<div class="alert alert-success" style="margin-top:0.9rem;">Loaded "${escapeHtml(name)}".</div>`;
      };
    });

    document.querySelectorAll('[data-delete-course]').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.dataset.deleteCourse;
        const name = btn.dataset.courseName;
        if(!confirm(`Delete the saved course "${name}"? This can't be undone.`)) return;
        await fetch(`/api/golf/courses/${id}`, { method:'DELETE' });
        await loadSavedCourses();
      };
    });
  }

  if(currentTab==='trophies'){
    document.querySelectorAll('[data-fill-winner]').forEach(chip=>{
      chip.onclick = ()=>{
        let node = chip.parentElement;
        while(node && !node.classList.contains('trophy-board')) node = node.parentElement;
        const input = node ? node.querySelector('.trophy-winner-input') : null;
        if(input) input.value = chip.dataset.fillWinner;
      };
    });

    document.querySelectorAll('.trophy-add-btn').forEach(btn=>{
      btn.onclick = async ()=>{
        const comp = btn.dataset.comp;
        const yearInput = document.querySelector(`.trophy-year-input[data-comp="${comp}"]`);
        const winnerInput = document.querySelector(`.trophy-winner-input[data-comp="${comp}"]`);
        const msgEl = document.querySelector(`[data-comp-msg="${comp}"]`);
        const year = (yearInput.value || '').trim();
        const winner = (winnerInput.value || '').trim();
        if(!year || !winner){
          if(msgEl) msgEl.innerHTML = `<div class="alert alert-error" style="margin-top:0.6rem;">Enter both a year and a winner.</div>`;
          return;
        }
        btn.disabled = true;
        try{
          const res = await fetch('/api/golf/trophies', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ competition: comp, year, winner }) });
          if(res.ok){
            await loadTrophies();
            const freshMsgEl = document.querySelector(`[data-comp-msg="${comp}"]`);
            if(freshMsgEl) freshMsgEl.innerHTML = `<div class="alert alert-success" style="margin-top:0.6rem;">Added ${escapeHtml(winner)} (${escapeHtml(year)}).</div>`;
          } else {
            const data = await res.json().catch(()=>({}));
            if(msgEl) msgEl.innerHTML = `<div class="alert alert-error" style="margin-top:0.6rem;">${escapeHtml(data.error || 'Could not add that entry.')}</div>`;
          }
        } finally {
          const freshBtn = document.querySelector(`.trophy-add-btn[data-comp="${comp}"]`);
          if(freshBtn) freshBtn.disabled = false;
        }
      };
    });

    document.querySelectorAll('[data-delete-trophy]').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.dataset.deleteTrophy;
        if(!confirm('Remove this entry from the board? This can\'t be undone.')) return;
        await fetch(`/api/golf/trophies/${id}`, { method:'DELETE' });
        await loadTrophies();
      };
    });
  }
}

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
loadState();
startPolling();

'use strict';

/* ---------------------------------------------------------
   SCHEDULE — [hole, homePlayerIdx, awayPlayerIdx], 0-based.
   "hole" doubles as the real course hole number (1–10).
   Semis play course holes 11–13, the final plays 14–17.
--------------------------------------------------------- */
const SCHEDULE = [
  [1,0,5],[1,1,4],[1,2,3],
  [2,0,4],[2,5,3],[2,1,2],
  [3,0,3],[3,4,2],[3,5,1],
  [4,0,2],[4,3,1],[4,4,5],
  [5,0,1],[5,2,5],[5,3,4],
  [6,5,0],[6,4,1],[6,3,2],
  [7,4,0],[7,3,5],[7,2,1],
  [8,3,0],[8,2,4],[8,1,5],
  [9,2,0],[9,1,3],[9,5,4],
  [10,1,0],[10,5,2],[10,4,3],
];

const POLL_MS = 5000;

let players = [
  {name:"Player 1",handicap:0},{name:"Player 2",handicap:0},{name:"Player 3",handicap:0},
  {name:"Player 4",handicap:0},{name:"Player 5",handicap:0},{name:"Player 6",handicap:0},
];
let course = {};    // holeNumber (1-18) -> {par, stroke_index}
let group = {};      // matchIdx -> {hshots,ashots,hf,hg,hp,af,ag,ap}
let sf1 = {};        // holeIdx -> {ashots,bshots,af,ag,ap,bf,bg,bp}
let sf2 = {};
let final = {};

let currentTab = "setup";
let currentHole = 1;
let pollTimer = null;
let inFlight = false;

/* ---------------------------------------------------------
   NETWORKING
--------------------------------------------------------- */
async function loadState(){
  try{
    const res = await fetch('/api/golf/state');
    const data = await res.json();
    players = new Array(6).fill(0).map((_,i)=>{
      const row = data.players.find(p=>p.idx===i);
      return row ? { name: row.name, handicap: row.handicap } : { name:`Player ${i+1}`, handicap:0 };
    });
    course = {};
    data.course.forEach(row=>{ course[row.hole_number] = { par: row.par, stroke_index: row.stroke_index }; });
    group = {};
    data.group.forEach(row=>{ group[row.match_idx] = row; });
    sf1 = {}; sf2 = {}; final = {};
    data.knockout.forEach(row=>{
      const target = row.stage === 'sf1' ? sf1 : row.stage === 'sf2' ? sf2 : final;
      target[row.hole_idx] = row;
    });
    render();
  }catch(e){
    console.error('Failed to load golf state', e);
  }
}

async function postJson(url, body){
  try{
    await fetch(url, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
  }catch(e){
    console.error('Failed to save', url, body, e);
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
   COURSE HOLE MAPPING
--------------------------------------------------------- */
function courseHoleForGroup(holeNum){ return holeNum; }                    // 1–10
function courseHoleForKnockout(stage, holeIdx){
  return stage === 'final' ? 13 + holeIdx + 1 : 10 + holeIdx + 1;          // sf: 11–13, final: 14–17
}
function courseInfo(holeNumber){
  return course[holeNumber] || { par:4, stroke_index: holeNumber };
}

/* ---------------------------------------------------------
   STABLEFORD SCORING
--------------------------------------------------------- */
// Strokes a player receives on a hole, from their handicap and the hole's stroke index.
function strokesReceived(handicap, strokeIndex){
  const h = Math.max(0, parseInt(handicap,10) || 0);
  return Math.floor(h/18) + (strokeIndex <= (h % 18) ? 1 : 0);
}
// Stableford points for a single hole; null if shots not yet entered.
function stablefordPoints(shots, handicap, par, strokeIndex){
  if(shots===null || shots===undefined || shots==='') return null;
  const rec = strokesReceived(handicap, strokeIndex);
  const net = shots - rec;
  return Math.max(0, 2 - (net - par));
}
// Combine hole-win points (2/1/0, from comparing Stableford points) with bonus points.
function holeResult(shotsA, hcpA, bonusA, shotsB, hcpB, bonusB, holeNumber){
  const { par, stroke_index } = courseInfo(holeNumber);
  const ptsA = stablefordPoints(shotsA, hcpA, par, stroke_index);
  const ptsB = stablefordPoints(shotsB, hcpB, par, stroke_index);
  const bonusPtsA = (bonusA.f?1:0)+(bonusA.g?1:0)+(bonusA.p?1:0);
  const bonusPtsB = (bonusB.f?1:0)+(bonusB.g?1:0)+(bonusB.p?1:0);
  if(ptsA===null || ptsB===null){
    return { stableA:ptsA, stableB:ptsB, totalA: bonusPtsA, totalB: bonusPtsB, pending:true };
  }
  let matchA=0, matchB=0;
  if(ptsA>ptsB) matchA=2;
  else if(ptsB>ptsA) matchB=2;
  else { matchA=1; matchB=1; }
  return { stableA:ptsA, stableB:ptsB, totalA: matchA+bonusPtsA, totalB: matchB+bonusPtsB, pending:false };
}

function groupHoleResult(rec, homeIdx, awayIdx, holeNumber){
  rec = rec || {};
  return holeResult(
    rec.hshots, players[homeIdx].handicap, {f:rec.hf,g:rec.hg,p:rec.hp},
    rec.ashots, players[awayIdx].handicap, {f:rec.af,g:rec.ag,p:rec.ap},
    holeNumber
  );
}
function koHoleResult(rec, hcpA, hcpB, holeNumber){
  rec = rec || {};
  return holeResult(
    rec.ashots, hcpA, {f:rec.af,g:rec.ag,p:rec.ap},
    rec.bshots, hcpB, {f:rec.bf,g:rec.bg,p:rec.bp},
    holeNumber
  );
}

function computeStandings(){
  const pts = new Array(6).fill(0);
  SCHEDULE.forEach((m, idx)=>{
    const r = groupHoleResult(group[idx], m[1], m[2], courseHoleForGroup(m[0]));
    pts[m[1]] += r.totalA;
    pts[m[2]] += r.totalB;
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

function koTotals(records, numHoles, stage, hcpA, hcpB){
  let a=0,b=0;
  for(let i=0;i<numHoles;i++){
    const r = koHoleResult(records[i], hcpA, hcpB, courseHoleForKnockout(stage, i));
    a+=r.totalA; b+=r.totalB;
  }
  return {a,b};
}
function koComplete(records, numHoles){
  for(let i=0;i<numHoles;i++){
    const rec = records[i];
    if(!rec || rec.ashots==null || rec.bshots==null) return false;
  }
  return true;
}
function koWinnerName(records, numHoles, stage, hcpA, hcpB, nameA, nameB){
  if(!koComplete(records, numHoles)) return null;
  const t = koTotals(records, numHoles, stage, hcpA, hcpB);
  if(t.a>t.b) return nameA;
  if(t.b>t.a) return nameB;
  return "TIE";
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
  if(currentTab==='setup') el.innerHTML = renderSetup();
  else if(currentTab==='course') el.innerHTML = renderCourse();
  else if(currentTab==='group') el.innerHTML = renderGroup();
  else if(currentTab==='standings') el.innerHTML = renderStandings();
  else if(currentTab==='semis') el.innerHTML = renderSemis();
  else if(currentTab==='final') el.innerHTML = renderFinal();
  attachHandlers();
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
        <input type="number" min="0" max="54" data-player-idx="${i}" data-player-field="handicap" value="${p.handicap}">
        <span class="hcap-label">h'cap</span>
      </div>
      <span class="save-tick" data-tick="${i}">Saved</span>
    </div>
  `).join('');
  return `
    <div class="rules-note">Type a name or handicap and it saves automatically for everyone. Set each player's course handicap here — it's used to work out Stableford points on the Holes tab.</div>
    <div class="card">${rows}</div>
    <div class="card">
      <h2>Scoring</h2>
      <div style="font-size:0.88rem; line-height:1.8; color:var(--text-muted);">
        Each hole is scored on <b class="text-gold">Stableford points</b> (net score vs. par, using each player's handicap). Whoever scores more Stableford points on a hole wins it:<br>
        <b class="text-gold">2 pts</b> — win the hole<br>
        <b class="text-gold">1 pt</b> — halve (draw) the hole<br>
        <b class="text-gold">1 pt</b> — drive on the fairway<br>
        <b class="text-gold">1 pt</b> — green in regulation<br>
        <b class="text-gold">1 pt</b> — hole out with the first putt
      </div>
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
    if(h===1) section = 'Group stage';
    if(h===11) section = 'Semi-finals';
    if(h===14) section = 'Final';
    rows += `
      ${section ? `<div class="course-section">${section} · holes ${h===1?'1–10':h===11?'11–13':'14–17'}</div>` : ''}
      <div class="course-row">
        <div class="course-hole">Hole ${h}</div>
        <div class="course-field">
          <label>Par</label>
          <input type="number" min="3" max="6" data-hole="${h}" data-course-field="par" value="${info.par}">
        </div>
        <div class="course-field">
          <label>Stroke index</label>
          <input type="number" min="1" max="18" data-hole="${h}" data-course-field="strokeIndex" value="${info.stroke_index}">
        </div>
      </div>
    `;
  }
  return `
    <div class="rules-note">Set the par and stroke index (1 = hardest hole, 18 = easiest) for each hole your group plays. This is what drives the automatic Stableford calculation — holes 1–10 are the group stage, 11–13 the semis, 14–17 the final.</div>
    <div class="card">${rows}</div>
  `;
}

/* ---------------------------------------------------------
   GROUP STAGE TAB
--------------------------------------------------------- */
function computedGroupHtml(i, m){
  const rec = group[i] || {};
  const holeNumber = courseHoleForGroup(m[0]);
  const r = groupHoleResult(rec, m[1], m[2], holeNumber);
  const homeName = players[m[1]].name, awayName = players[m[2]].name;
  if(r.pending){
    return `<div class="match-points pending">Enter both scores to work out Stableford points</div>`;
  }
  return `
    <div class="stable-line">Stableford: ${escapeHtml(homeName)} ${r.stableA} – ${r.stableB} ${escapeHtml(awayName)}</div>
    <div class="match-points">
      <span>${escapeHtml(homeName)}: ${ptsLabel(r.totalA)}</span>
      <span>${escapeHtml(awayName)}: ${ptsLabel(r.totalB)}</span>
    </div>
  `;
}

function renderGroup(){
  const chips = [];
  for(let h=1; h<=10; h++){
    const idxs = SCHEDULE.map((m,i)=>({m,i})).filter(x=>x.m[0]===h);
    const done = idxs.every(x=> group[x.i] && group[x.i].hshots!=null && group[x.i].ashots!=null);
    chips.push(`<button class="hole-chip ${h===currentHole?'active':''} ${done?'done':''}" data-hole="${h}">${h}</button>`);
  }
  const holeInfo = courseInfo(currentHole);
  const matches = SCHEDULE.map((m,i)=>({m,i})).filter(x=>x.m[0]===currentHole);
  const cards = matches.map(({m,i})=>{
    const rec = group[i] || {};
    const homeName = players[m[1]].name, awayName = players[m[2]].name;
    return `
      <div class="card match-card" data-match="${i}">
        <div class="match-players">
          <div class="side home">${escapeHtml(homeName)} <span class="hcap-tag">h'cap ${players[m[1]].handicap}</span></div>
          <div class="vs">vs</div>
          <div class="side away"><span class="hcap-tag">h'cap ${players[m[2]].handicap}</span> ${escapeHtml(awayName)}</div>
        </div>
        <div class="shots-grid">
          <div class="shots-col">
            <label>${escapeHtml(homeName)} shots</label>
            <input type="number" min="1" max="20" inputmode="numeric" data-shots-field="hshots" value="${rec.hshots ?? ''}">
          </div>
          <div class="shots-col">
            <label>${escapeHtml(awayName)} shots</label>
            <input type="number" min="1" max="20" inputmode="numeric" data-shots-field="ashots" value="${rec.ashots ?? ''}">
          </div>
        </div>
        <div class="bonus-grid">
          <div class="bonus-col">
            <div class="colname">${escapeHtml(homeName)}</div>
            <div class="chip ${rec.hf?'on':''}" data-field="hf">Fairway</div>
            <div class="chip ${rec.hg?'on':''}" data-field="hg">GIR</div>
            <div class="chip ${rec.hp?'on':''}" data-field="hp">1-Putt</div>
          </div>
          <div class="bonus-col">
            <div class="colname">${escapeHtml(awayName)}</div>
            <div class="chip ${rec.af?'on':''}" data-field="af">Fairway</div>
            <div class="chip ${rec.ag?'on':''}" data-field="ag">GIR</div>
            <div class="chip ${rec.ap?'on':''}" data-field="ap">1-Putt</div>
          </div>
        </div>
        <div class="computed" id="computed-group-${i}">${computedGroupHtml(i, m)}</div>
      </div>
    `;
  }).join('');
  return `
    <div class="hole-picker">${chips.join('')}</div>
    <h2 style="color:var(--gold); margin-bottom:0.25rem;">Hole ${currentHole}</h2>
    <div class="rules-note" style="margin-bottom:0.75rem;">Par ${holeInfo.par} · Stroke index ${holeInfo.stroke_index}</div>
    ${cards}
  `;
}

/* ---------------------------------------------------------
   STANDINGS TAB
--------------------------------------------------------- */
function renderStandings(){
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
      Highlighted rows qualify for the semi-finals: 1st plays 4th, 2nd plays 3rd.
      ${tie ? '<br><b>Note:</b> there is a tie around 4th place — agree a tie-break (holes won, or a play-off hole) before confirming the semi-final line-up.' : ''}
    </div>
  `;
}

/* ---------------------------------------------------------
   KNOCKOUT (shared for SF1 / SF2 / Final)
--------------------------------------------------------- */
function computedKoHtml(storageKey, h, hcpA, hcpB, nameA, nameB, holeNumber){
  const store = storageKey==='sf1' ? sf1 : storageKey==='sf2' ? sf2 : final;
  const rec = store[h] || {};
  const r = koHoleResult(rec, hcpA, hcpB, holeNumber);
  if(r.pending){
    return `<div class="match-points pending">Enter both scores to work out Stableford points</div>`;
  }
  return `
    <div class="stable-line">Stableford: ${escapeHtml(nameA)} ${r.stableA} – ${r.stableB} ${escapeHtml(nameB)}</div>
    <div class="match-points">
      <span>${escapeHtml(nameA)}: ${ptsLabel(r.totalA)}</span>
      <span>${escapeHtml(nameB)}: ${ptsLabel(r.totalB)}</span>
    </div>
  `;
}

function renderKnockout(opts){
  const { records, numHoles, nameA, nameB, hcpA, hcpB, stage, title, subtitle, storageKey, championStyle } = opts;
  if(nameA===null || nameB===null){
    return `<h2 style="color:var(--gold); margin-bottom:0.75rem;">${title}</h2><div class="card"><div class="tbd">${subtitle}</div></div>`;
  }
  const holeCards = [];
  for(let h=0; h<numHoles; h++){
    const rec = records[h] || {};
    const holeNumber = courseHoleForKnockout(stage, h);
    const info = courseInfo(holeNumber);
    holeCards.push(`
      <div class="card match-card" data-ko="${storageKey}" data-hole="${h}"
           data-name-a="${escapeHtml(nameA)}" data-name-b="${escapeHtml(nameB)}"
           data-hcap-a="${hcpA}" data-hcap-b="${hcpB}" data-stage="${stage}">
        <div class="match-players">
          <div class="side home">${escapeHtml(nameA)} <span class="hcap-tag">h'cap ${hcpA}</span></div>
          <div class="vs">hole ${holeNumber}</div>
          <div class="side away"><span class="hcap-tag">h'cap ${hcpB}</span> ${escapeHtml(nameB)}</div>
        </div>
        <div class="rules-note" style="margin:0 0 0.6rem; padding:0.4rem 0.6rem;">Par ${info.par} · Stroke index ${info.stroke_index}</div>
        <div class="shots-grid">
          <div class="shots-col">
            <label>${escapeHtml(nameA)} shots</label>
            <input type="number" min="1" max="20" inputmode="numeric" data-shots-field="ashots" value="${rec.ashots ?? ''}">
          </div>
          <div class="shots-col">
            <label>${escapeHtml(nameB)} shots</label>
            <input type="number" min="1" max="20" inputmode="numeric" data-shots-field="bshots" value="${rec.bshots ?? ''}">
          </div>
        </div>
        <div class="bonus-grid">
          <div class="bonus-col">
            <div class="colname">${escapeHtml(nameA)}</div>
            <div class="chip ${rec.af?'on':''}" data-field="af">Fairway</div>
            <div class="chip ${rec.ag?'on':''}" data-field="ag">GIR</div>
            <div class="chip ${rec.ap?'on':''}" data-field="ap">1-Putt</div>
          </div>
          <div class="bonus-col">
            <div class="colname">${escapeHtml(nameB)}</div>
            <div class="chip ${rec.bf?'on':''}" data-field="bf">Fairway</div>
            <div class="chip ${rec.bg?'on':''}" data-field="bg">GIR</div>
            <div class="chip ${rec.bp?'on':''}" data-field="bp">1-Putt</div>
          </div>
        </div>
        <div class="computed" id="computed-${storageKey}-${h}">${computedKoHtml(storageKey, h, hcpA, hcpB, nameA, nameB, holeNumber)}</div>
      </div>
    `);
  }
  const totals = koTotals(records, numHoles, stage, hcpA, hcpB);
  const complete = koComplete(records, numHoles);
  const winner = koWinnerName(records, numHoles, stage, hcpA, hcpB, nameA, nameB);

  return `
    <h2 style="color:var(--gold); margin-bottom:0.5rem;">${title}</h2>
    <div class="rules-note">${escapeHtml(nameA)} vs ${escapeHtml(nameB)} · ${numHoles} holes · most points wins</div>
    ${holeCards.join('')}
    <div id="ko-footer-${storageKey}">${koFooterHtml(totals, complete, winner, nameA, nameB, championStyle)}</div>
  `;
}

function koFooterHtml(totals, complete, winner, nameA, nameB, championStyle){
  let banner = '';
  if(complete){
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
    <div class="card" style="display:flex; justify-content:space-between; font-family:ui-monospace,monospace; font-weight:700;">
      <span>${escapeHtml(nameA)}: ${totals.a}</span>
      <span>${escapeHtml(nameB)}: ${totals.b}</span>
    </div>
    ${banner}
  `;
}

function renderSemis(){
  const standings = computeStandings();
  const [seed1, seed2, seed3, seed4] = standings;
  const groupDone = SCHEDULE.every((m,idx)=> group[idx] && group[idx].hshots!=null && group[idx].ashots!=null);
  if(!groupDone){
    return `
      <h2 style="color:var(--gold); margin-bottom:0.75rem;">Semi-Final 1</h2>
      <div class="card"><div class="tbd">Finish all 10 holes of the group stage to lock in the semi-final line-up.</div></div>
      <h2 style="color:var(--gold); margin-bottom:0.75rem;">Semi-Final 2</h2>
      <div class="card"><div class="tbd">Finish all 10 holes of the group stage to lock in the semi-final line-up.</div></div>
    `;
  }
  const sf1Html = renderKnockout({
    records: sf1, numHoles: 3, stage: 'sf1',
    nameA: seed1.name, nameB: seed4.name,
    hcpA: players[seed1.idx].handicap, hcpB: players[seed4.idx].handicap,
    title: 'Semi-Final 1 (Seed 1 v Seed 4)', storageKey: 'sf1',
  });
  const sf2Html = renderKnockout({
    records: sf2, numHoles: 3, stage: 'sf2',
    nameA: seed2.name, nameB: seed3.name,
    hcpA: players[seed2.idx].handicap, hcpB: players[seed3.idx].handicap,
    title: 'Semi-Final 2 (Seed 2 v Seed 3)', storageKey: 'sf2',
  });
  return sf1Html + sf2Html;
}

function renderFinal(){
  const standings = computeStandings();
  const [seed1, seed2, seed3, seed4] = standings;
  const hcp1 = players[seed1.idx].handicap, hcp4 = players[seed4.idx].handicap;
  const hcp2 = players[seed2.idx].handicap, hcp3 = players[seed3.idx].handicap;
  const w1 = koWinnerName(sf1, 3, 'sf1', hcp1, hcp4, seed1.name, seed4.name);
  const w2 = koWinnerName(sf2, 3, 'sf2', hcp2, hcp3, seed2.name, seed3.name);
  const nameA = (w1 && w1!=='TIE') ? w1 : null;
  const nameB = (w2 && w2!=='TIE') ? w2 : null;
  const hcpA = nameA===seed1.name ? hcp1 : nameA===seed4.name ? hcp4 : 0;
  const hcpB = nameB===seed2.name ? hcp2 : nameB===seed3.name ? hcp3 : 0;
  let subtitle = 'Complete both semi-finals to set the final.';
  if(w1==='TIE' || w2==='TIE') subtitle = 'A semi-final is tied — play a sudden-death hole there before the final can be set.';
  return renderKnockout({
    records: final, numHoles: 4, stage: 'final',
    nameA, nameB, hcpA, hcpB,
    title: 'The Final', subtitle, storageKey: 'final', championStyle: true,
  });
}

/* ---------------------------------------------------------
   EVENT HANDLERS
--------------------------------------------------------- */
function attachHandlers(){
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.onclick = ()=>{ currentTab = b.dataset.tab; render(); };
  });

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
  }

  if(currentTab==='group'){
    document.querySelectorAll('.hole-chip').forEach(chip=>{
      chip.onclick = ()=>{ currentHole = parseInt(chip.dataset.hole,10); render(); };
    });
    document.querySelectorAll('.match-card[data-match]').forEach(card=>{
      const idx = parseInt(card.dataset.match,10);
      if(!group[idx]) group[idx] = {};
      const rec = group[idx];
      const m = SCHEDULE[idx];
      const holeNumber = courseHoleForGroup(m[0]);

      card.querySelectorAll('input[data-shots-field]').forEach(inp=>{
        let debounce;
        inp.oninput = ()=>{
          const f = inp.dataset.shotsField;
          rec[f] = inp.value === '' ? null : parseInt(inp.value,10);
          const computedEl = document.getElementById(`computed-group-${idx}`);
          if(computedEl) computedEl.innerHTML = computedGroupHtml(idx, m);
          clearTimeout(debounce);
          debounce = setTimeout(()=>{
            inFlight = true;
            postJson('/api/golf/group', { matchIdx: idx, field:f, value: inp.value })
              .finally(()=>{ inFlight = false; });
          }, 500);
        };
      });
      card.querySelectorAll('.chip[data-field]').forEach(chip=>{
        chip.onclick = ()=>{
          const f = chip.dataset.field;
          rec[f] = !rec[f];
          chip.classList.toggle('on', !!rec[f]);
          const computedEl = document.getElementById(`computed-group-${idx}`);
          if(computedEl) computedEl.innerHTML = computedGroupHtml(idx, m);
          inFlight = true;
          postJson('/api/golf/group', { matchIdx: idx, field:f, value: rec[f] })
            .finally(()=>{ inFlight = false; });
        };
      });
    });
  }

  if(currentTab==='semis' || currentTab==='final'){
    document.querySelectorAll('.match-card[data-ko]').forEach(card=>{
      const key = card.dataset.ko;
      const hole = parseInt(card.dataset.hole,10);
      const stage = card.dataset.stage;
      const nameA = card.dataset.nameA, nameB = card.dataset.nameB;
      const hcpA = parseInt(card.dataset.hcapA,10), hcpB = parseInt(card.dataset.hcapB,10);
      const holeNumber = courseHoleForKnockout(stage, hole);
      const store = key==='sf1' ? sf1 : key==='sf2' ? sf2 : final;
      if(!store[hole]) store[hole] = {};
      const rec = store[hole];
      const numHoles = key==='final' ? 4 : 3;

      const refreshCard = ()=>{
        const computedEl = document.getElementById(`computed-${key}-${hole}`);
        if(computedEl) computedEl.innerHTML = computedKoHtml(key, hole, hcpA, hcpB, nameA, nameB, holeNumber);
        const footerEl = document.getElementById(`ko-footer-${key}`);
        if(footerEl){
          const totals = koTotals(store, numHoles, stage, hcpA, hcpB);
          const complete = koComplete(store, numHoles);
          const winner = koWinnerName(store, numHoles, stage, hcpA, hcpB, nameA, nameB);
          footerEl.innerHTML = koFooterHtml(totals, complete, winner, nameA, nameB, key==='final');
        }
      };

      card.querySelectorAll('input[data-shots-field]').forEach(inp=>{
        let debounce;
        inp.oninput = ()=>{
          const f = inp.dataset.shotsField;
          rec[f] = inp.value === '' ? null : parseInt(inp.value,10);
          refreshCard();
          clearTimeout(debounce);
          debounce = setTimeout(()=>{
            inFlight = true;
            postJson('/api/golf/knockout', { stage:key, holeIdx: hole, field:f, value: inp.value })
              .finally(()=>{ inFlight = false; });
          }, 500);
        };
      });
      card.querySelectorAll('.chip[data-field]').forEach(chip=>{
        chip.onclick = ()=>{
          const f = chip.dataset.field;
          rec[f] = !rec[f];
          chip.classList.toggle('on', !!rec[f]);
          refreshCard();
          inFlight = true;
          postJson('/api/golf/knockout', { stage:key, holeIdx: hole, field:f, value: rec[f] })
            .finally(()=>{ inFlight = false; });
        };
      });
    });
  }
}

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
loadState();
startPolling();

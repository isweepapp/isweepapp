'use strict';

/* ---------------------------------------------------------
   SCHEDULE — [holeNumber(1–10), playerAIdx, playerBIdx], 0-based.
   Every player also plays holes 11–18 on their own scorecard;
   only 11–13 (semis) and 14–17 (final) feed into the bracket.
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
const MY_PLAYER_KEY = 'golf_my_player_idx';

let players = [
  {name:"Player 1",handicap:18},{name:"Player 2",handicap:18},{name:"Player 3",handicap:18},
  {name:"Player 4",handicap:18},{name:"Player 5",handicap:18},{name:"Player 6",handicap:18},
];
let course = {};    // holeNumber (1-18) -> {par, stroke_index}
let scores = {};    // playerIdx -> { holeNumber -> {shots, fairway, gir, one_putt} }

let currentTab = "scorecard";
let selectedPlayerIdx = parseInt(localStorage.getItem(MY_PLAYER_KEY), 10);
if(isNaN(selectedPlayerIdx) || selectedPlayerIdx < 0 || selectedPlayerIdx > 5) selectedPlayerIdx = 0;

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
      return row ? { name: row.name, handicap: row.handicap } : { name:`Player ${i+1}`, handicap:18 };
    });
    course = {};
    data.course.forEach(row=>{ course[row.hole_number] = { par: row.par, stroke_index: row.stroke_index }; });
    scores = {};
    for(let i=0;i<6;i++) scores[i] = {};
    data.scores.forEach(row=>{
      scores[row.player_idx][row.hole_number] = {
        shots: row.shots, fairway: !!row.fairway, gir: !!row.gir, one_putt: !!row.one_putt,
      };
    });
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
  const pts = new Array(6).fill(0);
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
      <div>
        <div class="sc-hole">${holeNumber}</div>
        <div class="sc-muted">Par ${info.par} · SI ${info.stroke_index}</div>
      </div>
      <div class="sc-bonus">
        <button data-field="fairway" class="${s.fairway?'on':''}">F</button>
        <button data-field="gir" class="${s.gir?'on':''}">GIR</button>
        <button data-field="one_putt" class="${s.one_putt?'on':''}">1P</button>
      </div>
      <div class="sc-shots"><input type="number" min="1" max="20" inputmode="numeric" data-field="shots" value="${s.shots ?? ''}"></div>
      <div class="sc-pts" id="sc-pts-${holeNumber}">${pts===null?'–':pts}</div>
    </div>
  `;
}

function scSubtotalHtml(label, playerIdx, holeNumbers, cls){
  let shotsSum = 0, ptsSum = 0, anyShots = false;
  holeNumbers.forEach(hn=>{
    const s = scoreFor(playerIdx, hn);
    if(s.shots!=null){ shotsSum += s.shots; anyShots = true; }
    const info = courseInfo(hn);
    const p = stablefordPoints(s.shots, players[playerIdx].handicap, info.par, info.stroke_index);
    if(p!==null) ptsSum += p;
  });
  return `
    <div class="sc-row ${cls}">
      <div class="sc-hole" style="font-size:0.85rem;">${label}</div>
      <div class="sc-muted"></div>
      <div class="sc-muted" style="text-align:center;">${anyShots ? shotsSum+' shots' : ''}</div>
      <div class="sc-pts">${ptsSum}</div>
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
      <b>${escapeHtml(p.name)}</b> · handicap ${p.handicap} — enter your gross shots for each hole and the Stableford points work themselves out. Keep going through all 18 even after your bracket matches are decided.
    </div>
    <div class="scorecard" id="scorecard-body">
      ${out.map(h=>scRowHtml(selectedPlayerIdx,h)).join('')}
      ${scSubtotalHtml('OUT', selectedPlayerIdx, out, 'subtotal')}
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
      <h2>Scoring</h2>
      <div style="font-size:0.88rem; line-height:1.8; color:var(--text-muted);">
        Your <b style="color:var(--gold)">Scorecard</b> tab shows standard Stableford points (net score vs. par, using your handicap) for your own round.<br><br>
        For the group stage, semis and final, whoever scores more Stableford points on a shared hole wins it:<br>
        <b style="color:var(--gold)">2 pts</b> — win the hole · <b style="color:var(--gold)">1 pt</b> — halve it<br>
        plus <b style="color:var(--gold)">1 pt each</b> for fairway, GIR, and first-putt hole-outs.
      </div>
    </div>
    <div class="card" style="border-color:rgba(168,64,47,0.35);">
      <h2 style="color:var(--danger);">Danger zone</h2>
      <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.9rem;">
        Wipes every score, and resets player names, handicaps and course settings back to defaults. Use this to clear out test data before the real thing starts.
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
  return `
    <div class="rules-note">Set the par and stroke index (1 = hardest, 18 = easiest) for each hole. This drives the automatic Stableford calculation everywhere else on this page.</div>
    <div class="card">${rows}</div>
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
  const standings = computeStandings();
  const [seed1, seed2, seed3, seed4] = standings;
  const groupHoles = SCHEDULE.map(s=>s[0]).filter((v,i,a)=>a.indexOf(v)===i);
  const groupDone = groupHoles.every(hn =>
    SCHEDULE.filter(s=>s[0]===hn).every(([, a, b]) => !matchResultForHole(a,b,hn).pending)
  );
  if(!groupDone){
    return `
      <h2 style="margin-bottom:0.75rem;">Semi-Final 1</h2>
      <div class="card"><div class="tbd">Finish all 10 holes of the group stage to lock in the semi-final line-up.</div></div>
      <h2 style="margin-bottom:0.75rem;">Semi-Final 2</h2>
      <div class="card"><div class="tbd">Finish all 10 holes of the group stage to lock in the semi-final line-up.</div></div>
    `;
  }
  const sf1 = renderStageSummary({
    idxA: seed1.idx, idxB: seed4.idx, holeNumbers:[11,12,13],
    nameA: seed1.name, nameB: seed4.name, title:'Semi-Final 1 (Seed 1 v Seed 4)',
  });
  const sf2 = renderStageSummary({
    idxA: seed2.idx, idxB: seed3.idx, holeNumbers:[11,12,13],
    nameA: seed2.name, nameB: seed3.name, title:'Semi-Final 2 (Seed 2 v Seed 3)',
  });
  return sf1 + sf2;
}

function renderFinal(){
  const standings = computeStandings();
  const [seed1, seed2, seed3, seed4] = standings;
  const w1 = stageWinner(seed1.idx, seed4.idx, [11,12,13], seed1.name, seed4.name);
  const w2 = stageWinner(seed2.idx, seed3.idx, [11,12,13], seed2.name, seed3.name);
  const idxA = w1===seed1.name ? seed1.idx : w1===seed4.name ? seed4.idx : null;
  const idxB = w2===seed2.name ? seed2.idx : w2===seed3.name ? seed3.idx : null;
  let subtitle = 'Complete both semi-finals to set the final.';
  if(w1==='TIE' || w2==='TIE') subtitle = 'A semi-final is tied — play a sudden-death hole there before the final can be set.';
  return renderStageSummary({
    idxA, idxB, holeNumbers:[14,15,16,17],
    nameA: idxA!==null?players[idxA].name:null, nameB: idxB!==null?players[idxB].name:null,
    title:'The Final', subtitle, championStyle:true,
  });
}

/* ---------------------------------------------------------
   EVENT HANDLERS
--------------------------------------------------------- */
function attachHandlers(){
  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.onclick = ()=>{ currentTab = b.dataset.tab; render(); };
  });

  if(currentTab==='scorecard'){
    document.querySelectorAll('.player-chip').forEach(chip=>{
      chip.onclick = ()=>{
        selectedPlayerIdx = parseInt(chip.dataset.selectPlayer,10);
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
        input.oninput = ()=>{
          if(!scores[selectedPlayerIdx]) scores[selectedPlayerIdx] = {};
          if(!scores[selectedPlayerIdx][holeNumber]) scores[selectedPlayerIdx][holeNumber] = {};
          scores[selectedPlayerIdx][holeNumber].shots = input.value === '' ? null : parseInt(input.value,10);
          refreshRow();
          clearTimeout(debounce);
          debounce = setTimeout(()=>{
            inFlight = true;
            postJson('/api/golf/score', { playerIdx: selectedPlayerIdx, holeNumber, field:'shots', value: input.value })
              .finally(()=>{ inFlight = false; });
          }, 500);
        };
      }
      row.querySelectorAll('.sc-bonus button').forEach(btn=>{
        btn.onclick = ()=>{
          const f = btn.dataset.field;
          if(!scores[selectedPlayerIdx]) scores[selectedPlayerIdx] = {};
          if(!scores[selectedPlayerIdx][holeNumber]) scores[selectedPlayerIdx][holeNumber] = {};
          const cur = !!scores[selectedPlayerIdx][holeNumber][f];
          scores[selectedPlayerIdx][holeNumber][f] = !cur;
          btn.classList.toggle('on', !cur);
          inFlight = true;
          postJson('/api/golf/score', { playerIdx: selectedPlayerIdx, holeNumber, field:f, value: !cur })
            .finally(()=>{ inFlight = false; });
        };
      });
    });
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

    const resetBtn = document.getElementById('resetAllBtn');
    if(resetBtn){
      resetBtn.onclick = async ()=>{
        if(!confirm('Delete every golf score and reset players, handicaps and course settings to defaults? This can\'t be undone.')) return;
        const msgEl = document.getElementById('reset-msg');
        resetBtn.disabled = true;
        try{
          const res = await fetch('/api/admin/golf/reset', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
          if(res.status === 401){
            msgEl.innerHTML = `<div class="alert alert-error" style="margin-top:0.9rem;">You need to be logged in as admin to do this. Log in at <a href="/admin.html" style="color:inherit;text-decoration:underline;">/admin.html</a>, then come back and try again.</div>`;
          } else if(res.status === 403){
            const data = await res.json().catch(()=>({}));
            msgEl.innerHTML = `<div class="alert alert-error" style="margin-top:0.9rem;">${escapeHtml(data.error || 'Admin login is not set up on this site.')}</div>`;
          } else if(res.ok){
            msgEl.innerHTML = `<div class="alert alert-success" style="margin-top:0.9rem;">Golf sweepstake reset — all clear.</div>`;
            await loadState();
          } else {
            msgEl.innerHTML = `<div class="alert alert-error" style="margin-top:0.9rem;">Something went wrong — try again.</div>`;
          }
        } catch(e){
          msgEl.innerHTML = `<div class="alert alert-error" style="margin-top:0.9rem;">Couldn't reach the server — check your connection and try again.</div>`;
        } finally {
          resetBtn.disabled = false;
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
  }
}

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
loadState();
startPolling();

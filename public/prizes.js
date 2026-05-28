'use strict';

async function loadPrizes() {
  try {
    const r = await fetch('/api/prizes');
    if (!r.ok) throw new Error();
    const d = await r.json();

    document.getElementById('total-entries').textContent = d.totalEntries;
    document.getElementById('total-pot').textContent     = `£${d.totalPot}`;

    const grid = document.getElementById('prize-grid');
    const sections = [
      { key: 'group',    icon: '⚽', label: 'Group Stage',    note: '(capped at £50)' },
      { key: 'knockout', icon: '🏆', label: 'Knockout Stage', note: '(capped at £50)' },
      { key: 'overall',  icon: '🥇', label: 'Overall',        note: '(remainder)' },
    ];

    grid.innerHTML = sections.map(s => {
      const p = d[s.key];
      return `<div class="prize-card">
        <h3>${s.icon} ${s.label}</h3>
        <div class="prize-pot-total">£${p.pot}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:0.75rem;">${s.note}</div>
        <div class="prize-breakdown">
          <div>🥇 1st (60%) — <strong>£${p.prize1}</strong></div>
          <div>🥈 2nd (30%) — <strong>£${p.prize2}</strong></div>
          <div>🥉 3rd (10%) — <strong>£${p.prize3}</strong></div>
        </div>
      </div>`;
    }).join('');
  } catch {
    document.getElementById('prize-grid').innerHTML =
      '<p class="text-muted">Prize data unavailable — prizes are calculated from paid entries.</p>';
  }
}

loadPrizes();

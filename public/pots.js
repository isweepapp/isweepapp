'use strict';

const FLAG_CODES = {};
if (typeof GROUPS !== 'undefined') {
  GROUPS.forEach(g => g.teams.forEach(t => { FLAG_CODES[t.name] = t.code; }));
}

function flag(team) {
  const code = FLAG_CODES[team];
  return code ? `<span class="fi fi-${code}"></span>` : '<span style="width:24px;display:inline-block"></span>';
}

const POTS = [
  {
    pot: 1, icon: 'ð¥', color: 'var(--pot1-col)',
    label: 'Pot 1  Top Seeds',
    sub:   'FIFA Ranks 112 · 1 team drawn per entry',
    teams: ['France','Spain','Argentina','England','Portugal','Brazil',
            'Netherlands','Morocco','Belgium','Germany','Croatia','Uruguay']
  },
  {
    pot: 2, icon: 'ð¥', color: 'var(--pot2-col)',
    label: 'Pot 2  Second Tier',
    sub:   'FIFA Ranks 1330 · 2 teams drawn per entry',
    teams: ['Switzerland','Colombia','Mexico','United States','Japan','Iran',
            'Senegal','Austria','Australia','South Korea','Ecuador','Egypt',
            'Canada','Ivory Coast','Qatar','Algeria','Sweden','Tunisia']
  },
  {
    pot: 3, icon: 'ð¥', color: 'var(--pot3-col)',
    label: 'Pot 3  Third Tier',
    sub:   'FIFA Ranks 3148 · 3 teams drawn per entry',
    teams: ['Czechia','TÃ¼rkiye','Norway','Scotland','DR Congo','Bosnia & Herzegovina',
            'Panama','Saudi Arabia','South Africa','Iraq','Uzbekistan','Paraguay',
            'Ghana','Jordan','Cape Verde','CuraÃ§ao','Haiti','New Zealand']
  }
];

const grid = document.getElementById('pots-grid');
grid.innerHTML = POTS.map(p => {
  const teamRows = p.teams.map(t =>
    `<div class="pot-team">${flag(t)} ${t}</div>`
  ).join('');

  return `<div class="card pot-card">
    <h2 style="color:${p.color}">${p.icon} ${p.label}</h2>
    <div class="pot-subtitle">${p.sub}</div>
    <div class="pot-teams">${teamRows}</div>
  </div>`;
}).join('');

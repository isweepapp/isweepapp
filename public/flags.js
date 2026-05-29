'use strict';

// World Cup 2026  Groups AL
// Team names match seedTeams.sql exactly so group-finish lookups align.
const GROUPS = [
  { letter: 'A', teams: [
    { code: 'mx',     name: 'Mexico' },
    { code: 'za',     name: 'South Africa' },
    { code: 'kr',     name: 'South Korea' },
    { code: 'cz',     name: 'Czechia' },
  ]},
  { letter: 'B', teams: [
    { code: 'ca',     name: 'Canada' },
    { code: 'ba',     name: 'Bosnia & Herzegovina' },
    { code: 'qa',     name: 'Qatar' },
    { code: 'ch',     name: 'Switzerland' },
  ]},
  { letter: 'C', teams: [
    { code: 'br',     name: 'Brazil' },
    { code: 'ma',     name: 'Morocco' },
    { code: 'ht',     name: 'Haiti' },
    { code: 'gb-sct', name: 'Scotland' },
  ]},
  { letter: 'D', teams: [
    { code: 'us',     name: 'United States' },
    { code: 'py',     name: 'Paraguay' },
    { code: 'au',     name: 'Australia' },
    { code: 'tr',     name: 'TÃ¼rkiye' },
  ]},
  { letter: 'E', teams: [
    { code: 'de',     name: 'Germany' },
    { code: 'cw',     name: 'CuraÃ§ao' },
    { code: 'ci',     name: 'Ivory Coast' },
    { code: 'ec',     name: 'Ecuador' },
  ]},
  { letter: 'F', teams: [
    { code: 'nl',     name: 'Netherlands' },
    { code: 'jp',     name: 'Japan' },
    { code: 'se',     name: 'Sweden' },
    { code: 'tn',     name: 'Tunisia' },
  ]},
  { letter: 'G', teams: [
    { code: 'be',     name: 'Belgium' },
    { code: 'eg',     name: 'Egypt' },
    { code: 'ir',     name: 'Iran' },
    { code: 'nz',     name: 'New Zealand' },
  ]},
  { letter: 'H', teams: [
    { code: 'es',     name: 'Spain' },
    { code: 'cv',     name: 'Cape Verde' },
    { code: 'sa',     name: 'Saudi Arabia' },
    { code: 'uy',     name: 'Uruguay' },
  ]},
  { letter: 'I', teams: [
    { code: 'fr',     name: 'France' },
    { code: 'sn',     name: 'Senegal' },
    { code: 'iq',     name: 'Iraq' },
    { code: 'no',     name: 'Norway' },
  ]},
  { letter: 'J', teams: [
    { code: 'ar',     name: 'Argentina' },
    { code: 'dz',     name: 'Algeria' },
    { code: 'at',     name: 'Austria' },
    { code: 'jo',     name: 'Jordan' },
  ]},
  { letter: 'K', teams: [
    { code: 'pt',     name: 'Portugal' },
    { code: 'cd',     name: 'DR Congo' },
    { code: 'uz',     name: 'Uzbekistan' },
    { code: 'co',     name: 'Colombia' },
  ]},
  { letter: 'L', teams: [
    { code: 'gb-eng', name: 'England' },
    { code: 'hr',     name: 'Croatia' },
    { code: 'gh',     name: 'Ghana' },
    { code: 'pa',     name: 'Panama' },
  ]},
];

function buildGroupBlock(group) {
  const frag = document.createDocumentFragment();

  const label = document.createElement('div');
  label.className = 'flag-group-label';
  label.textContent = group.letter;
  frag.appendChild(label);

  group.teams.forEach(({ code, name }) => {
    const el = document.createElement('span');
    el.className = `fi fi-${code} flag-item`;
    el.title = name;
    frag.appendChild(el);
  });

  return frag;
}

function buildStrip(side) {
  const strip = document.createElement('div');
  strip.className = `flags-strip flags-${side}`;
  strip.setAttribute('aria-hidden', 'true');

  const inner = document.createElement('div');
  inner.className = 'flags-inner';

  [GROUPS, GROUPS].forEach(set => {
    set.forEach(group => inner.appendChild(buildGroupBlock(group)));
  });

  strip.appendChild(inner);
  return strip;
}

document.addEventListener('DOMContentLoaded', () => {
  document.body.appendChild(buildStrip('left'));
  document.body.appendChild(buildStrip('right'));
});

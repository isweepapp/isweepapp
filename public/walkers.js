'use strict';

// Cartoon walking-people strip — appears under the header on every page.
// Add up to 20 walker SVGs to the WALKERS array below.

const WALKERS = [
  `<svg width="56" height="64" viewBox="0 0 56 64" xmlns="http://www.w3.org/2000/svg">
  <g>
    <line x1="36" y1="22" x2="50" y2="2" stroke="#caa46a" stroke-width="2"/>
    <path d="M50,2 L54,4 L52,10 L50,9 Z" fill="#c1272d"/>
    <path d="M50,5 L51.5,7.2 L53.6,5.9 L52.4,8.2 L54.5,9 L52,9.3 L52.6,11.5 L51,9.8 L49.6,11.8 L49.8,9.5 L47.6,9.9 L49.6,8.4 L48,6.5 Z" fill="#1a7a3e" transform="scale(0.55) translate(40,4)"/>
    <ellipse cx="28" cy="60" rx="11" ry="2.4" fill="#1a1a1a" opacity="0.18"/>
    <path d="M19,40 L16,58 L20,58 L24,42 Z" fill="#0a0a0a" class="walker-leg-a"/>
    <path d="M33,40 L37,58 L33,58 L29,42 Z" fill="#1a1a1a" class="walker-leg-b"/>
    <rect x="15" y="58" width="7" height="3" rx="1.4" fill="#0a0a0a"/>
    <rect x="31" y="58" width="7" height="3" rx="1.4" fill="#0a0a0a"/>
    <path d="M18,24 Q16,40 19,42 L37,42 Q40,40 38,24 Z" fill="#ffffff"/>
    <path d="M22,26 L34,26 L33,42 L23,42 Z" fill="#d4b85a"/>
    <path d="M36,24 L40,38 L36,40 L33,26 Z" fill="#ffffff" class="walker-arm-a"/>
    <path d="M20,24 L17,40 L21,40 L23,26 Z" fill="#f4f4f4" class="walker-arm-b"/>
    <circle cx="28" cy="14" r="9" fill="#e3a877"/>
    <path d="M19,10 Q28,1 37,10 Q35,7 28,7 Q21,7 19,10 Z" fill="#2b2b2b"/>
    <circle cx="25" cy="14" r="1" fill="#222"/>
    <circle cx="31" cy="14" r="1" fill="#222"/>
    <path d="M24,18 Q28,21 32,18" stroke="#9a5530" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M22,18 Q21,21 22,23" stroke="#caa46a" stroke-width="1" fill="none"/>
  </g>
</svg>`,
  `<svg width="56" height="64" viewBox="0 0 56 64" xmlns="http://www.w3.org/2000/svg">
  <g>
    <ellipse cx="28" cy="60" rx="11" ry="2.4" fill="#1a1a1a" opacity="0.18"/>
    <path d="M19,42 L16,58 L20,58 L23,44 Z" fill="#caa46a" class="walker-leg-a"/>
    <path d="M33,42 L37,58 L33,58 L30,44 Z" fill="#b8924f" class="walker-leg-b"/>
    <ellipse cx="17.5" cy="59" rx="4.5" ry="2" fill="#7a4a18"/>
    <ellipse cx="35" cy="59" rx="4.5" ry="2" fill="#7a4a18"/>
    <path d="M28,26 L17,46 L20,47 L28,42 L36,47 L39,46 Z" fill="#a9651b"/>
    <path d="M28,26 L21,44 L25,45 L28,38 L31,45 L35,44 Z" fill="#c1781f"/>
    <circle cx="28" cy="44" r="3.6" fill="#8b5e1f" stroke="#caa46a" stroke-width="0.8"/>
    <path d="M22,38 L20,28 Q19,26 21,26 Q23,27 24,30 Z" fill="#caa46a"/>
    <path d="M34,38 L36,28 Q37,26 35,26 Q33,27 32,30 Z" fill="#caa46a"/>
    <path d="M36,26 L42,16 L40,15 L34,24 Z" fill="#e3a877" class="walker-arm-a"/>
    <rect x="38" y="10" width="7" height="6" rx="1" fill="#1a1a1a"/>
    <rect x="36" y="9" width="3" height="3" rx="0.5" fill="#1a1a1a"/>
    <rect x="44" y="9" width="3" height="3" rx="0.5" fill="#1a1a1a"/>
    <path d="M20,26 L18,38 L21,38 L24,28 Z" fill="#e3a877" class="walker-arm-b"/>
    <circle cx="28" cy="14" r="9" fill="#e3a877"/>
    <path d="M19,11 Q18,4 23,3 Q26,0 32,2 Q38,4 36,11 Q35,7 31,7 Q27,5 23,7 Q20,8 19,11 Z" fill="#7a4f2c"/>
    <circle cx="25" cy="14" r="1" fill="#222"/>
    <circle cx="31" cy="14" r="1" fill="#222"/>
    <path d="M24,18 Q28,21 32,18" stroke="#9a5530" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`,
  `<svg width="56" height="64" viewBox="0 0 56 64" xmlns="http://www.w3.org/2000/svg">
  <g>
    <line x1="38" y1="22" x2="50" y2="0" stroke="#9a9a9a" stroke-width="2"/>
    <path d="M50,0 L62,5 L60,14 L50,11 Z" fill="#f6d9a8"/>
    <text x="55" y="9" font-size="6" fill="#caa028" font-weight="700" transform="rotate(20 55 9)">2026</text>
    <ellipse cx="28" cy="60" rx="11" ry="2.4" fill="#1a1a1a" opacity="0.18"/>
    <path d="M19,42 L15,58 L19,58 L24,44 Z" fill="#1a52a3" class="walker-leg-a"/>
    <path d="M33,42 L38,58 L34,58 L28,44 Z" fill="#2563c4" class="walker-leg-b"/>
    <ellipse cx="16.5" cy="59" rx="4.5" ry="2" fill="#1a1a1a"/>
    <ellipse cx="36.5" cy="59" rx="4.5" ry="2" fill="#1a1a1a"/>
    <path d="M17,24 Q15,40 18,44 L38,44 Q41,40 39,24 Z" fill="#e0703a"/>
    <circle cx="22" cy="32" r="1.4" fill="#a85420"/>
    <circle cx="22" cy="37" r="1.4" fill="#a85420"/>
    <circle cx="22" cy="42" r="1.4" fill="#a85420"/>
    <rect x="33" y="25" width="6" height="4" rx="1" fill="#a85420"/>
    <path d="M38,24 L48,16 L51,19 L42,28 Z" fill="#e0703a" class="walker-arm-a"/>
    <circle cx="49" cy="17" r="2.6" fill="#f0f0f0"/>
    <path d="M18,24 L14,42 L18,42 L21,28 Z" fill="#e0703a" class="walker-arm-b"/>
    <circle cx="28" cy="14" r="9" fill="#e3a877"/>
    <path d="M18,9 Q18,2 28,2 Q38,2 38,9 L38,12 L33,11 L33,8 L23,8 L23,11 L18,12 Z" fill="#e0703a"/>
    <path d="M16,9 L40,9 L40,11 L16,11 Z" fill="#1a52a3"/>
    <path d="M26,1 L28,-3 L30,1 L33,-1 L31,3 Z" fill="#f0a830"/>
    <circle cx="25" cy="14" r="1" fill="#222"/>
    <circle cx="31" cy="14" r="1" fill="#222"/>
    <path d="M24,18 Q28,21 32,18" stroke="#9a5530" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`,
  `<svg width="56" height="64" viewBox="0 0 56 64" xmlns="http://www.w3.org/2000/svg">
  <g>
    <ellipse cx="28" cy="60" rx="11" ry="2.4" fill="#1a1a1a" opacity="0.18"/>
    <path d="M19,42 L15,58 L19,58 L24,44 Z" fill="#0a0a0a" class="walker-leg-a"/>
    <path d="M33,42 L38,58 L34,58 L28,44 Z" fill="#1a1a1a" class="walker-leg-b"/>
    <ellipse cx="16.5" cy="59" rx="4.5" ry="2" fill="#caa46a"/>
    <ellipse cx="36.5" cy="59" rx="4.5" ry="2" fill="#caa46a"/>
    <path d="M17,24 Q15,40 18,44 L38,44 Q41,40 39,24 Z" fill="#e0382c"/>
    <path d="M17,24 Q19,30 28,30 Q37,30 39,24 L38,22 Q28,28 18,22 Z" fill="#1a1a1a"/>
    <path d="M16,22 L42,30 L41,33 L15,25 Z" fill="#1a1a1a"/>
    <line x1="14" y1="44" x2="6" y2="62" stroke="#c9c9c9" stroke-width="1.4" class="walker-arm-a"/>
    <circle cx="6" cy="62" r="1.6" fill="#888"/>
    <path d="M16,24 L10,42 L14,42 L19,28 Z" fill="#e0382c" class="walker-arm-b"/>
    <line x1="40" y1="44" x2="48" y2="62" stroke="#c9c9c9" stroke-width="1.4" class="walker-arm-b"/>
    <circle cx="48" cy="62" r="1.6" fill="#888"/>
    <path d="M40,24 L46,42 L42,42 L37,28 Z" fill="#e0382c" class="walker-arm-a"/>
    <circle cx="28" cy="14" r="9" fill="#caa078"/>
    <path d="M19,9 Q19,1 28,1 Q37,1 37,9 L37,13 Q28,8 19,13 Z" fill="#1a1a1a"/>
    <circle cx="25" cy="15" r="1" fill="#222"/>
    <circle cx="31" cy="15" r="1" fill="#222"/>
    <path d="M24,19 Q28,21 32,19" stroke="#8a4a28" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`
];

function buildWalkerStrip() {
  if (document.querySelector('.walker-strip')) return;

  const strip = document.createElement('div');
  strip.className = 'walker-strip';
  strip.setAttribute('aria-hidden', 'true');

  const lane = document.createElement('div');
  lane.className = 'walker-lane';

  // Repeat the set enough times to fill a wide screen with gaps, looped seamlessly
  const REPEATS = 3;
  const order = [];
  for (let r = 0; r < REPEATS; r++) {
    for (let i = 0; i < WALKERS.length; i++) order.push(i);
  }

  order.forEach((idx, position) => {
    const wrap = document.createElement('div');
    wrap.className = 'walker-item';
    wrap.innerHTML = WALKERS[idx];
    const delay = (position * 1.1) % (WALKERS.length * REPEATS * 1.1);
    wrap.style.animationDelay = `${delay}s`;
    lane.appendChild(wrap);
  });

  strip.appendChild(lane);

  // Insert directly after the header (or at top of body if no header found)
  const header = document.querySelector('header');
  if (header && header.parentNode) {
    header.parentNode.insertBefore(strip, header.nextSibling);
  } else {
    document.body.insertBefore(strip, document.body.firstChild);
  }
}

document.addEventListener('DOMContentLoaded', buildWalkerStrip);

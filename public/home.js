'use strict';

// ── Countdown ─────────────────────────────────────────────────────────────────
const WC_START = new Date('2026-06-11T19:00:00Z'); // Mexico vs South Africa

function pad(n) { return String(n).padStart(2, '0'); }

function renderCountdown(target) {
  const now  = new Date();
  const diff = target - now;

  if (diff <= 0) return false; // target reached

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

async function initCountdown() {
  let matches = [];
  try {
    const r = await fetch('/api/matches');
    if (r.ok) matches = await r.json();
  } catch (_) {}

  const now   = new Date();
  const played   = matches.filter(m => m.score_a !== null && m.score_b !== null);
  const upcoming = matches.filter(m => m.score_a === null  && new Date(m.date) > now)
                          .sort((a, b) => new Date(a.date) - new Date(b.date));

  // If tournament hasn't started yet — count down to WC_START
  if (played.length === 0 && upcoming.length > 0) {
    const target    = WC_START;
    const first     = upcoming[0];
    document.getElementById('cd-match').textContent = `${first.team_a} vs ${first.team_b}`;
    document.getElementById('cd-subtitle').textContent = `Opening match · ${formatDate(first.date)}`;

    renderCountdown(target);
    const id = setInterval(() => {
      if (!renderCountdown(target)) clearInterval(id);
    }, 1000);
    return;
  }

  // Tournament underway — count down to next upcoming match
  if (upcoming.length > 0) {
    const next   = upcoming[0];
    const target = new Date(next.date);

    document.getElementById('cd-match').textContent   = `${next.team_a} vs ${next.team_b}`;
    document.getElementById('cd-subtitle').textContent = `Next match · ${formatDate(next.date)}`;

    if (target > now) {
      renderCountdown(target);
      const id = setInterval(() => {
        if (!renderCountdown(target)) clearInterval(id);
      }, 1000);
    } else {
      showLive(next);
    }
    return;
  }

  // No upcoming matches — show latest result
  if (played.length > 0) {
    const last = played[played.length - 1];
    document.getElementById('cd-units').innerHTML = '<div class="cd-live">🏆 Tournament Complete</div>';
    document.getElementById('cd-match').textContent   = `${last.team_a} ${last.score_a}–${last.score_b} ${last.team_b}`;
    document.getElementById('cd-subtitle').textContent = 'Final result';
    return;
  }

  // Fallback — plain countdown to WC start
  renderCountdown(WC_START);
  document.getElementById('cd-match').textContent    = 'Mexico vs South Africa';
  document.getElementById('cd-subtitle').textContent = 'Opening match · 11 Jun 2026';
  const id = setInterval(() => {
    if (!renderCountdown(WC_START)) clearInterval(id);
  }, 1000);
}

function showLive(match) {
  document.getElementById('cd-units').innerHTML = '<div class="cd-live">🔴 LIVE NOW</div>';
  document.getElementById('cd-match').textContent   = `${match.team_a} vs ${match.team_b}`;
  document.getElementById('cd-subtitle').textContent = match.stage || '';
}

function formatDate(d) {
  return new Date(d).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
  });
}

document.addEventListener('DOMContentLoaded', initCountdown);

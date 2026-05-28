'use strict';

function showAlert(el, type, msg) {
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideAlert(el) { el.classList.add('hidden'); }

// ── Main entry form ───────────────────────────────────────────────────────────
const form      = document.getElementById('entry-form');
const formAlert = document.getElementById('form-alert');
const submitBtn = document.getElementById('submit-btn');

form.addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert(formAlert);

  const name        = document.getElementById('name').value.trim();
  const email       = document.getElementById('email').value.trim();
  const tiebreakRaw = document.getElementById('tiebreak').value.trim();
  const knownBy     = document.getElementById('knownBy')?.value.trim()     || '';
  const clubTeam    = document.getElementById('clubTeam')?.value.trim()    || '';
  const countryTeam = document.getElementById('countryTeam')?.value.trim() || '';

  if (!name)  { showAlert(formAlert, 'error', 'Please enter a team name.'); return; }
  if (!email) { showAlert(formAlert, 'error', 'Please enter your email address.'); return; }
  if (tiebreakRaw === '') { showAlert(formAlert, 'error', 'Please enter your tiebreak guess (total goals).'); return; }

  const tiebreak = parseInt(tiebreakRaw, 10);
  if (isNaN(tiebreak) || tiebreak < 0 || tiebreak > 999) {
    showAlert(formAlert, 'error', 'Tiebreak must be a number between 0 and 999.'); return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const r = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, tiebreak, knownBy, clubTeam, countryTeam }),
    });
    const data = await r.json();
    if (!r.ok) { showAlert(formAlert, 'error', data.error || 'Submission failed. Please try again.'); return; }
    showAlert(formAlert, 'success', data.message || 'Entry received!');
    form.reset();
  } catch {
    showAlert(formAlert, 'error', 'Network error — please check your connection and try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Entry — £5';
  }
});

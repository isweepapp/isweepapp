'use strict';

const express      = require('express');
const cookieParser = require('cookie-parser');
const crypto       = require('crypto');
const path         = require('path');
const fs           = require('fs');
const multer       = require('multer');
const { v4: uuidv4 } = require('uuid');
const { DatabaseSync } = require('node:sqlite');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT    = process.env.PORT || 3001;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'isweepapp.db');
const MAX_TRIES = 200;

const ADMIN_PASSWORD_RAW  = process.env.ADMIN_PASSWORD || '';
const ADMIN_PASSWORD_HASH = ADMIN_PASSWORD_RAW
  ? crypto.createHash('sha256').update(ADMIN_PASSWORD_RAW).digest('hex')
  : '';

// ── Database ──────────────────────────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'db', 'init.sql'), 'utf8'));

if (db.prepare('SELECT COUNT(*) AS cnt FROM teams').get().cnt === 0) {
  db.exec(fs.readFileSync(path.join(__dirname, 'db', 'seedTeams.sql'), 'utf8'));
  console.log('[DB] Teams seeded from seedTeams.sql');
}

if (db.prepare('SELECT COUNT(*) AS cnt FROM matches').get().cnt === 0) {
  db.exec(fs.readFileSync(path.join(__dirname, 'db', 'seedMatches.sql'), 'utf8'));
  console.log('[DB] Matches seeded from seedMatches.sql');
}

// Startup cleanup: remove seeded rows already superseded by a prior API sync
cleanupSeededMatches();

// Migrate: add tiebreak_guess for existing databases
try { db.exec('ALTER TABLE participants ADD COLUMN tiebreak_guess INTEGER NULL'); } catch (_) {}

// Migrate: change UNIQUE(email) → UNIQUE(email, name) + add is_primary column
{
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='participants'").get();
  if (row && /email\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(row.sql)) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`CREATE TABLE participants_new (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 1, extra_entries INTEGER NOT NULL DEFAULT 0,
      tiebreak_guess INTEGER NULL, created_at TEXT NOT NULL, UNIQUE(email, name)
    )`);
    db.exec(`INSERT OR IGNORE INTO participants_new (id, name, email, is_primary, extra_entries, tiebreak_guess, created_at)
      SELECT id, name, email, 1, extra_entries, tiebreak_guess, created_at FROM participants`);
    db.exec('DROP TABLE participants');
    db.exec('ALTER TABLE participants_new RENAME TO participants');
    db.exec('PRAGMA foreign_keys = ON');
    console.log('[DB] Migrated participants: UNIQUE(email,name) + is_primary');
  }
}
try { db.exec('ALTER TABLE participants ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 1'); } catch (_) {}

// Migrate: add pot2_team_2, pot3_team_2, pot3_team_3 for 1+2+3 draw format
try { db.exec('ALTER TABLE entries ADD COLUMN pot2_team_2 TEXT NULL'); } catch (_) {}
try { db.exec('ALTER TABLE entries ADD COLUMN pot3_team_2 TEXT NULL'); } catch (_) {}
try { db.exec('ALTER TABLE entries ADD COLUMN pot3_team_3 TEXT NULL'); } catch (_) {}
try { db.exec('ALTER TABLE participants ADD COLUMN known_by TEXT NULL'); } catch (_) {}
try { db.exec('ALTER TABLE participants ADD COLUMN club_team TEXT NULL'); } catch (_) {}
try { db.exec('ALTER TABLE participants ADD COLUMN country_team TEXT NULL'); } catch (_) {}
try { db.exec('ALTER TABLE participants ADD COLUMN paid INTEGER NOT NULL DEFAULT 0'); } catch (_) {}

function runTransaction(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Removes seeded placeholder rows (alphabetic IDs like 'ga-1a') once proper API rows
// (numeric IDs with full UTC datetimes) exist for the same fixture.
// Called on startup and after every API sync so date-only seeds never coexist with
// API datetimes, preventing duplicate / wrong-time entries on the matches page.
function cleanupSeededMatches() {
  const result = db.prepare(`
    DELETE FROM matches
    WHERE id NOT GLOB '[0-9]*'
    AND EXISTS (
      SELECT 1 FROM matches m2
      WHERE m2.id GLOB '[0-9]*'
        AND m2.stage = matches.stage
        AND (
          (m2.team_a = matches.team_a AND m2.team_b = matches.team_b)
          OR (m2.team_a = matches.team_b AND m2.team_b = matches.team_a)
        )
    )
  `).run();
  if (result.changes > 0)
    console.log(`[DB] Removed ${result.changes} seeded match row(s) superseded by API data`);
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Health check (Railway uses this to confirm the app is ready) ──────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// Graceful shutdown — let Railway's SIGTERM close cleanly without npm error noise
process.on('SIGTERM', () => { console.log('[Server] SIGTERM received — shutting down.'); process.exit(0); });
process.on('SIGINT',  () => { console.log('[Server] SIGINT received — shutting down.');  process.exit(0); });

// ── Admin auth ────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD_HASH) return res.status(403).json({ error: 'Admin disabled. Set ADMIN_PASSWORD environment variable.' });
  const cookie = req.cookies && req.cookies.admin_session;
  if (!cookie) return res.status(401).json({ error: 'Unauthorized' });
  const provided = crypto.createHash('sha256').update(String(cookie)).digest('hex');
  let match = false;
  try { match = crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(ADMIN_PASSWORD_HASH, 'hex')); } catch (_) {}
  if (!match) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD_HASH) return res.status(403).json({ error: 'Admin disabled.' });
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required.' });
  const provided = crypto.createHash('sha256').update(String(password)).digest('hex');
  let match = false;
  try { match = crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(ADMIN_PASSWORD_HASH, 'hex')); } catch (_) {}
  if (!match) return res.status(401).json({ error: 'Invalid password.' });
  res.cookie('admin_session', String(password), { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (_req, res) => { res.clearCookie('admin_session'); res.json({ ok: true }); });
app.get('/api/admin/check', requireAdmin, (_req, res) => res.json({ ok: true }));

// ── Public: Submit / update entry ─────────────────────────────────────────────
app.post('/api/entries', (req, res) => {
  let { name, email, tiebreak, knownBy, clubTeam, countryTeam } = req.body;
  name        = (name        || '').trim();
  email       = (email       || '').trim().toLowerCase();
  knownBy     = (knownBy     || '').trim() || null;
  clubTeam    = (clubTeam    || '').trim() || null;
  countryTeam = (countryTeam || '').trim() || null;
  tiebreak = (tiebreak !== undefined && tiebreak !== null && tiebreak !== '')
    ? parseInt(tiebreak, 10) : null;

  if (!name)  return res.status(400).json({ error: 'Team name is required.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (tiebreak === null) return res.status(400).json({ error: 'Tiebreak guess is required.' });
  if (isNaN(tiebreak) || tiebreak < 0 || tiebreak > 999) {
    return res.status(400).json({ error: 'Tiebreak guess must be between 0 and 999.' });
  }

  // Check for exact (email, name) match → update
  const existing = db.prepare('SELECT * FROM participants WHERE email = ? AND name = ?').get(email, name);
  if (existing) {
    runTransaction(() => {
      db.prepare('UPDATE participants SET tiebreak_guess = ?, known_by = COALESCE(?, known_by), club_team = COALESCE(?, club_team), country_team = COALESCE(?, country_team) WHERE id = ?')
        .run(tiebreak, knownBy, clubTeam, countryTeam, existing.id);
    });
    const total = 1 + existing.extra_entries;
    return res.json({
      ok: true,
      message: `Entry updated. "${name}" has ${total} ${total === 1 ? 'entry' : 'entries'}.`,
      participantId: existing.id,
    });
  }

  // New (email, name) — check if email already has any registration (determines pricing)
  const emailExists = db.prepare('SELECT id FROM participants WHERE email = ?').get(email);
  const isPrimary   = emailExists ? 0 : 1;

  let newEntryId;
  const pid = runTransaction(() => {
    const id  = uuidv4();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO participants (id, name, email, is_primary, extra_entries, tiebreak_guess, known_by, club_team, country_team, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)')
      .run(id, name, email, isPrimary, tiebreak, knownBy, clubTeam, countryTeam, now);
    newEntryId = uuidv4();
    db.prepare('INSERT INTO entries (id, participant_id, entry_index, created_at) VALUES (?, ?, 0, ?)').run(newEntryId, id, now);
    return id;
  });

  // Auto-draw teams for this entry immediately
  drawSingleEntry(newEntryId);

  const message = `Entry received for "${name}" — £5 due. Submit again with a different team name to enter again.`;

  res.json({ ok: true, message, participantId: pid });
});

// ── Public: Add extra entry ────────────────────────────────────────────────────
app.post('/api/entries/extra', (req, res) => {
  let { email, name, tiebreak } = req.body;
  email    = (email || '').trim().toLowerCase();
  name     = (name  || '').trim();
  tiebreak = (tiebreak !== undefined && tiebreak !== null && tiebreak !== '')
    ? parseInt(tiebreak, 10) : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!name) {
    return res.status(400).json({ error: 'Team name is required.' });
  }
  if (tiebreak === null) return res.status(400).json({ error: 'Tiebreak guess is required.' });
  if (isNaN(tiebreak) || tiebreak < 0 || tiebreak > 999) {
    return res.status(400).json({ error: 'Tiebreak guess must be between 0 and 999.' });
  }

  const participant = db.prepare('SELECT * FROM participants WHERE email = ? AND name = ?').get(email, name);
  if (!participant) {
    return res.status(404).json({ error: 'No entry found for that email and team name. Please submit a main entry first.' });
  }

  const newExtra  = participant.extra_entries + 1;
  const amountDue = newExtra + (participant.is_primary ? 0 : 1);
  let extraEntryId;
  runTransaction(() => {
    db.prepare('UPDATE participants SET extra_entries = ?, tiebreak_guess = ? WHERE id = ?').run(newExtra, tiebreak, participant.id);
    extraEntryId = uuidv4();
    db.prepare('INSERT INTO entries (id, participant_id, entry_index, created_at) VALUES (?, ?, ?, ?)')
      .run(extraEntryId, participant.id, newExtra, new Date().toISOString());
  });

  // Auto-draw teams for this extra entry immediately
  drawSingleEntry(extraEntryId);

  res.json({
    ok: true,
    message: `Extra entry added! "${name}" now has ${1 + newExtra} entries. Total amount due: £${amountDue}.`,
    totalEntries: 1 + newExtra,
    amountDue,
  });
});

// ── Public: Participant list (team name only — no emails) ─────────────────────
app.get('/api/participants', (_req, res) => {
  res.json(db.prepare(`
    SELECT name, known_by, (1 + extra_entries) AS total_entries,
           (1 + extra_entries) * 5 AS amount_due
    FROM participants ORDER BY created_at ASC
  `).all());
});

// ── Public: Stats ─────────────────────────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  const matchesPlayed    = db.prepare('SELECT COUNT(*) AS cnt FROM matches WHERE score_a IS NOT NULL AND score_b IS NOT NULL').get().cnt;
  const totalGoals       = db.prepare('SELECT COALESCE(SUM(COALESCE(goals_a,0)+COALESCE(goals_b,0)),0) AS t FROM matches WHERE score_a IS NOT NULL AND score_b IS NOT NULL').get().t || 0;
  const participantCount = db.prepare('SELECT COUNT(*) AS cnt FROM participants').get().cnt;

  const teamScores = computeTeamScores();
  let topTeam = null, topScore = 0; // only show a top team if someone has actually scored
  for (const [team, score] of Object.entries(teamScores)) {
    if (score > topScore) { topScore = score; topTeam = team; }
  }

  res.json({ matchesPlayed, totalGoals, topTeam: topTeam ? `${topTeam} (${topScore} pts)` : '—', participantCount });
});

// ── Leaderboard builder (shared by all three stage views) ─────────────────────
function buildLeaderboard(stageFilter) {
  const participants = db.prepare('SELECT id, name, known_by, club_team, country_team, (1 + extra_entries) AS total_entries FROM participants').all();
  const getEntries   = db.prepare('SELECT * FROM entries WHERE participant_id = ? ORDER BY entry_index ASC');
  const allStats     = computeTeamStats(stageFilter);

  const zero    = () => ({ played:0, wins:0, draws:0, losses:0, goalsFor:0, goalsAgainst:0, yellowCards:0, redCards:0, groupBonus:0 });
  const mergeIn = (acc, t) => {
    const s = allStats[t];
    if (!s) return;
    acc.played += s.played; acc.wins += s.wins; acc.draws += s.draws; acc.losses += s.losses;
    acc.goalsFor += s.goalsFor; acc.goalsAgainst += s.goalsAgainst;
    acc.yellowCards += s.yellowCards; acc.redCards += s.redCards; acc.groupBonus += s.groupBonus;
  };
  const tPts = t => { const s = allStats[t]; return s ? teamPoints(s) : 0; };

  const rows = [];
  for (const p of participants) {
    for (const e of getEntries.all(p.id)) {
      const assigned = !!(e.pot1_team && e.pot2_team && e.pot2_team_2 && e.pot3_team && e.pot3_team_2 && e.pot3_team_3);
      let stats = null;
      if (assigned) {
        const agg = zero();
        mergeIn(agg, e.pot1_team);
        mergeIn(agg, e.pot2_team);   mergeIn(agg, e.pot2_team_2);
        mergeIn(agg, e.pot3_team);   mergeIn(agg, e.pot3_team_2);   mergeIn(agg, e.pot3_team_3);
        stats = { ...agg, points: teamPoints(agg) };
      }
      rows.push({
        name: p.name, knownBy: p.known_by || null, clubTeam: p.club_team || null, countryTeam: p.country_team || null,
        entryIndex: e.entry_index, totalEntries: p.total_entries,
        pot1Team:  e.pot1_team   || null,
        pot2Teams: [e.pot2_team  || null, e.pot2_team_2 || null],
        pot3Teams: [e.pot3_team  || null, e.pot3_team_2 || null, e.pot3_team_3 || null],
        assigned, stats,
        teamPts: assigned ? {
          [e.pot1_team]:   tPts(e.pot1_team),
          [e.pot2_team]:   tPts(e.pot2_team),
          [e.pot2_team_2]: tPts(e.pot2_team_2),
          [e.pot3_team]:   tPts(e.pot3_team),
          [e.pot3_team_2]: tPts(e.pot3_team_2),
          [e.pot3_team_3]: tPts(e.pot3_team_3),
        } : null,
      });
    }
  }

  rows.sort((a, b) => (b.stats ? b.stats.points : -Infinity) - (a.stats ? a.stats.points : -Infinity));
  return rows;
}

// ── Public: Leaderboard — overall / group stage / knockout ────────────────────
app.get('/api/leaderboard',          (_req, res) => res.json(buildLeaderboard(null)));
app.get('/api/leaderboard/group',    (_req, res) => res.json(buildLeaderboard('group')));
app.get('/api/leaderboard/knockout', (_req, res) => res.json(buildLeaderboard('knockout')));

// ── Public: Prize fund breakdown ──────────────────────────────────────────────
app.get('/api/prizes', (_req, res) => {
  const rows         = db.prepare('SELECT (1 + extra_entries) AS total_entries FROM participants WHERE paid = 1').all();
  const totalEntries = rows.reduce((s, r) => s + r.total_entries, 0);
  const totalPot     = totalEntries * 5;

  // Each competition gets an equal share; Group & Knockout are capped at £50
  // — any excess above the cap flows into the Overall pot.
  const equalShare  = Math.floor(totalPot / 3);
  const groupPot    = Math.min(equalShare, 50);
  const knockoutPot = Math.min(equalShare, 50);
  const overallPot  = totalPot - groupPot - knockoutPot;

  const split = pot => {
    const p1 = Math.round(pot * 0.60);
    const p2 = Math.round(pot * 0.30);
    const p3 = Math.max(0, pot - p1 - p2);
    return { pot, prize1: p1, prize2: p2, prize3: p3 };
  };

  res.json({ totalPot, totalEntries, group: split(groupPot), knockout: split(knockoutPot), overall: split(overallPot) });
});

// ── Admin: Run draw (1 from pot 1, 2 from pot 2, 3 from pot 3) ───────────────
app.post('/api/admin/draw', requireAdmin, (_req, res) => {
  const pot1 = db.prepare('SELECT name FROM teams WHERE pot = 1 ORDER BY name').all().map(r => r.name);
  const pot2 = db.prepare('SELECT name FROM teams WHERE pot = 2 ORDER BY name').all().map(r => r.name);
  const pot3 = db.prepare('SELECT name FROM teams WHERE pot = 3 ORDER BY name').all().map(r => r.name);

  if (!pot1.length || pot2.length < 2 || pot3.length < 3) {
    return res.status(400).json({ error: 'Pots too small. Need ≥1 in pot 1, ≥2 in pot 2, ≥3 in pot 3.' });
  }

  // C(n,k) combinations
  const comb = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); };
  const maxCombos = pot1.length * comb(pot2.length, 2) * comb(pot3.length, 3);

  const usedCombos = new Set(
    db.prepare(`SELECT pot1_team, pot2_team, pot2_team_2, pot3_team, pot3_team_2, pot3_team_3
                FROM entries WHERE pot1_team IS NOT NULL AND pot2_team IS NOT NULL AND pot2_team_2 IS NOT NULL
                  AND pot3_team IS NOT NULL AND pot3_team_2 IS NOT NULL AND pot3_team_3 IS NOT NULL`)
      .all().map(e => comboKey(e.pot1_team, e.pot2_team, e.pot2_team_2, e.pot3_team, e.pot3_team_2, e.pot3_team_3))
  );

  const toAssign = db.prepare(`SELECT * FROM entries WHERE pot1_team IS NULL OR pot2_team IS NULL OR pot2_team_2 IS NULL
                                 OR pot3_team IS NULL OR pot3_team_2 IS NULL OR pot3_team_3 IS NULL`).all();
  if (!toAssign.length) {
    const totalEntries = db.prepare('SELECT COUNT(*) AS cnt FROM entries').get().cnt;
    const msg = totalEntries === 0
      ? 'No entries yet — nothing to draw. Re-run the draw any time after entries are submitted.'
      : 'All entries already assigned. Re-run the draw any time new entries are submitted.';
    return res.json({ ok: true, message: msg, assigned: 0, remaining: maxCombos - usedCombos.size, maxCombos, details: [] });
  }

  const updateEntry = db.prepare('UPDATE entries SET pot1_team = ?, pot2_team = ?, pot2_team_2 = ?, pot3_team = ?, pot3_team_2 = ?, pot3_team_3 = ? WHERE id = ?');
  const details = [];
  let assigned = 0, halted = false;

  for (const entry of toAssign) {
    if (usedCombos.size >= maxCombos) {
      halted = true;
      details.push({ entryId: entry.id, entryIndex: entry.entry_index, status: 'exhausted' });
      break;
    }

    let found = null;

    // Random tries (fast path — space is huge so collisions are very rare)
    for (let t = 0; t < MAX_TRIES; t++) {
      const [p1]          = pickRandom(pot1, 1);
      const [p2a, p2b]    = pickRandom(pot2, 2);
      const [p3a, p3b, p3c] = pickRandom(pot3, 3);
      const key = comboKey(p1, p2a, p2b, p3a, p3b, p3c);
      if (!usedCombos.has(key)) { found = { p1, p2a, p2b, p3a, p3b, p3c, key }; break; }
    }

    // Exhaustive fallback (only needed near total exhaustion)
    if (!found) {
      outer:
      for (const p1 of pot1)
        for (let i = 0; i < pot2.length; i++) for (let j = i+1; j < pot2.length; j++)
          for (let a = 0; a < pot3.length; a++) for (let b = a+1; b < pot3.length; b++) for (let c = b+1; c < pot3.length; c++) {
            const key = comboKey(p1, pot2[i], pot2[j], pot3[a], pot3[b], pot3[c]);
            if (!usedCombos.has(key)) { found = { p1, p2a: pot2[i], p2b: pot2[j], p3a: pot3[a], p3b: pot3[b], p3c: pot3[c], key }; break outer; }
          }
    }

    if (!found) { halted = true; details.push({ entryId: entry.id, entryIndex: entry.entry_index, status: 'exhausted' }); break; }

    usedCombos.add(found.key);
    updateEntry.run(found.p1, found.p2a, found.p2b, found.p3a, found.p3b, found.p3c, entry.id);
    assigned++;
    details.push({ entryId: entry.id, entryIndex: entry.entry_index, teams: [found.p1, found.p2a, found.p2b, found.p3a, found.p3b, found.p3c], status: 'assigned' });
    console.log(`[Draw] Entry ${entry.entry_index}: ${found.p1} | ${found.p2a}, ${found.p2b} | ${found.p3a}, ${found.p3b}, ${found.p3c}`);
  }

  const remaining = maxCombos - usedCombos.size;
  const message   = halted
    ? `Draw halted: all ${maxCombos} combinations exhausted. ${assigned} assigned before halt.`
    : `Draw complete. ${assigned} entries assigned. ${remaining} of ${maxCombos} combinations remaining.`;
  console.log(`[Draw] ${message}`);
  res.json({ ok: !halted, message, assigned, remaining, maxCombos, details });
});

// ── Admin: Import matches CSV ─────────────────────────────────────────────────
app.post('/api/admin/matches/import', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded.' });
  const lines = req.file.buffer.toString('utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return res.status(400).json({ error: 'CSV needs a header and at least one data row.' });

  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  for (const col of ['id', 'team_a', 'team_b']) {
    if (!header.includes(col)) return res.status(400).json({ error: `CSV missing required column: "${col}".` });
  }

  const toInt = v => (v === undefined || v === null || v === '') ? null : (isNaN(parseInt(v, 10)) ? null : parseInt(v, 10));
  const upsert = db.prepare(`
    INSERT INTO matches (id, date, team_a, team_b, score_a, score_b, goals_a, goals_b, yellows_a, yellows_b, reds_a, reds_b, stage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      date=excluded.date, team_a=excluded.team_a, team_b=excluded.team_b,
      score_a=excluded.score_a, score_b=excluded.score_b,
      goals_a=excluded.goals_a, goals_b=excluded.goals_b,
      yellows_a=excluded.yellows_a, yellows_b=excluded.yellows_b,
      reds_a=excluded.reds_a, reds_b=excluded.reds_b, stage=excluded.stage
  `);

  const count = runTransaction(() => {
    let n = 0;
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',');
      const row = {};
      header.forEach((h, idx) => { row[h] = (cells[idx] || '').trim(); });
      if (!row.id || !row.team_a || !row.team_b) continue;
      upsert.run(row.id, row.date || null, row.team_a, row.team_b,
        toInt(row.score_a), toInt(row.score_b), toInt(row.goals_a), toInt(row.goals_b),
        toInt(row.yellows_a), toInt(row.yellows_b), toInt(row.reds_a), toInt(row.reds_b), row.stage || null);
      n++;
    }
    return n;
  });

  res.json({ ok: true, message: `${count} match row(s) imported/updated.` });
});

// ── Admin: Group finishes ─────────────────────────────────────────────────────
app.post('/api/admin/group-finish', requireAdmin, (req, res) => {
  const team     = (req.body.team || '').trim();
  const position = parseInt(req.body.position, 10);
  if (!team) return res.status(400).json({ error: 'Team name required.' });
  if (isNaN(position) || position < 1 || position > 4) return res.status(400).json({ error: 'Position must be 1–4.' });
  db.prepare('INSERT INTO group_finishes (team, position) VALUES (?, ?) ON CONFLICT(team) DO UPDATE SET position=excluded.position').run(team, position);
  res.json({ ok: true, message: `${team} set to position ${position}.` });
});

app.get('/api/admin/group-finish', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT team, position FROM group_finishes ORDER BY team ASC').all());
});

// ── Admin: Participants with tiebreaks ────────────────────────────────────────
app.get('/api/admin/participants', requireAdmin, (_req, res) => {
  res.json(db.prepare(`
    SELECT name, email, known_by, club_team, country_team, (1 + extra_entries) AS total_entries,
           (1 + extra_entries) * 5 AS amount_due,
           tiebreak_guess, created_at
    FROM participants ORDER BY created_at ASC
  `).all());
});

// ── Admin: Export all entries as CSV (Excel-ready) ────────────────────────────
app.get('/api/admin/export/entries', requireAdmin, (_req, res) => {
  const participants = db.prepare(`
    SELECT id, name, email, known_by, club_team, country_team, tiebreak_guess
    FROM participants ORDER BY name ASC
  `).all();
  const getEntries = db.prepare('SELECT * FROM entries WHERE participant_id = ? ORDER BY entry_index ASC');
  const allStats   = computeTeamStats(null);
  const tPts       = t => { const s = allStats[t]; if (!s) return 0; return teamPoints(s); };

  const cols = [
    'Entry Name','Email','Known As','Club Team','Country Team',
    'Pot 1 Team','Pot 1 Pts',
    'Pot 2 Team 1','Pot 2 Team 1 Pts',
    'Pot 2 Team 2','Pot 2 Team 2 Pts',
    'Pot 3 Team 1','Pot 3 Team 1 Pts',
    'Pot 3 Team 2','Pot 3 Team 2 Pts',
    'Pot 3 Team 3','Pot 3 Team 3 Pts',
    'Total Points','Goals Predicted'
  ];

  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;

  const lines = [cols.map(q).join(',')];

  for (const p of participants) {
    const entries = getEntries.all(p.id);
    for (const e of entries) {
      const teams = [
        e.pot1_team, e.pot2_team, e.pot2_team_2,
        e.pot3_team, e.pot3_team_2, e.pot3_team_3,
      ];
      const totalPts = teams.reduce((sum, t) => sum + (t ? tPts(t) : 0), 0);
      lines.push([
        p.name, p.email, p.known_by || '', p.club_team || '', p.country_team || '',
        e.pot1_team   || '', e.pot1_team   ? tPts(e.pot1_team)   : '',
        e.pot2_team   || '', e.pot2_team   ? tPts(e.pot2_team)   : '',
        e.pot2_team_2 || '', e.pot2_team_2 ? tPts(e.pot2_team_2) : '',
        e.pot3_team   || '', e.pot3_team   ? tPts(e.pot3_team)   : '',
        e.pot3_team_2 || '', e.pot3_team_2 ? tPts(e.pot3_team_2) : '',
        e.pot3_team_3 || '', e.pot3_team_3 ? tPts(e.pot3_team_3) : '',
        totalPts,
        p.tiebreak_guess ?? '',
      ].map(q).join(','));
    }
  }

  const csv      = '﻿' + lines.join('\r\n'); // BOM for Excel UTF-8
  const filename = `isweep-entries-${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── Admin: Update participant details ─────────────────────────────────────────
app.patch('/api/admin/participants/:name', requireAdmin, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { knownBy, clubTeam, countryTeam } = req.body;
  const p = db.prepare('SELECT id FROM participants WHERE name = ?').get(name);
  if (!p) return res.status(404).json({ error: `No participant found with name "${name}".` });
  db.prepare('UPDATE participants SET known_by=?, club_team=?, country_team=? WHERE id=?')
    .run(knownBy || null, clubTeam || null, countryTeam || null, p.id);
  res.json({ ok: true, message: `Updated "${name}".` });
});

// ── Admin: Delete a single participant and all their entries ─────────────────
app.delete('/api/admin/participants/:name', requireAdmin, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const p = db.prepare('SELECT id FROM participants WHERE name = ?').get(name);
  if (!p) return res.status(404).json({ error: `No participant found with name "${name}".` });
  db.prepare('DELETE FROM entries WHERE participant_id = ?').run(p.id);
  db.prepare('DELETE FROM participants WHERE id = ?').run(p.id);
  res.json({ ok: true, message: `Deleted "${name}" and all their entries.` });
});

// ── Admin: Send email (via Resend.com REST API) ───────────────────────────────
// Requires env var: RESEND_API_KEY  (get a free key at resend.com)
// Optional:        RESEND_FROM      e.g. "iSweep <noreply@yourdomain.com>"
//                                   defaults to onboarding@resend.dev (test only)
app.post('/api/admin/send-email', requireAdmin, async (req, res) => {
  const { template = '1day-to-go', mode = 'test', to } = req.body;

  // Load email template from disk
  const templatePath = path.join(__dirname, 'emails', `${template}.html`);
  if (!fs.existsSync(templatePath)) {
    return res.status(404).json({ error: `Email template "${template}.html" not found.` });
  }
  const html = fs.readFileSync(templatePath, 'utf8');

  // Check Resend API key
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not set. Add it in Railway Variables (get a free key at resend.com).' });
  }

  const from    = process.env.RESEND_FROM || 'iSweep <onboarding@resend.dev>';
  const subject = '⚽ iSweep — 1 Day To Go! The World Cup Kicks Off Tomorrow!';

  // Determine recipient list
  let recipients;
  if (mode === 'test') {
    const testAddr = to || process.env.EMAIL_TEST_TO || 'isweepapp@gmail.com';
    recipients = [{ email: testAddr }];
  } else {
    recipients = db.prepare(
      'SELECT DISTINCT email FROM participants WHERE email IS NOT NULL AND email != "" ORDER BY email'
    ).all();
  }

  if (!recipients.length) {
    return res.status(400).json({ error: 'No recipients found.' });
  }

  // Send via Resend REST API (Node 22 built-in fetch)
  const sendOne = async (email) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [email], subject, html }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body.message || JSON.stringify(body));
    return body;
  };

  const results = { sent: [], failed: [] };
  for (const r of recipients) {
    try {
      await sendOne(r.email);
      results.sent.push(r.email);
      console.log(`[Email] Sent to ${r.email}`);
    } catch (err) {
      results.failed.push({ email: r.email, error: err.message });
      console.error(`[Email] Failed for ${r.email}: ${err.message}`);
    }
  }

  res.json({
    ok: results.failed.length === 0,
    sent: results.sent.length,
    failed: results.failed.length,
    details: results,
  });
});

// ── Admin: Clear all entries ──────────────────────────────────────────────────
app.post('/api/admin/clear-entries', requireAdmin, (_req, res) => {
  runTransaction(() => {
    db.prepare('DELETE FROM entries').run();
    db.prepare('DELETE FROM participants').run();
  });
  console.log('[Admin] All entries and participants cleared.');
  res.json({ ok: true, message: 'All entries and participants have been deleted.' });
});

// ── Admin: Money owed by email ────────────────────────────────────────────────
app.get('/api/admin/money', requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT email,
           MAX(known_by)                        AS known_by,
           SUM(1 + extra_entries)               AS total_draws,
           SUM((1 + extra_entries) * 5)         AS total_due,
           MAX(paid)                            AS paid
    FROM participants
    GROUP BY email
    ORDER BY MIN(created_at) ASC
  `).all();
  const getTeams = db.prepare(
    'SELECT name FROM participants WHERE email = ? ORDER BY is_primary DESC, created_at ASC'
  );
  res.json(rows.map(r => ({
    email:       r.email,
    known_by:    r.known_by || null,
    teams:       getTeams.all(r.email).map(t => t.name),
    total_draws: r.total_draws,
    total_due:   r.total_due,
    paid:        r.paid === 1,
  })));
});

// ── Admin: Mark email as paid / unpaid ────────────────────────────────────────
app.post('/api/admin/money/paid', requireAdmin, (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const paid  = req.body.paid ? 1 : 0;
  if (!email) return res.status(400).json({ error: 'Email required.' });
  db.prepare('UPDATE participants SET paid = ? WHERE email = ?').run(paid, email);
  res.json({ ok: true });
});

// ── Public: All matches (with fire-and-forget background sync) ────────────────
let _lastAutoSync = 0;

app.get('/api/matches', (_req, res) => {
  // Always respond immediately with cached DB data
  res.json(db.prepare('SELECT id, date, team_a, team_b, score_a, score_b, goals_a, goals_b, stage FROM matches ORDER BY date, id').all());

  // Background sync — silently skipped if no API key or last sync was <3 min ago
  if (!process.env.FOOTBALL_DATA_API_KEY) return;
  const now = Date.now();
  if (now - _lastAutoSync < 3 * 60 * 1000) return;
  _lastAutoSync = now;

  (async () => {
    try {
      const { matches } = await ftdbGet('/v4/competitions/WC/matches');
      const upsert = db.prepare(`
        INSERT INTO matches (id, date, team_a, team_b, score_a, score_b, goals_a, goals_b,
                             yellows_a, yellows_b, reds_a, reds_b, stage)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          date=excluded.date, team_a=excluded.team_a, team_b=excluded.team_b,
          score_a=excluded.score_a, score_b=excluded.score_b,
          goals_a=excluded.goals_a, goals_b=excluded.goals_b,
          stage=excluded.stage
      `);
      let synced = 0;
      runTransaction(() => {
        for (const m of matches) {
          if (!m.homeTeam?.name || !m.awayTeam?.name) continue;
          const stageMapper = FTDB_STAGE_MAP[m.stage];
          const stage = stageMapper ? stageMapper(m) : (m.stage || 'Unknown');
          const teamA = normFtdbTeam(m.homeTeam.name);
          const teamB = normFtdbTeam(m.awayTeam.name);
          const fin = m.status === 'FINISHED';
          const sa  = fin ? (m.score?.fullTime?.home ?? null) : null;
          const sb  = fin ? (m.score?.fullTime?.away ?? null) : null;
          upsert.run(String(m.id), m.utcDate, teamA, teamB, sa, sb, sa, sb,
                     null, null, null, null, stage);
          synced++;
        }
      });
      // Also sync group standings (best-effort)
      try {
        const { standings } = await ftdbGet('/v4/competitions/WC/standings');
        const gfUp = db.prepare('INSERT INTO group_finishes (team, position) VALUES (?, ?) ON CONFLICT(team) DO UPDATE SET position=excluded.position');
        runTransaction(() => {
          for (const group of (standings || [])) {
            if (group.type !== 'TOTAL') continue;
            for (const row of (group.table || [])) {
              if (row.position >= 1 && row.position <= 4)
                gfUp.run(normFtdbTeam(row.team.name), row.position);
            }
          }
        });
      } catch (_) { /* standings not yet available */ }
      cleanupSeededMatches();
      console.log(`[AutoSync] ${synced} matches updated from football-data.org`);
    } catch (e) {
      console.warn(`[AutoSync] Failed: ${e.message}`);
    }
  })();
});

// ── Admin: All matches (full detail) ─────────────────────────────────────────
app.get('/api/admin/matches', requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM matches ORDER BY date, id').all());
});

// ── Admin: Update match result ────────────────────────────────────────────────
app.post('/api/admin/match/:id', requireAdmin, (req, res) => {
  const match = db.prepare('SELECT id FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found.' });
  const toInt = v => (v === '' || v == null) ? null : (isNaN(parseInt(v, 10)) ? null : parseInt(v, 10));
  const { score_a, score_b, goals_a, goals_b, yellows_a, yellows_b, reds_a, reds_b } = req.body;
  db.prepare('UPDATE matches SET score_a=?,score_b=?,goals_a=?,goals_b=?,yellows_a=?,yellows_b=?,reds_a=?,reds_b=? WHERE id=?')
    .run(toInt(score_a), toInt(score_b), toInt(goals_a), toInt(goals_b), toInt(yellows_a), toInt(yellows_b), toInt(reds_a), toInt(reds_b), match.id);
  res.json({ ok: true, message: `Result saved: ${toInt(score_a) ?? '?'} – ${toInt(score_b) ?? '?'}` });
});

// ── Admin: Live sync from football-data.org ───────────────────────────────────
const FTDB_STAGE_MAP = {
  GROUP_STAGE:    m => `Group ${(m.group || '').replace('GROUP_', '')}`,
  ROUND_OF_32:   () => 'Round of 32',
  ROUND_OF_16:   () => 'Round of 16',
  QUARTER_FINALS:() => 'Quarter-final',
  SEMI_FINALS:   () => 'Semi-final',
  THIRD_PLACE:   () => 'Third Place',
  FINAL:         () => 'Final',
};

// Map football-data.org team names → names used in seedTeams.sql
const FTDB_NAME_MAP = {
  'Korea Republic':     'South Korea',
  'IR Iran':            'Iran',
  "Côte d'Ivoire":      'Ivory Coast',
  'Bosnia-Herzegovina': 'Bosnia & Herzegovina',
  'Cape Verde Islands': 'Cape Verde',
  'Turkey':             'Türkiye',
  'Congo DR':           'DR Congo',
};

function normFtdbTeam(n) { return FTDB_NAME_MAP[n] || n; }

async function ftdbGet(path) {
  const r = await fetch(`https://api.football-data.org${path}`, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY || '' },
  });
  if (!r.ok) throw new Error(`football-data.org ${r.status}: ${await r.text()}`);
  return r.json();
}

// Quick sync — 2 API calls: all fixtures/scores + group standings
app.post('/api/admin/sync', requireAdmin, async (req, res) => {
  if (!process.env.FOOTBALL_DATA_API_KEY)
    return res.status(400).json({ error: 'FOOTBALL_DATA_API_KEY env var not set. Get a free key at football-data.org' });

  try {
    const { matches } = await ftdbGet('/v4/competitions/WC/matches');

    // Upsert scores; deliberately leave yellows/reds untouched for existing rows
    const upsert = db.prepare(`
      INSERT INTO matches (id, date, team_a, team_b, score_a, score_b, goals_a, goals_b,
                           yellows_a, yellows_b, reds_a, reds_b, stage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date=excluded.date, team_a=excluded.team_a, team_b=excluded.team_b,
        score_a=excluded.score_a, score_b=excluded.score_b,
        goals_a=excluded.goals_a, goals_b=excluded.goals_b,
        stage=excluded.stage
    `);

    let synced = 0, skipped = 0;
    const unmapped = new Set();
    runTransaction(() => {
      for (const m of matches) {
        // Skip fixtures where teams aren't determined yet (knockout TBDs)
        if (!m.homeTeam?.name || !m.awayTeam?.name) { skipped++; continue; }
        const stageMapper = FTDB_STAGE_MAP[m.stage];
        const stage = stageMapper ? stageMapper(m) : (m.stage || 'Unknown');
        const teamA = normFtdbTeam(m.homeTeam.name);
        const teamB = normFtdbTeam(m.awayTeam.name);
        if (!db.prepare('SELECT 1 FROM teams WHERE name=?').get(teamA)) unmapped.add(m.homeTeam.name);
        if (!db.prepare('SELECT 1 FROM teams WHERE name=?').get(teamB)) unmapped.add(m.awayTeam.name);
        const fin = m.status === 'FINISHED';
        const sa  = fin ? (m.score?.fullTime?.home ?? null) : null;
        const sb  = fin ? (m.score?.fullTime?.away ?? null) : null;
        upsert.run(String(m.id), m.utcDate, teamA, teamB, sa, sb, sa, sb,
                   null, null, null, null, stage);
        synced++;
      }
    });

    // Sync group standings → group_finishes (best-effort; only available after group stage)
    let standingsSynced = 0;
    try {
      const { standings } = await ftdbGet('/v4/competitions/WC/standings');
      const gfUp = db.prepare('INSERT INTO group_finishes (team, position) VALUES (?, ?) ON CONFLICT(team) DO UPDATE SET position=excluded.position');
      runTransaction(() => {
        for (const group of (standings || [])) {
          if (group.type !== 'TOTAL') continue;
          for (const row of (group.table || [])) {
            if (row.position >= 1 && row.position <= 4) {
              gfUp.run(normFtdbTeam(row.team.name), row.position);
              standingsSynced++;
            }
          }
        }
      });
    } catch (_) { /* standings not yet available — fine */ }

    cleanupSeededMatches();

    const unmappedArr = [...unmapped];
    res.json({
      ok: true,
      message: `${synced} fixtures synced${skipped ? ` (${skipped} TBD knockout matches skipped)` : ''}${standingsSynced ? `, ${standingsSynced} group positions updated` : ''}.${unmappedArr.length ? ` Unmapped names (add to alias list): ${unmappedArr.join(', ')}` : ''}`,
      synced, skipped, standingsSynced, unmapped: unmappedArr,
    });
  } catch (e) {
    res.status(500).json({ error: `Sync failed: ${e.message}` });
  }
});

// Card sync — SSE stream: fetches yellow/red card counts from individual match endpoints
// Rate-limited to free tier (10 req/min → 6.5 s between calls)
app.get('/api/admin/sync-cards', requireAdmin, async (req, res) => {
  if (!process.env.FOOTBALL_DATA_API_KEY) {
    res.status(400).json({ error: 'FOOTBALL_DATA_API_KEY not set.' }); return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = d => res.write(`data: ${JSON.stringify(d)}\n\n`);

  const toSync = db.prepare(
    'SELECT id FROM matches WHERE score_a IS NOT NULL AND (yellows_a IS NULL OR reds_a IS NULL)'
  ).all();

  if (!toSync.length) {
    send({ type: 'done', message: 'All finished matches already have card data.' });
    res.end(); return;
  }

  send({ type: 'start', total: toSync.length });

  const updCards = db.prepare(
    'UPDATE matches SET yellows_a=?, yellows_b=?, reds_a=?, reds_b=? WHERE id=?'
  );
  let processed = 0, errors = 0;

  for (const { id } of toSync) {
    await new Promise(r => setTimeout(r, 6500));
    try {
      const data     = await ftdbGet(`/v4/matches/${id}`);
      const bookings = data.bookings || [];
      const homeId   = data.homeTeam?.id;
      let ya=0, yb=0, ra=0, rb=0;
      for (const b of bookings) {
        const home = b.team?.id === homeId;
        if (b.card === 'YELLOW_CARD')                              { home ? ya++ : yb++; }
        if (b.card === 'RED_CARD' || b.card === 'YELLOW_RED_CARD') { home ? ra++ : rb++; }
      }
      updCards.run(ya, yb, ra, rb, id);
      processed++;
      send({ type: 'progress', processed, total: toSync.length });
    } catch (e) {
      errors++;
      send({ type: 'error', matchId: id, message: e.message });
    }
  }

  send({ type: 'done', processed, errors,
    message: `Card sync complete: ${processed} updated${errors ? `, ${errors} errors` : ''}.` });
  res.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
// Pick n distinct random items from arr
// ── Auto-draw: assign teams to a single entry immediately on submission ────────
function drawSingleEntry(entryId) {
  const pot1 = db.prepare('SELECT name FROM teams WHERE pot = 1 ORDER BY name').all().map(r => r.name);
  const pot2 = db.prepare('SELECT name FROM teams WHERE pot = 2 ORDER BY name').all().map(r => r.name);
  const pot3 = db.prepare('SELECT name FROM teams WHERE pot = 3 ORDER BY name').all().map(r => r.name);

  if (!pot1.length || pot2.length < 2 || pot3.length < 3) {
    console.log('[Auto-draw] Pots not ready — entry will be assigned when draw is run manually.');
    return false;
  }

  const usedCombos = new Set(
    db.prepare(`SELECT pot1_team, pot2_team, pot2_team_2, pot3_team, pot3_team_2, pot3_team_3
                FROM entries WHERE pot1_team IS NOT NULL AND pot2_team IS NOT NULL AND pot2_team_2 IS NOT NULL
                  AND pot3_team IS NOT NULL AND pot3_team_2 IS NOT NULL AND pot3_team_3 IS NOT NULL`)
      .all().map(e => comboKey(e.pot1_team, e.pot2_team, e.pot2_team_2, e.pot3_team, e.pot3_team_2, e.pot3_team_3))
  );

  let found = null;
  for (let t = 0; t < MAX_TRIES; t++) {
    const [p1]            = pickRandom(pot1, 1);
    const [p2a, p2b]      = pickRandom(pot2, 2);
    const [p3a, p3b, p3c] = pickRandom(pot3, 3);
    const key = comboKey(p1, p2a, p2b, p3a, p3b, p3c);
    if (!usedCombos.has(key)) { found = { p1, p2a, p2b, p3a, p3b, p3c }; break; }
  }

  if (!found) {
    console.log('[Auto-draw] All combinations exhausted — entry left unassigned.');
    return false;
  }

  db.prepare('UPDATE entries SET pot1_team=?, pot2_team=?, pot2_team_2=?, pot3_team=?, pot3_team_2=?, pot3_team_3=? WHERE id=?')
    .run(found.p1, found.p2a, found.p2b, found.p3a, found.p3b, found.p3c, entryId);
  console.log(`[Auto-draw] Entry ${entryId}: ${found.p1} | ${found.p2a}, ${found.p2b} | ${found.p3a}, ${found.p3b}, ${found.p3c}`);
  return true;
}

function pickRandom(arr, n) {
  const pool = arr.slice();
  const out  = [];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// Unique key for a set of teams (order-independent)
function comboKey(...teams) { return [...teams].sort().join('|||'); }

const FINISH_BONUS = { 1: 4, 2: 3, 3: 2, 4: 1 };

// stageFilter: 'group' = group-stage only · 'knockout' = knockout only · falsy = all
function computeTeamStats(stageFilter) {
  const stats = {};
  const ensure = t => { if (t && !stats[t]) stats[t] = { played:0, wins:0, draws:0, losses:0, goalsFor:0, goalsAgainst:0, yellowCards:0, redCards:0, groupBonus:0 }; };

  // Fetch all finished matches then filter in JS — avoids LIKE in prepared statement
  const allMatches = db.prepare('SELECT * FROM matches WHERE score_a IS NOT NULL AND score_b IS NOT NULL').all();
  const isGroup    = s => typeof s === 'string' && s.startsWith('Group ');
  const matches    = stageFilter === 'group'    ? allMatches.filter(m =>  isGroup(m.stage))
                   : stageFilter === 'knockout' ? allMatches.filter(m => !isGroup(m.stage))
                   : allMatches;

  for (const m of matches) {
    ensure(m.team_a); ensure(m.team_b);
    const ga = m.goals_a||0, gb = m.goals_b||0, ya = m.yellows_a||0, yb = m.yellows_b||0, ra = m.reds_a||0, rb = m.reds_b||0;
    if (m.team_a) { const s = stats[m.team_a]; s.played++; s.goalsFor+=ga; s.goalsAgainst+=gb; s.yellowCards+=ya; s.redCards+=ra; if (m.score_a>m.score_b) s.wins++; else if (m.score_a<m.score_b) s.losses++; else s.draws++; }
    if (m.team_b) { const s = stats[m.team_b]; s.played++; s.goalsFor+=gb; s.goalsAgainst+=ga; s.yellowCards+=yb; s.redCards+=rb; if (m.score_b>m.score_a) s.wins++; else if (m.score_b<m.score_a) s.losses++; else s.draws++; }
  }
  // Group finish bonus applies to group-stage and overall leaderboards, not knockout.
  // Only award once ALL matches in that team's group are complete.
  if (stageFilter !== 'knockout') {
    // Find which groups have every match scored
    const groupCompletion = db.prepare(
      `SELECT stage,
              COUNT(*) AS total,
              SUM(CASE WHEN score_a IS NOT NULL AND score_b IS NOT NULL THEN 1 ELSE 0 END) AS done
       FROM matches WHERE stage LIKE 'Group %' GROUP BY stage`
    ).all();
    const completeGroups = new Set(
      groupCompletion.filter(g => g.total > 0 && g.total === g.done).map(g => g.stage)
    );
    // Map each team to its group
    const teamGroup = {};
    for (const m of db.prepare("SELECT DISTINCT team_a, team_b, stage FROM matches WHERE stage LIKE 'Group %'").all()) {
      teamGroup[m.team_a] = m.stage;
      teamGroup[m.team_b] = m.stage;
    }
    for (const f of db.prepare('SELECT * FROM group_finishes').all()) {
      ensure(f.team);
      if (completeGroups.has(teamGroup[f.team])) {
        stats[f.team].groupBonus = FINISH_BONUS[f.position] || 0;
      }
    }
  }
  return stats;
}

function teamPoints(s) {
  return s.wins * 3 + s.draws + s.goalsFor * 2 - s.goalsAgainst - s.yellowCards - s.redCards * 3 + s.groupBonus;
}

function computeTeamScores() {
  const all = computeTeamStats(), r = {};
  for (const [t, s] of Object.entries(all)) r[t] = teamPoints(s);
  return r;
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  World Cup 2026 Sweepstake — http://localhost:${PORT}\n`);
  if (!ADMIN_PASSWORD_HASH) console.warn('  WARNING: ADMIN_PASSWORD not set — admin panel disabled.\n');
});

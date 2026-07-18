-- iSweep World Cup 2026 — Database Schema

CREATE TABLE IF NOT EXISTS teams (
  pot  INTEGER NOT NULL,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS matches (
  id        TEXT PRIMARY KEY,
  date      TEXT,
  team_a    TEXT,
  team_b    TEXT,
  score_a   INTEGER,
  score_b   INTEGER,
  goals_a   INTEGER,
  goals_b   INTEGER,
  yellows_a INTEGER,
  yellows_b INTEGER,
  reds_a    INTEGER,
  reds_b    INTEGER,
  stage     TEXT
);

CREATE TABLE IF NOT EXISTS participants (
  id             TEXT    PRIMARY KEY,
  name           TEXT    NOT NULL,
  email          TEXT    NOT NULL,
  is_primary     INTEGER NOT NULL DEFAULT 1,
  extra_entries  INTEGER NOT NULL DEFAULT 0,
  tiebreak_guess INTEGER NULL,
  known_by       TEXT    NULL,
  club_team      TEXT    NULL,
  country_team   TEXT    NULL,
  paid           INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL,
  UNIQUE(email, name)
);

CREATE TABLE IF NOT EXISTS entries (
  id             TEXT    PRIMARY KEY,
  participant_id TEXT    NOT NULL REFERENCES participants(id),
  entry_index    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL,
  pot1_team      TEXT    NULL,
  pot2_team      TEXT    NULL,
  pot2_team_2    TEXT    NULL,
  pot3_team      TEXT    NULL,
  pot3_team_2    TEXT    NULL,
  pot3_team_3    TEXT    NULL
);

CREATE TABLE IF NOT EXISTS group_finishes (
  team     TEXT    PRIMARY KEY,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- iSweep Golf Sweepstake — shared, live-updating golf competition
CREATE TABLE IF NOT EXISTS golf_players (
  idx       INTEGER PRIMARY KEY,
  name      TEXT    NOT NULL,
  handicap  INTEGER NOT NULL DEFAULT 18
);

CREATE TABLE IF NOT EXISTS golf_course (
  hole_number  INTEGER PRIMARY KEY,
  par          INTEGER NOT NULL DEFAULT 4,
  stroke_index INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS golf_group (
  match_idx INTEGER PRIMARY KEY,
  hshots INTEGER,
  ashots INTEGER,
  hf INTEGER NOT NULL DEFAULT 0,
  hg INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL DEFAULT 0,
  af INTEGER NOT NULL DEFAULT 0,
  ag INTEGER NOT NULL DEFAULT 0,
  ap INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS golf_knockout (
  stage    TEXT    NOT NULL,
  hole_idx INTEGER NOT NULL,
  ashots INTEGER,
  bshots INTEGER,
  af INTEGER NOT NULL DEFAULT 0,
  ag INTEGER NOT NULL DEFAULT 0,
  ap INTEGER NOT NULL DEFAULT 0,
  bf INTEGER NOT NULL DEFAULT 0,
  bg INTEGER NOT NULL DEFAULT 0,
  bp INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (stage, hole_idx)
);

-- Saved course presets — par/stroke-index layouts you can name, save, and reload later
CREATE TABLE IF NOT EXISTS golf_saved_courses (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  holes_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Personal scorecard: each player enters their own gross shots for every hole
-- they play (1–18), independent of the group/knockout bracket. This is what
-- the group stage, semis and final results are calculated from — a player who
-- is out of the knockout bracket can still carry on entering their round.
CREATE TABLE IF NOT EXISTS golf_scores (
  player_idx      INTEGER NOT NULL,
  hole_number     INTEGER NOT NULL,
  shots           INTEGER,
  fairway         INTEGER NOT NULL DEFAULT 0,
  gir             INTEGER NOT NULL DEFAULT 0,
  one_putt        INTEGER NOT NULL DEFAULT 0,
  putting_points  INTEGER NOT NULL DEFAULT 0,
  lost_balls      INTEGER NOT NULL DEFAULT 0,
  bi              INTEGER NOT NULL DEFAULT 0,
  ba              INTEGER NOT NULL DEFAULT 0,
  bo              INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_idx, hole_number)
);

-- Side competition draw: two random 6-hole groups picked live from the 18
-- holes (Front Six, then Middlesex from what's left); Back 6 is just whatever
-- remains, so it never needs its own draw. A single row, always id=1.
CREATE TABLE IF NOT EXISTS golf_side_draw (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  front_six     TEXT,
  middlesex_six TEXT
);

-- Round settings: stake per player, and which competitions are being played
-- this round (Football = the Table/Semis/Final bracket, 666 = Front
-- Six/Middlesex/Back Six, PP = Putting Points). Single row, always id=1.
CREATE TABLE IF NOT EXISTS golf_settings (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  stake   REAL NOT NULL DEFAULT 0,
  formats TEXT NOT NULL DEFAULT '{"football":false,"six66":false,"pp":false}',
  course_name TEXT NOT NULL DEFAULT 'Custom Course',
  plus_minus_stake REAL NOT NULL DEFAULT 0
);

-- Trophy Cabinet: a running honours list per named competition. One row per
-- winner entry (a competition can have many rows across different years).
CREATE TABLE IF NOT EXISTS golf_trophies (
  id          TEXT PRIMARY KEY,
  competition TEXT NOT NULL,
  year        TEXT NOT NULL,
  winner      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

-- Known regular players (Gavin, Scum, Kemble, Swanko): their own saved
-- handicap, which auto-applies whenever their name is entered on the Format
-- tab. This survives "Delete all golf data" — it's a personal setting, not
-- round data.
CREATE TABLE IF NOT EXISTS golf_known_players (
  name     TEXT PRIMARY KEY,
  handicap INTEGER NOT NULL DEFAULT 18
);

-- Round history: a snapshot of a known player's round, archived automatically
-- just before "Delete all golf data" wipes the live scorecards. Never cleared
-- by the reset itself — this is the permanent record rounds build up into.
CREATE TABLE IF NOT EXISTS golf_round_history (
  id                    TEXT PRIMARY KEY,
  player_name           TEXT NOT NULL,
  played_on             TEXT NOT NULL,
  course_name           TEXT,
  total_shots           INTEGER,
  total_stableford      INTEGER,
  total_putting_points  INTEGER,
  total_lost_balls      INTEGER,
  holes_json            TEXT,
  created_at            TEXT NOT NULL
);

-- Ryder Cup 4 Ball SF: 4 named players, split into rotating 2-player teams
-- every 6 holes. player_idxs is the 4 chosen player slots (0-7). Each
-- set*_team_a stores the 2 player idxs forming "Team A" for that 6-hole set
-- (the other 2 of the 4 are automatically "Team B"). Set 3 is always
-- whichever pairing wasn't used in sets 1 or 2.
CREATE TABLE IF NOT EXISTS golf_ryder_cup (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  player_idxs  TEXT,
  set1_team_a  TEXT,
  set2_team_a  TEXT,
  set3_team_a  TEXT
);

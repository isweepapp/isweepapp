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

-- World Cup 2026 Group Stage Fixtures
-- Matchday 1 dates from ESPN; Matchday 2 & 3 approximate (update via CSV import if needed)
-- Team names must match teams table exactly

-- ── Group A: Mexico · South Africa · South Korea · Czechia ────────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('ga-1a', 'Mexico',       'South Africa', '2026-06-11', 'Group A'),
  ('ga-1b', 'South Korea',  'Czechia',      '2026-06-11', 'Group A'),
  ('ga-2a', 'Mexico',       'South Korea',  '2026-06-18', 'Group A'),
  ('ga-2b', 'South Africa', 'Czechia',      '2026-06-18', 'Group A'),
  ('ga-3a', 'Mexico',       'Czechia',      '2026-06-25', 'Group A'),
  ('ga-3b', 'South Africa', 'South Korea',  '2026-06-25', 'Group A');

-- ── Group B: Canada · Bosnia & Herzegovina · Qatar · Switzerland ───────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('gb-1a', 'Canada',               'Bosnia & Herzegovina', '2026-06-12', 'Group B'),
  ('gb-1b', 'Qatar',                'Switzerland',          '2026-06-13', 'Group B'),
  ('gb-2a', 'Canada',               'Qatar',                '2026-06-19', 'Group B'),
  ('gb-2b', 'Bosnia & Herzegovina', 'Switzerland',          '2026-06-19', 'Group B'),
  ('gb-3a', 'Canada',               'Switzerland',          '2026-06-26', 'Group B'),
  ('gb-3b', 'Bosnia & Herzegovina', 'Qatar',                '2026-06-26', 'Group B');

-- ── Group C: Brazil · Morocco · Haiti · Scotland ──────────────────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('gc-1a', 'Brazil',  'Morocco', '2026-06-13', 'Group C'),
  ('gc-1b', 'Haiti',   'Scotland','2026-06-13', 'Group C'),
  ('gc-2a', 'Brazil',  'Haiti',   '2026-06-19', 'Group C'),
  ('gc-2b', 'Morocco', 'Scotland','2026-06-19', 'Group C'),
  ('gc-3a', 'Brazil',  'Scotland','2026-06-26', 'Group C'),
  ('gc-3b', 'Morocco', 'Haiti',   '2026-06-26', 'Group C');

-- ── Group D: United States · Paraguay · Australia · Türkiye ──────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('gd-1a', 'United States', 'Paraguay',  '2026-06-12', 'Group D'),
  ('gd-1b', 'Australia',     'Türkiye',   '2026-06-14', 'Group D'),
  ('gd-2a', 'United States', 'Australia', '2026-06-20', 'Group D'),
  ('gd-2b', 'Paraguay',      'Türkiye',   '2026-06-20', 'Group D'),
  ('gd-3a', 'United States', 'Türkiye',   '2026-06-27', 'Group D'),
  ('gd-3b', 'Paraguay',      'Australia', '2026-06-27', 'Group D');

-- ── Group E: Germany · Curaçao · Ivory Coast · Ecuador ───────────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('ge-1a', 'Germany',     'Curaçao',      '2026-06-14', 'Group E'),
  ('ge-1b', 'Ivory Coast', 'Ecuador',      '2026-06-14', 'Group E'),
  ('ge-2a', 'Germany',     'Ivory Coast',  '2026-06-21', 'Group E'),
  ('ge-2b', 'Curaçao',     'Ecuador',      '2026-06-21', 'Group E'),
  ('ge-3a', 'Germany',     'Ecuador',      '2026-06-28', 'Group E'),
  ('ge-3b', 'Curaçao',     'Ivory Coast',  '2026-06-28', 'Group E');

-- ── Group F: Netherlands · Japan · Sweden · Tunisia ──────────────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('gf-1a', 'Netherlands', 'Japan',   '2026-06-14', 'Group F'),
  ('gf-1b', 'Sweden',      'Tunisia', '2026-06-14', 'Group F'),
  ('gf-2a', 'Netherlands', 'Sweden',  '2026-06-21', 'Group F'),
  ('gf-2b', 'Japan',       'Tunisia', '2026-06-21', 'Group F'),
  ('gf-3a', 'Netherlands', 'Tunisia', '2026-06-28', 'Group F'),
  ('gf-3b', 'Japan',       'Sweden',  '2026-06-28', 'Group F');

-- ── Group G: Belgium · Egypt · Iran · New Zealand ────────────────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('gg-1a', 'Belgium', 'Egypt',       '2026-06-15', 'Group G'),
  ('gg-1b', 'Iran',    'New Zealand', '2026-06-15', 'Group G'),
  ('gg-2a', 'Belgium', 'Iran',        '2026-06-22', 'Group G'),
  ('gg-2b', 'Egypt',   'New Zealand', '2026-06-22', 'Group G'),
  ('gg-3a', 'Belgium', 'New Zealand', '2026-06-29', 'Group G'),
  ('gg-3b', 'Egypt',   'Iran',        '2026-06-29', 'Group G');

-- ── Group H: Spain · Cape Verde · Saudi Arabia · Uruguay ─────────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('gh-1a', 'Spain',      'Cape Verde',   '2026-06-15', 'Group H'),
  ('gh-1b', 'Saudi Arabia','Uruguay',     '2026-06-15', 'Group H'),
  ('gh-2a', 'Spain',      'Saudi Arabia', '2026-06-22', 'Group H'),
  ('gh-2b', 'Cape Verde', 'Uruguay',      '2026-06-22', 'Group H'),
  ('gh-3a', 'Spain',      'Uruguay',      '2026-06-29', 'Group H'),
  ('gh-3b', 'Cape Verde', 'Saudi Arabia', '2026-06-29', 'Group H');

-- ── Group I: France · Senegal · Iraq · Norway ────────────────────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('gi-1a', 'France',  'Senegal', '2026-06-16', 'Group I'),
  ('gi-1b', 'Iraq',    'Norway',  '2026-06-16', 'Group I'),
  ('gi-2a', 'France',  'Iraq',    '2026-06-23', 'Group I'),
  ('gi-2b', 'Senegal', 'Norway',  '2026-06-23', 'Group I'),
  ('gi-3a', 'France',  'Norway',  '2026-06-30', 'Group I'),
  ('gi-3b', 'Senegal', 'Iraq',    '2026-06-30', 'Group I');

-- ── Group J: Argentina · Algeria · Austria · Jordan ──────────────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('gj-1a', 'Argentina', 'Algeria', '2026-06-16', 'Group J'),
  ('gj-1b', 'Austria',   'Jordan',  '2026-06-17', 'Group J'),
  ('gj-2a', 'Argentina', 'Austria', '2026-06-23', 'Group J'),
  ('gj-2b', 'Algeria',   'Jordan',  '2026-06-23', 'Group J'),
  ('gj-3a', 'Argentina', 'Jordan',  '2026-06-30', 'Group J'),
  ('gj-3b', 'Algeria',   'Austria', '2026-06-30', 'Group J');

-- ── Group K: Portugal · DR Congo · Uzbekistan · Colombia ─────────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('gk-1a', 'Portugal',   'DR Congo',   '2026-06-17', 'Group K'),
  ('gk-1b', 'Uzbekistan', 'Colombia',   '2026-06-17', 'Group K'),
  ('gk-2a', 'Portugal',   'Uzbekistan', '2026-06-24', 'Group K'),
  ('gk-2b', 'DR Congo',   'Colombia',   '2026-06-24', 'Group K'),
  ('gk-3a', 'Portugal',   'Colombia',   '2026-07-01', 'Group K'),
  ('gk-3b', 'DR Congo',   'Uzbekistan', '2026-07-01', 'Group K');

-- ── Group L: England · Croatia · Ghana · Panama ───────────────────────────────
INSERT OR IGNORE INTO matches (id, team_a, team_b, date, stage) VALUES
  ('gl-1a', 'England', 'Croatia', '2026-06-17', 'Group L'),
  ('gl-1b', 'Ghana',   'Panama',  '2026-06-17', 'Group L'),
  ('gl-2a', 'England', 'Ghana',   '2026-06-24', 'Group L'),
  ('gl-2b', 'Croatia', 'Panama',  '2026-06-24', 'Group L'),
  ('gl-3a', 'England', 'Panama',  '2026-07-01', 'Group L'),
  ('gl-3b', 'Croatia', 'Ghana',   '2026-07-01', 'Group L');

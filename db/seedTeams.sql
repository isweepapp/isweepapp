-- iSweep World Cup 2026 — Team Pot Assignments
-- Pot 1: Top 12 seeds (FIFA ranking)
-- Pot 2: Second tier (18 teams)
-- Pot 3: Third tier (18 teams)

INSERT OR IGNORE INTO teams (pot, name) VALUES
  -- ── Pot 1 — Top Seeds (FIFA Ranks 1–12) ──────────────────────────────────
  (1, 'France'),
  (1, 'Spain'),
  (1, 'Argentina'),
  (1, 'England'),
  (1, 'Portugal'),
  (1, 'Brazil'),
  (1, 'Netherlands'),
  (1, 'Morocco'),
  (1, 'Belgium'),
  (1, 'Germany'),
  (1, 'Croatia'),
  (1, 'Uruguay'),

  -- ── Pot 2 — Second Tier (FIFA Ranks 13–30) ───────────────────────────────
  (2, 'Switzerland'),
  (2, 'Colombia'),
  (2, 'Mexico'),
  (2, 'United States'),
  (2, 'Japan'),
  (2, 'Iran'),
  (2, 'Senegal'),
  (2, 'Austria'),
  (2, 'Australia'),
  (2, 'South Korea'),
  (2, 'Ecuador'),
  (2, 'Egypt'),
  (2, 'Canada'),
  (2, 'Ivory Coast'),
  (2, 'Qatar'),
  (2, 'Algeria'),
  (2, 'Sweden'),
  (2, 'Tunisia'),

  -- ── Pot 3 — Third Tier (FIFA Ranks 31–48) ────────────────────────────────
  (3, 'Czechia'),
  (3, 'Türkiye'),
  (3, 'Norway'),
  (3, 'Scotland'),
  (3, 'DR Congo'),
  (3, 'Bosnia & Herzegovina'),
  (3, 'Panama'),
  (3, 'Saudi Arabia'),
  (3, 'South Africa'),
  (3, 'Iraq'),
  (3, 'Uzbekistan'),
  (3, 'Paraguay'),
  (3, 'Ghana'),
  (3, 'Jordan'),
  (3, 'Cape Verde'),
  (3, 'Curaçao'),
  (3, 'Haiti'),
  (3, 'New Zealand');

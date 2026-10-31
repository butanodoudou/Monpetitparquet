-- Correctifs bloquants v0 (2026-10-31). Idempotent : peut être rejoué sans effet de bord.
-- À exécuter dans le SQL Editor Supabase. Reporté dans supabase/schema.sql.

-- 1. Duels : saison portée par chaque duel --------------------------------------------------
ALTER TABLE weekly_matchups ADD COLUMN IF NOT EXISTS season TEXT;

-- Lignes existantes : 2025-2026 si créées avant le 20/09/2026, sinon 2026-2027.
UPDATE weekly_matchups
SET season = CASE WHEN created_at < '2026-09-20' THEN '2025-2026' ELSE '2026-2027' END
WHERE season IS NULL;

-- Les duels 2025-2026 non réglés sont figés tels quels (aucun recalcul avec les stats 2026-2027).
UPDATE weekly_matchups
SET settled_at = NOW()
WHERE season = '2025-2026' AND settled_at IS NULL;

ALTER TABLE weekly_matchups ALTER COLUMN season SET NOT NULL;

-- Unicité par saison : la J1 de 2026-2027 ne doit pas entrer en conflit avec la J1 de 2025-2026.
DROP INDEX IF EXISTS idx_matchups_week_home;
DROP INDEX IF EXISTS idx_matchups_week_away;
CREATE UNIQUE INDEX IF NOT EXISTS idx_matchups_season_week_home ON weekly_matchups(league_id, season, week, home_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matchups_season_week_away ON weekly_matchups(league_id, season, week, away_user_id);
DROP INDEX IF EXISTS idx_matchups_league;
CREATE INDEX IF NOT EXISTS idx_matchups_league_season ON weekly_matchups(league_id, season);

-- 2. Budget de draft : 500 000 par défaut --------------------------------------------------
ALTER TABLE league_members ALTER COLUMN draft_credits SET DEFAULT 500000;

-- Ligues dont le draft n'a pas démarré (leagues.draft_status = 'pending') et encore à 100.
UPDATE league_members lm
SET draft_credits = 500000
FROM leagues l
WHERE l.id = lm.league_id
  AND l.draft_status = 'pending'
  AND lm.draft_credits = 100;

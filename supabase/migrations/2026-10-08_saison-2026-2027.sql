-- ---------------------------------------------------------------------------
-- Bascule saison 2026-2027 (LNB Élite, seasonId Sofascore 102568)
-- À exécuter dans le SQL Editor Supabase, puis lancer les syncs (voir plus bas).
-- ---------------------------------------------------------------------------

-- 1. Pool draftable : un joueur qui n'est plus dans aucun effectif de la saison
--    en cours (club relégué, départ à l'étranger, retraite) sort du pool sans être
--    supprimé — ses performances passées restent référencées.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_players_active
  ON players(is_active, season_avg_fantasy DESC);

-- 2. Nouvelle saison par défaut pour les lignes insérées à la main.
ALTER TABLE matches ALTER COLUMN season SET DEFAULT '2026-2027';

-- 3. Les matchs déjà en base datent de 2025-2026 : on fige leur étiquette pour que
--    /api/sync/averages (qui filtre sur matches.season) les exclue proprement.
UPDATE matches SET season = '2025-2026' WHERE season IS NULL;

-- 4. Remise à zéro des moyennes de la saison passée. /api/sync/averages le refait
--    aussi, mais on part d'une base propre avant le premier backfill.
UPDATE players SET
  avg_points = 0, avg_assists = 0, avg_rebounds = 0,
  avg_steals = 0, avg_blocks = 0, avg_turnovers = 0,
  avg_three_pointers = 0, avg_minutes = 0,
  season_avg_fantasy = 0, games_played = 0,
  updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 5. Nouveau barème fantasy : box score complet
--    Sofascore expose bien plus que les 8 stats qu'on mappait. On stocke les
--    tentatives pour pouvoir pénaliser les tirs manqués (et afficher l'adresse).
-- ---------------------------------------------------------------------------
ALTER TABLE player_performances
  ADD COLUMN IF NOT EXISTS offensive_rebounds   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS defensive_rebounds   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS three_point_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS field_goals_made     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS field_goal_attempts  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_throws_made     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_throw_attempts  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS personal_fouls       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plus_minus           INTEGER DEFAULT 0;

-- Les perfs 2025-2026 déjà en base n'ont pas ces colonnes renseignées : leurs
-- fantasy_score restent calculés à l'ancien barème. C'est assumé — elles sont
-- exclues des moyennes et des totaux de ligue (filtre matches.season).

-- ---------------------------------------------------------------------------
-- Après la migration, dans cet ordre (remplacer $SECRET par CRON_SECRET) :
--   POST /api/sync/players?secret=$SECRET            -- effectifs 26/27 + pruning
--   POST /api/sync/results?secret=$SECRET&round=1    -- backfill J1
--   POST /api/sync/results?secret=$SECRET&round=2    -- backfill J2
--   POST /api/sync/averages?secret=$SECRET           -- moyennes saison en cours
-- ---------------------------------------------------------------------------

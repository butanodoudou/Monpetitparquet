-- ============================================================
-- Correctifs du cœur de jeu (composition, journée courante, résultats des duels)
-- Idempotent : peut être rejoué sans effet de bord.
-- À reporter dans supabase/schema.sql.
-- ============================================================

-- -------------------------------------------------------
-- B5 : table des compositions hebdomadaires (absente du schéma jusqu'ici)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  starter_player_ids INTEGER[] NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- cible du upsert onConflict: 'league_id,user_id,week'
  CONSTRAINT weekly_lineups_league_user_week_key UNIQUE (league_id, user_id, week),
  CONSTRAINT weekly_lineups_five_starters CHECK (cardinality(starter_player_ids) = 5)
);

-- Index sur la clé étrangère user_id (league_id est déjà couvert par la contrainte UNIQUE)
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_user ON weekly_lineups(user_id);

-- RLS activée sans policy anon : les compositions restent secrètes (accès via service_role uniquement)
ALTER TABLE weekly_lineups ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- B3 : clôture des duels
-- home_score / away_score existent déjà : ils reçoivent les scores finaux (3 modificateurs inclus).
-- settled_at distingue "égalité clôturée" (winner_user_id NULL + settled_at) de "pas encore clôturé".
-- -------------------------------------------------------
ALTER TABLE weekly_matchups ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Duels restant à clôturer (index partiel)
CREATE INDEX IF NOT EXISTS idx_matchups_unsettled
  ON weekly_matchups(league_id, week) WHERE settled_at IS NULL;

-- -------------------------------------------------------
-- B1/B2 : requêtes sur la saison courante (journée à jouer, journée scorée)
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_matches_season_week
  ON matches(season, week, status);

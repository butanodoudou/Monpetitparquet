-- ============================================================
-- Rattrapage des écarts entre la prod et schema.sql (constatés le 2026-10-31)
-- À exécuter AVANT 2026-10-08_saison-2026-2027.sql. Idempotent.
-- ============================================================

-- 1. matches.season était INTEGER DEFAULT 2024 en prod, alors que le code écrit '2026-2027'.
--    Sans ce correctif, la migration 2026-10-08 échoue (SET DEFAULT '2026-2027' sur un integer).
--    La table était vide au moment du constat : la conversion ne perd rien.
ALTER TABLE matches ALTER COLUMN season DROP DEFAULT;
ALTER TABLE matches ALTER COLUMN season TYPE TEXT USING season::text;

-- 2. weekly_lineups existait déjà (créée à la main) : le CREATE TABLE IF NOT EXISTS de
--    2026-10-30_core-fixes est donc ignoré, et la règle des 5 titulaires n'existe pas.
--    L'unicité (league_id, user_id, week) est déjà là, sous le nom weekly_lineups_league_id_user_id_week_key.
ALTER TABLE weekly_lineups ALTER COLUMN starter_player_ids DROP DEFAULT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_lineups_five_starters') THEN
    ALTER TABLE weekly_lineups
      ADD CONSTRAINT weekly_lineups_five_starters CHECK (cardinality(starter_player_ids) = 5);
  END IF;
END $$;

-- Correctifs robustesse draft (2026-10-30)
-- À exécuter une fois dans l'éditeur SQL Supabase.
-- NB : la table auction_packs et la colonne closing_started_at figurent dans supabase/schema.sql.

-- F3 : horodatage de passage en 'closing', pour reprendre un pack bloqué (> 2 min).
ALTER TABLE auction_packs
  ADD COLUMN IF NOT EXISTS closing_started_at TIMESTAMPTZ;

-- F13 : postes composés mal normalisés ('G-', 'F-', 'C-', 'G/', ...) -> PG / SF / C.
-- Le poste d'origine n'est pas conservé : on mappe sur le premier poste cité (G -> PG, F -> SF, C -> C).
UPDATE players SET position = 'PG' WHERE position IN ('G-', 'G/', 'G,', 'G ');
UPDATE players SET position = 'SF' WHERE position IN ('F-', 'F/', 'F,', 'F ');
UPDATE players SET position = 'C'  WHERE position IN ('C-', 'C/', 'C,', 'C ');

-- Jeu de cartes : la collection appartient au compte. Voir .claude/specs/cartes.md.
-- Migration additive : team_players et les tables d'enchères restent en place tant que le code
-- qui les lit n'a pas disparu de la prod.

CREATE TABLE IF NOT EXISTS card_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('starter', 'lundi', 'victoire', 'mission', 'achat')),
  quality TEXT NOT NULL DEFAULT 'standard' CHECK (quality IN ('standard', 'argent', 'or')),
  -- Rend les gains idempotents : numéro du paquet de départ, ou journée. NULL pour un achat.
  reward_key TEXT,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS card_packs_reward_key
  ON card_packs (user_id, season, source, reward_key) WHERE reward_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS card_packs_unopened ON card_packs (user_id, season) WHERE opened_at IS NULL;

CREATE TABLE IF NOT EXISTS player_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id),
  rarity TEXT NOT NULL CHECK (rarity IN ('bronze', 'silver', 'gold', 'platine')),
  season TEXT NOT NULL,
  -- Une carte d'un paquet fermé n'est pas encore dans la collection.
  pack_id UUID REFERENCES card_packs(id) ON DELETE CASCADE,
  -- Vendue ou sacrifiée : la ligne reste pour l'historique des duels déjà joués.
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS player_cards_owner ON player_cards (user_id, season) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS player_cards_pack ON player_cards (pack_id);
CREATE INDEX IF NOT EXISTS player_cards_player ON player_cards (player_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0);

-- Le cinq suit l'ordre des places : arrière, arrière, ailier, grand, grand.
ALTER TABLE weekly_lineups ADD COLUMN IF NOT EXISTS starter_card_ids UUID[];
ALTER TABLE weekly_lineups ALTER COLUMN starter_player_ids DROP NOT NULL;

-- Tout passe par l'API avec la clé de service, comme pour users.
ALTER TABLE card_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_cards ENABLE ROW LEVEL SECURITY;

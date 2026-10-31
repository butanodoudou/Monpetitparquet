-- -------------------------------------------------------
-- Tables du draft par enchères (auction_packs / auction_bids)
-- -------------------------------------------------------
-- Ces tables ont été créées à la main dans Supabase et n'étaient décrites nulle part.
-- Cette migration les rend reproductibles. Elle est idempotente : sans effet sur une
-- base où elles existent déjà (vérifier quand même la structure réelle, cf. requête en bas).

CREATE TABLE IF NOT EXISTS auction_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  pack_number INTEGER NOT NULL,
  player_ids INTEGER[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'bidding',   -- bidding | closing | closed
  expires_at TIMESTAMPTZ,
  winners JSONB,                             -- { [playerId]: { userId, username, amount } | null }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (league_id, pack_number)
);

CREATE TABLE IF NOT EXISTS auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES auction_packs(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id),
  amount INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pack_id, user_id, player_id)       -- requis par les upsert onConflict
);

-- Un seul pack en enchère à la fois par ligue
CREATE UNIQUE INDEX IF NOT EXISTS auction_packs_one_bidding_per_league
  ON auction_packs (league_id) WHERE status = 'bidding';

ALTER TABLE auction_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY;
-- Aucune policy anon : le draft passe par /api/draft/[id]/auction-state (service_role).
-- Surtout pas de lecture anon sur auction_bids : les enchères sont à l'aveugle.

-- Vérification de la structure réelle (à lancer avant, sur la base existante) :
-- SELECT table_name, column_name, data_type FROM information_schema.columns
-- WHERE table_name IN ('auction_packs', 'auction_bids') ORDER BY table_name, ordinal_position;

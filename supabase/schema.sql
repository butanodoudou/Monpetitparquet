-- ============================================================
-- Mon Petit Parquet – Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------
-- Users (custom auth, not Supabase Auth)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  avatar_color TEXT NOT NULL DEFAULT '#F59E0B',
  login_version INTEGER NOT NULL DEFAULT 1,
  -- Monnaie virtuelle du jeu de cartes (cf. migrations/2026-11-07_cards.sql)
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));

-- -------------------------------------------------------
-- Clubs de LNB Élite, ex Betclic Élite (from Sofascore).
-- Le nom de table betclic_teams est historique — conservé pour ne pas casser les FK.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS betclic_teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  city TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Real players (from Sofascore)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  team TEXT NOT NULL,
  team_id INTEGER REFERENCES betclic_teams(id),
  position TEXT,
  jersey_number INTEGER,
  nationality TEXT,
  height TEXT,
  weight TEXT,
  birth_date TEXT,
  photo_url TEXT,
  avg_points REAL DEFAULT 0,
  avg_assists REAL DEFAULT 0,
  avg_rebounds REAL DEFAULT 0,
  avg_steals REAL DEFAULT 0,
  avg_blocks REAL DEFAULT 0,
  avg_turnovers REAL DEFAULT 0,
  avg_three_pointers REAL DEFAULT 0,
  avg_minutes REAL DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  season_avg_fantasy REAL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Matches (from Sofascore)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  home_team TEXT NOT NULL,
  home_team_id INTEGER,
  away_team TEXT NOT NULL,
  away_team_id INTEGER,
  home_score INTEGER,
  away_score INTEGER,
  match_date TIMESTAMPTZ NOT NULL,
  week INTEGER,
  status TEXT DEFAULT 'scheduled',
  season TEXT DEFAULT '2026-2027',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Player performances per match
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_performances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id INTEGER REFERENCES players(id),
  match_id INTEGER REFERENCES matches(id),
  team_id INTEGER,
  points INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  rebounds INTEGER DEFAULT 0,
  offensive_rebounds INTEGER DEFAULT 0,
  defensive_rebounds INTEGER DEFAULT 0,
  steals INTEGER DEFAULT 0,
  blocks INTEGER DEFAULT 0,
  turnovers INTEGER DEFAULT 0,
  three_pointers INTEGER DEFAULT 0,
  three_point_attempts INTEGER DEFAULT 0,
  field_goals_made INTEGER DEFAULT 0,
  field_goal_attempts INTEGER DEFAULT 0,
  free_throws_made INTEGER DEFAULT 0,
  free_throw_attempts INTEGER DEFAULT 0,
  personal_fouls INTEGER DEFAULT 0,
  plus_minus INTEGER DEFAULT 0,
  minutes_played INTEGER DEFAULT 0,
  fantasy_score REAL DEFAULT 0,
  UNIQUE(player_id, match_id)
);

-- -------------------------------------------------------
-- Fantasy Leagues
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  commissioner_id UUID REFERENCES users(id),
  max_teams INTEGER DEFAULT 8,
  picks_per_team INTEGER DEFAULT 5,
  draft_status TEXT DEFAULT 'pending',
  draft_type TEXT DEFAULT 'mystery',
  current_draft_pick INTEGER DEFAULT 1,
  pick_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- League Members
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS league_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  team_name TEXT,
  draft_position INTEGER,
  draft_credits INTEGER DEFAULT 500000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);

-- -------------------------------------------------------
-- Team Players (drafted)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  player_id INTEGER REFERENCES players(id),
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, player_id)
);

-- -------------------------------------------------------
-- Draft Picks history
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS draft_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  player_id INTEGER REFERENCES players(id),
  pick_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Mystery Draft Pack Offers
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS draft_pack_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('elite', 'gold', 'silver', 'bronze')),
  player_ids INTEGER[] NOT NULL,
  chosen_player_id INTEGER REFERENCES players(id),
  credits_spent INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Weekly Matchups (head-to-head fantasy duels)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  -- Saison du duel (CURRENT_SEASON de lib/sports-api.ts) ; cf. migrations/2026-10-31_v0-fixes.sql
  season TEXT NOT NULL,
  week INTEGER NOT NULL,
  home_user_id UUID NOT NULL REFERENCES users(id),
  away_user_id UUID NOT NULL REFERENCES users(id),
  home_score FLOAT DEFAULT 0,
  away_score FLOAT DEFAULT 0,
  winner_user_id UUID REFERENCES users(id),
  -- Duel clôturé (scores finaux figés). winner_user_id NULL + settled_at = égalité.
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Compositions hebdomadaires (5 titulaires par journée)
-- (cf. migrations/2026-10-30_core-fixes.sql)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_lineups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  starter_player_ids INTEGER[],              -- ancien format, plus lu (cf. starter_card_ids)
  -- Le cinq suit l'ordre des places : arrière, arrière, ailier, grand, grand.
  starter_card_ids UUID[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT weekly_lineups_league_user_week_key UNIQUE (league_id, user_id, week),
  CONSTRAINT weekly_lineups_five_starters CHECK (cardinality(starter_player_ids) = 5)
);

-- -------------------------------------------------------
-- Draft par enchères : packs partagés + enchères à l'aveugle
-- (cf. migrations/2026-10-15_auction-tables.sql)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS auction_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  pack_number INTEGER NOT NULL,
  player_ids INTEGER[] NOT NULL,
  status TEXT NOT NULL DEFAULT 'bidding',   -- bidding | closing | closed
  expires_at TIMESTAMPTZ,
  winners JSONB,                             -- { [playerId]: { userId, username, amount } | null }
  closing_started_at TIMESTAMPTZ,            -- passage en 'closing' : reprise par auto-close après 2 min
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
  UNIQUE (pack_id, user_id, player_id)
);

-- -------------------------------------------------------
-- Loterie du lundi (cf. migrations/2026-10-30_lottery.sql)
-- -------------------------------------------------------
-- -------------------------------------------------------
-- Sessions de loterie : une par ligue et par semaine
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS lottery_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,                      -- numéro de journée LNB écoulée (matches.week)
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'done', 'cancelled')),
  draw_order JSONB,                           -- [{ user_id, tickets, pick }] rempli au lancement
  current_pick INTEGER NOT NULL DEFAULT 1,
  pick_deadline TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, week)                    -- idempotence du cron ; sert aussi d'index sur league_id
);

-- -------------------------------------------------------
-- Packs : N par session (1 par manager), 5 free agents chacun
-- player_ids ne doit JAMAIS être renvoyé au client tant que le pack n'est pas ouvert.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS lottery_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES lottery_sessions(id) ON DELETE CASCADE,
  pack_number INTEGER NOT NULL,
  player_ids INTEGER[] NOT NULL,
  player_tiers TEXT[] NOT NULL,               -- tier de chaque joueur, même ordre que player_ids
  opened BOOLEAN NOT NULL DEFAULT FALSE,
  opened_by UUID REFERENCES users(id) ON DELETE SET NULL,
  taken_by UUID REFERENCES users(id) ON DELETE SET NULL,
  chosen_player_id INTEGER REFERENCES players(id),
  released_player_id INTEGER REFERENCES players(id),
  taken_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, pack_number),
  CHECK (cardinality(player_ids) = cardinality(player_tiers))
);

-- Un seul pack ouvert mais pas encore pris à la fois par session : empêche
-- un manager d'ouvrir deux packs en parallèle (double appel de la route /open).
CREATE UNIQUE INDEX IF NOT EXISTS lottery_packs_one_open_per_session
  ON lottery_packs (session_id) WHERE opened AND taken_by IS NULL;

-- -------------------------------------------------------
-- Tickets de chaque manager pour la session
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS lottery_tickets (
  session_id UUID NOT NULL REFERENCES lottery_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tickets INTEGER NOT NULL CHECK (tickets > 0),
  rank INTEGER NOT NULL CHECK (rank > 0),     -- rang au classement de la semaine (1 = premier)
  PRIMARY KEY (session_id, user_id)
);

-- -------------------------------------------------------
-- RLS : lecture anon sur lottery_sessions uniquement (Realtime).
-- lottery_packs et lottery_tickets passent par l'API (service_role) pour masquer les packs fermés.
-- -------------------------------------------------------
ALTER TABLE lottery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read lottery_sessions" ON lottery_sessions;
CREATE POLICY "anon read lottery_sessions" ON lottery_sessions
  FOR SELECT TO anon, authenticated USING (true);

-- -------------------------------------------------------
-- Realtime : le client écoute lottery_sessions puis refetch /state
-- -------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lottery_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lottery_sessions;
  END IF;
END $$;

-- -------------------------------------------------------
-- lottery_apply_pick : swap atomique d'un pick
--   1. verrouille la session, vérifie que le pick attendu est bien le courant
--   2. verrouille le pack, vérifie qu'il a été ouvert par ce manager
--   3. relâche (delete team_players), ajoute le joueur (insert team_players)
--   4. marque le pack comme pris, avance current_pick (ou clôt la session)
-- Toute erreur annule l'ensemble. Messages d'erreur stables, lus par l'API :
--   session_introuvable, pick_conflict, pas_ton_tour, pack_introuvable,
--   pack_indisponible, joueur_hors_pack, relache_invalide, roster_plein.
-- Un joueur déjà pris dans la ligue lève unique_violation (23505).
-- La validation des postes (ROSTER_SLOTS) est faite par l'API avec lib/fantasy.ts.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION lottery_apply_pick(
  p_session_id UUID,
  p_pack_id UUID,
  p_user_id UUID,
  p_player_id INTEGER,
  p_release_player_id INTEGER,
  p_expected_pick INTEGER,
  p_roster_size INTEGER,
  p_pick_seconds INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_session lottery_sessions%ROWTYPE;
  v_pack lottery_packs%ROWTYPE;
  v_total INTEGER;
  v_roster INTEGER;
  v_deleted INTEGER;
  v_next INTEGER;
  v_status TEXT;
  v_deadline TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_session FROM lottery_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_introuvable'; END IF;

  IF v_session.status <> 'live' OR v_session.current_pick <> p_expected_pick THEN
    RAISE EXCEPTION 'pick_conflict';
  END IF;

  v_total := jsonb_array_length(v_session.draw_order);

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_session.draw_order) e
    WHERE (e->>'pick')::INTEGER = v_session.current_pick
      AND (e->>'user_id')::UUID = p_user_id
  ) THEN
    RAISE EXCEPTION 'pas_ton_tour';
  END IF;

  SELECT * INTO v_pack FROM lottery_packs
  WHERE id = p_pack_id AND session_id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pack_introuvable'; END IF;

  IF NOT v_pack.opened OR v_pack.opened_by IS DISTINCT FROM p_user_id OR v_pack.taken_by IS NOT NULL THEN
    RAISE EXCEPTION 'pack_indisponible';
  END IF;

  IF NOT (p_player_id = ANY (v_pack.player_ids)) THEN
    RAISE EXCEPTION 'joueur_hors_pack';
  END IF;

  SELECT count(*) INTO v_roster FROM team_players
  WHERE league_id = v_session.league_id AND user_id = p_user_id;

  IF p_release_player_id IS NOT NULL THEN
    DELETE FROM team_players
    WHERE league_id = v_session.league_id AND user_id = p_user_id AND player_id = p_release_player_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN RAISE EXCEPTION 'relache_invalide'; END IF;
    v_roster := v_roster - 1;
  END IF;

  IF v_roster >= p_roster_size THEN RAISE EXCEPTION 'roster_plein'; END IF;

  INSERT INTO team_players (league_id, user_id, player_id)
  VALUES (v_session.league_id, p_user_id, p_player_id);

  UPDATE lottery_packs
  SET taken_by = p_user_id,
      chosen_player_id = p_player_id,
      released_player_id = p_release_player_id,
      taken_at = NOW()
  WHERE id = p_pack_id;

  v_next := v_session.current_pick + 1;
  IF v_next > v_total THEN
    v_status := 'done';
    v_deadline := NULL;
    UPDATE lottery_sessions
    SET current_pick = v_next, status = v_status, pick_deadline = NULL, ended_at = NOW()
    WHERE id = p_session_id;
  ELSE
    v_status := 'live';
    v_deadline := NOW() + make_interval(secs => p_pick_seconds);
    UPDATE lottery_sessions
    SET current_pick = v_next, pick_deadline = v_deadline
    WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object('status', v_status, 'current_pick', v_next, 'pick_deadline', v_deadline);
END;
$$;

-- Appelée uniquement par l'API (service_role) : jamais par le navigateur.
REVOKE ALL ON FUNCTION lottery_apply_pick(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION lottery_apply_pick(UUID, UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;

-- -------------------------------------------------------
-- Indexes
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_fantasy ON players(season_avg_fantasy DESC);
CREATE INDEX IF NOT EXISTS idx_players_active ON players(is_active, season_avg_fantasy DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status, match_date);
CREATE INDEX IF NOT EXISTS idx_perf_player ON player_performances(player_id);
CREATE INDEX IF NOT EXISTS idx_perf_match ON player_performances(match_id);
CREATE INDEX IF NOT EXISTS idx_members_league ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_team_players_league ON team_players(league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_league ON draft_picks(league_id);
CREATE INDEX IF NOT EXISTS idx_pack_offers_league_user ON draft_pack_offers(league_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matchups_season_week_home ON weekly_matchups(league_id, season, week, home_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matchups_season_week_away ON weekly_matchups(league_id, season, week, away_user_id);
CREATE INDEX IF NOT EXISTS idx_matchups_league_season ON weekly_matchups(league_id, season);
CREATE INDEX IF NOT EXISTS idx_matchups_unsettled ON weekly_matchups(league_id, week) WHERE settled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_weekly_lineups_user ON weekly_lineups(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_season_week ON matches(season, week, status);
CREATE UNIQUE INDEX IF NOT EXISTS auction_packs_one_bidding_per_league ON auction_packs(league_id) WHERE status = 'bidding';

-- -------------------------------------------------------
-- Jeu de cartes : la collection appartient au compte (cf. migrations/2026-11-07_cards.sql)
-- -------------------------------------------------------
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

-- Tout passe par l'API avec la clé de service, comme pour users.
ALTER TABLE card_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_cards ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- Économie des cartes (cf. migrations/2026-11-08_economy.sql)
-- -------------------------------------------------------
-- ─── Création ou remplacement d'un paquet gagné ─────────────────
-- p_reward_key NULL : achat, toujours créé. Sinon un seul paquet par (compte, saison, source, clé).
-- Si le paquet existe, encore fermé, et que sa qualité est dans p_replace_qualities (les qualités
-- strictement moins bonnes, calculées par l'API), ses cartes sont remplacées. Sinon il est conservé.
CREATE OR REPLACE FUNCTION grant_pack(
  p_user UUID, p_season TEXT, p_source TEXT, p_reward_key TEXT, p_quality TEXT,
  p_cards JSONB, p_open BOOLEAN, p_replace_qualities TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id UUID;
  v_pack card_packs%ROWTYPE;
BEGIN
  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' OR jsonb_array_length(p_cards) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cartes_invalides');
  END IF;

  INSERT INTO card_packs (user_id, season, source, quality, reward_key, opened_at)
  VALUES (p_user, p_season, p_source, p_quality, p_reward_key, CASE WHEN p_open THEN NOW() END)
  ON CONFLICT (user_id, season, source, reward_key) WHERE reward_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO player_cards (user_id, player_id, rarity, season, pack_id)
    SELECT p_user, (c->>'player_id')::INTEGER, c->>'rarity', p_season, v_id
    FROM jsonb_array_elements(p_cards) AS c;
    RETURN jsonb_build_object('ok', true, 'status', 'created', 'pack_id', v_id);
  END IF;

  SELECT * INTO v_pack FROM card_packs
  WHERE user_id = p_user AND season = p_season AND source = p_source AND reward_key = p_reward_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'paquet_introuvable');
  END IF;
  IF v_pack.opened_at IS NOT NULL OR p_replace_qualities IS NULL OR NOT (v_pack.quality = ANY (p_replace_qualities)) THEN
    RETURN jsonb_build_object('ok', true, 'status', 'kept', 'pack_id', v_pack.id);
  END IF;

  -- Paquet fermé : ses cartes ne sont dans aucune composition, on peut les remplacer.
  DELETE FROM player_cards WHERE pack_id = v_pack.id;
  INSERT INTO player_cards (user_id, player_id, rarity, season, pack_id)
  SELECT p_user, (c->>'player_id')::INTEGER, c->>'rarity', p_season, v_pack.id
  FROM jsonb_array_elements(p_cards) AS c;
  UPDATE card_packs SET quality = p_quality WHERE id = v_pack.id;
  RETURN jsonb_build_object('ok', true, 'status', 'replaced', 'pack_id', v_pack.id);
END;
$$;

-- ─── Vente de cartes ────────────────────────────────────────────
-- p_values : { "bronze": 5, ... } construit côté serveur depuis RARITY_CONFIG.sellValue.
-- p_locked_ids : cartes alignées dans une journée verrouillée (calculées par l'API, repli compris).
-- p_locked_week : journée verrouillée en cours, ou NULL ; contrôle de sécurité sur les compositions enregistrées.
CREATE OR REPLACE FUNCTION sell_cards(
  p_user UUID, p_season TEXT, p_card_ids UUID[], p_values JSONB,
  p_locked_ids UUID[], p_locked_week INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_found INTEGER;
  v_amount INTEGER;
  v_unpriced INTEGER;
  v_coins INTEGER;
BEGIN
  IF p_card_ids IS NULL OR cardinality(p_card_ids) = 0
     OR cardinality(p_card_ids) <> (SELECT COUNT(DISTINCT x) FROM unnest(p_card_ids) AS x) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cartes_invalides');
  END IF;

  PERFORM 1 FROM users WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'compte_introuvable');
  END IF;

  IF (p_locked_ids IS NOT NULL AND p_locked_ids && p_card_ids)
     OR (p_locked_week IS NOT NULL AND EXISTS (
          SELECT 1 FROM weekly_lineups l
          WHERE l.user_id = p_user AND l.week = p_locked_week AND l.starter_card_ids && p_card_ids)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'carte_verrouillee');
  END IF;

  -- Cartes du compte, d'un paquet ouvert, pas encore consommées. Le montant vient de leur rareté en base.
  SELECT COUNT(*), SUM((p_values->>s.rarity)::INTEGER),
         COUNT(*) FILTER (WHERE (p_values->>s.rarity) IS NULL)
  INTO v_found, v_amount, v_unpriced
  FROM (
    SELECT c.id, c.rarity
    FROM player_cards c
    LEFT JOIN card_packs p ON p.id = c.pack_id
    WHERE c.id = ANY (p_card_ids)
      AND c.user_id = p_user AND c.season = p_season AND c.consumed_at IS NULL
      AND (c.pack_id IS NULL OR p.opened_at IS NOT NULL)
    ORDER BY c.id
    FOR UPDATE OF c
  ) s;

  IF v_found <> cardinality(p_card_ids) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'carte_indisponible');
  END IF;
  IF v_unpriced > 0 OR v_amount IS NULL OR v_amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'prix_inconnu');
  END IF;

  UPDATE player_cards SET consumed_at = NOW() WHERE id = ANY (p_card_ids);
  UPDATE users SET coins = coins + v_amount WHERE id = p_user RETURNING coins INTO v_coins;
  RETURN jsonb_build_object('ok', true, 'coins', v_coins, 'amount', v_amount);
END;
$$;

-- ─── Achat d'un paquet ──────────────────────────────────────────
-- p_cards : 5 cartes tirées par l'API (drawPack). Solde insuffisant : refus propre, rien n'est créé.
CREATE OR REPLACE FUNCTION buy_pack(
  p_user UUID, p_season TEXT, p_price INTEGER, p_cards JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_coins INTEGER;
  v_pack UUID;
BEGIN
  IF p_price IS NULL OR p_price <= 0 OR p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array'
     OR jsonb_array_length(p_cards) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parametres_invalides');
  END IF;

  SELECT coins INTO v_coins FROM users WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'compte_introuvable');
  END IF;
  IF v_coins < p_price THEN
    RETURN jsonb_build_object('ok', false, 'error', 'solde_insuffisant', 'coins', v_coins);
  END IF;

  UPDATE users SET coins = coins - p_price WHERE id = p_user RETURNING coins INTO v_coins;
  INSERT INTO card_packs (user_id, season, source, quality, reward_key)
  VALUES (p_user, p_season, 'achat', 'standard', NULL)
  RETURNING id INTO v_pack;
  INSERT INTO player_cards (user_id, player_id, rarity, season, pack_id)
  SELECT p_user, (c->>'player_id')::INTEGER, c->>'rarity', p_season, v_pack
  FROM jsonb_array_elements(p_cards) AS c;
  RETURN jsonb_build_object('ok', true, 'coins', v_coins, 'pack_id', v_pack);
END;
$$;

-- ─── Amélioration d'une carte ───────────────────────────────────
-- Les duels passés restent stables : la carte améliorée n'est jamais modifiée. Elle est consommée
-- avec les sacrifices, et une NOUVELLE carte (même joueur, rareté supérieure) est créée. Les journées
-- déjà jouées recalculent donc avec l'ancienne carte (cardsAt dans lib/card-scoring.ts).
-- Les compositions des journées à venir (>= p_open_week) pointent ensuite vers la nouvelle carte.
-- p_from, p_to et p_required viennent de lib/cards.ts (upgradeError, nextRarity, UPGRADE_COST).
CREATE OR REPLACE FUNCTION upgrade_card(
  p_user UUID, p_season TEXT, p_card UUID, p_sacrifices UUID[],
  p_from TEXT, p_to TEXT, p_required INTEGER,
  p_locked_ids UUID[], p_locked_week INTEGER, p_open_week INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_all UUID[];
  v_found INTEGER;
  v_bad INTEGER;
  v_player INTEGER;
  v_new UUID;
BEGIN
  IF p_sacrifices IS NULL OR cardinality(p_sacrifices) <> p_required THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sacrifices_invalides');
  END IF;
  v_all := p_sacrifices || p_card;
  IF cardinality(v_all) <> (SELECT COUNT(DISTINCT x) FROM unnest(v_all) AS x) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cartes_en_double');
  END IF;

  PERFORM 1 FROM users WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'compte_introuvable');
  END IF;

  IF (p_locked_ids IS NOT NULL AND p_locked_ids && v_all)
     OR (p_locked_week IS NOT NULL AND EXISTS (
          SELECT 1 FROM weekly_lineups l
          WHERE l.user_id = p_user AND l.week = p_locked_week AND l.starter_card_ids && v_all)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'carte_verrouillee');
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE s.rarity <> p_from)
  INTO v_found, v_bad
  FROM (
    SELECT c.id, c.rarity
    FROM player_cards c
    LEFT JOIN card_packs p ON p.id = c.pack_id
    WHERE c.id = ANY (v_all)
      AND c.user_id = p_user AND c.season = p_season AND c.consumed_at IS NULL
      AND (c.pack_id IS NULL OR p.opened_at IS NOT NULL)
    ORDER BY c.id
    FOR UPDATE OF c
  ) s;
  IF v_found <> cardinality(v_all) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'carte_indisponible');
  END IF;
  IF v_bad > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rarete_differente');
  END IF;

  SELECT player_id INTO v_player FROM player_cards WHERE id = p_card;
  UPDATE player_cards SET consumed_at = NOW() WHERE id = ANY (v_all);
  INSERT INTO player_cards (user_id, player_id, rarity, season, pack_id)
  VALUES (p_user, v_player, p_to, p_season, NULL)
  RETURNING id INTO v_new;

  IF p_open_week IS NOT NULL THEN
    -- Journées à venir : la composition enregistrée garde sa place avec la nouvelle carte.
    UPDATE weekly_lineups
    SET starter_card_ids = array_replace(starter_card_ids, p_card, v_new)
    WHERE user_id = p_user AND week >= p_open_week AND starter_card_ids @> ARRAY[p_card];

    -- Composition reprise d'une journée passée (repli) : on la recopie pour la prochaine journée à jouer,
    -- sinon elle deviendrait invalide et le cinq par défaut prendrait le relais. Le passé n'est pas modifié.
    INSERT INTO weekly_lineups (league_id, user_id, week, starter_card_ids)
    SELECT l.league_id, l.user_id, p_open_week, array_replace(l.starter_card_ids, p_card, v_new)
    FROM (
      SELECT DISTINCT ON (league_id) league_id, user_id, starter_card_ids
      FROM weekly_lineups
      WHERE user_id = p_user AND week < p_open_week AND starter_card_ids IS NOT NULL
      ORDER BY league_id, week DESC
    ) l
    WHERE l.starter_card_ids @> ARRAY[p_card]
      AND NOT EXISTS (
        SELECT 1 FROM weekly_lineups x
        WHERE x.league_id = l.league_id AND x.user_id = l.user_id AND x.week = p_open_week)
    ON CONFLICT (league_id, user_id, week) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'card_id', v_new);
END;
$$;

-- ─── Droits : service_role uniquement ───────────────────────────
REVOKE ALL ON FUNCTION grant_pack(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sell_cards(UUID, TEXT, UUID[], JSONB, UUID[], INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION buy_pack(UUID, TEXT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION upgrade_card(UUID, TEXT, UUID, UUID[], TEXT, TEXT, INTEGER, UUID[], INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_pack(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION sell_cards(UUID, TEXT, UUID[], JSONB, UUID[], INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION buy_pack(UUID, TEXT, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION upgrade_card(UUID, TEXT, UUID, UUID[], TEXT, TEXT, INTEGER, UUID[], INTEGER, INTEGER) TO service_role;

-- -------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE betclic_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_pack_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_lineups ENABLE ROW LEVEL SECURITY;  -- pas de policy anon : compos secrètes
ALTER TABLE auction_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY;  -- pas de lecture anon : enchères à l'aveugle

CREATE POLICY "anon read players" ON players FOR SELECT USING (true);
CREATE POLICY "anon read teams" ON betclic_teams FOR SELECT USING (true);
CREATE POLICY "anon read matches" ON matches FOR SELECT USING (true);
CREATE POLICY "anon read performances" ON player_performances FOR SELECT USING (true);
CREATE POLICY "anon read leagues" ON leagues FOR SELECT USING (true);
CREATE POLICY "anon read members" ON league_members FOR SELECT USING (true);
CREATE POLICY "anon read team_players" ON team_players FOR SELECT USING (true);
CREATE POLICY "anon read draft_picks" ON draft_picks FOR SELECT USING (true);
CREATE POLICY "anon read pack_offers" ON draft_pack_offers FOR SELECT USING (true);
CREATE POLICY "anon read matchups" ON weekly_matchups FOR SELECT USING (true);
-- service_role bypasses RLS for all writes

-- -------------------------------------------------------
-- Migration statements (run separately if schema exists)
-- -------------------------------------------------------
-- ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_type TEXT DEFAULT 'mystery';
-- ALTER TABLE league_members ADD COLUMN IF NOT EXISTS draft_credits INTEGER DEFAULT 500000;

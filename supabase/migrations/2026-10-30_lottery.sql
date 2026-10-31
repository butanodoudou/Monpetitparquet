-- ============================================================
-- Loterie du lundi (beta v0) : tables, index, RLS, Realtime, fonction de pick
-- Spec : .claude/specs/loterie.md
-- Idempotente : peut être relancée sans effet de bord.
-- ============================================================

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

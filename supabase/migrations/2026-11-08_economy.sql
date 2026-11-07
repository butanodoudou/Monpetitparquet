-- Économie du jeu de cartes : gains de paquets, vente, achat, amélioration.
-- Voir .claude/specs/cartes.md (étape 3). Migration additive et idempotente (CREATE OR REPLACE).
--
-- Principes communs :
--  - SECURITY DEFINER, search_path fixé, exécutable par service_role uniquement.
--  - Les montants (prix de revente, prix du paquet) sont passés par l'API depuis lib/cards.ts : le SQL ne
--    les connaît pas et ne les reçoit jamais du client.
--  - Chaque fonction verrouille d'abord la ligne users du compte : toutes les opérations d'un même compte
--    sont sérialisées, puis les cartes concernées sont verrouillées (FOR UPDATE, ordre d'id).
--  - Les refus renvoient { ok: false, error } au lieu de lever une exception : pas d'erreur technique.

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

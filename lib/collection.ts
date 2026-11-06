// Collection de cartes d'un compte : lecture, paquets de départ, ouverture.
// Toutes les écritures passent par db() (service_role), appelé depuis les API Routes.
import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_SEASON } from '@/lib/sports-api';
import { STARTER_PACKS, drawStarterPacks, groupOf, type PoolPlayer, type Rarity } from '@/lib/cards';
import type { CardView, Collection, PackView } from '@/lib/card-view';
import type { ScoringCard } from '@/lib/card-scoring';

const CARD_SELECT =
  'id, user_id, player_id, rarity, created_at, consumed_at, pack:card_packs(opened_at), ' +
  'player:players(id, name, team, team_id, position, photo_url, jersey_number, nationality, season_avg_fantasy)';

/** Ligne de player_cards avec son paquet et son joueur. */
export interface CardRow {
  id: string;
  user_id: string;
  player_id: number;
  rarity: Rarity;
  created_at: string;
  consumed_at: string | null;
  pack: { opened_at: string | null } | null;
  player: {
    id: number; name: string; team: string; team_id: number | null; position: string | null;
    photo_url: string | null; jersey_number: number | null; nationality: string | null; season_avg_fantasy: number | null;
  } | null;
}

/** Date d'entrée dans la collection : ouverture du paquet, sinon création (carte sans paquet). Null = paquet fermé. */
function obtainedAt(row: CardRow): string | null {
  if (row.pack) return row.pack.opened_at;
  return row.created_at;
}

export function toCardView(row: CardRow): CardView {
  const p = row.player;
  return {
    id: row.id,
    rarity: row.rarity,
    obtained_at: obtainedAt(row) ?? row.created_at,
    player: {
      id: row.player_id,
      name: p?.name ?? '',
      team: p?.team ?? '',
      position: p?.position ?? null,
      group: groupOf(p?.position),
      photo_url: p?.photo_url ?? null,
      jersey_number: p?.jersey_number ?? null,
      season_avg_fantasy: p?.season_avg_fantasy ?? 0,
    },
  };
}

export function toScoringCard(row: CardRow): ScoringCard | null {
  const opened = obtainedAt(row);
  if (!opened) return null; // paquet fermé : pas dans la collection
  return {
    id: row.id,
    user_id: row.user_id,
    player_id: row.player_id,
    rarity: row.rarity,
    group: groupOf(row.player?.position),
    season_avg_fantasy: row.player?.season_avg_fantasy ?? 0,
    team_id: row.player?.team_id ?? null,
    nationality: row.player?.nationality ?? null,
    obtainedMs: new Date(opened).getTime(),
    consumedMs: row.consumed_at ? new Date(row.consumed_at).getTime() : null,
  };
}

/** Cartes de la saison de ces comptes, vendues comprises (pour recalculer les journées passées). */
export async function loadSeasonCardRows(supabase: SupabaseClient, userIds: string[]): Promise<CardRow[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from('player_cards')
    .select(CARD_SELECT)
    .in('user_id', userIds)
    .eq('season', CURRENT_SEASON);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CardRow[];
}

/** Collection du compte : paquets ouverts et cartes non vendues, les plus récentes d'abord. */
export async function loadCardRows(supabase: SupabaseClient, userId: string): Promise<CardRow[]> {
  const { data, error } = await supabase
    .from('player_cards')
    .select(CARD_SELECT)
    .eq('user_id', userId)
    .eq('season', CURRENT_SEASON)
    .is('consumed_at', null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as CardRow[])
    .filter(r => obtainedAt(r) !== null)
    .sort((a, b) => (obtainedAt(b) ?? '').localeCompare(obtainedAt(a) ?? ''));
}

export async function loadCollection(supabase: SupabaseClient, userId: string): Promise<Collection> {
  const [rows, userRes, packsRes] = await Promise.all([
    loadCardRows(supabase, userId),
    supabase.from('users').select('coins').eq('id', userId).maybeSingle(),
    supabase
      .from('card_packs')
      .select('id, source, quality')
      .eq('user_id', userId)
      .eq('season', CURRENT_SEASON)
      .is('opened_at', null)
      .order('created_at', { ascending: true })
      .order('reward_key', { ascending: true }),
  ]);
  return {
    coins: userRes.data?.coins ?? 0,
    cards: rows.map(toCardView),
    packs: (packsRes.data ?? []) as PackView[],
  };
}

/** Réservoir de tirage : joueurs actifs qui ont joué cette saison. */
export async function loadDrawPool(supabase: SupabaseClient): Promise<PoolPlayer[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id, position')
    .eq('is_active', true)
    .gt('season_avg_fantasy', 0);
  if (error) throw new Error(error.message);
  return (data ?? []) as PoolPlayer[];
}

export interface StarterPacksResult { created: number; reason?: 'no_pool' }

/**
 * Crée les 5 paquets de départ du compte, une seule fois grâce à reward_key (1 à 5).
 * Idempotent : les paquets déjà présents sont conservés. `autoOpen` ouvre les paquets
 * d'office (bots). Les cartes sont tirées à la création, elles restent cachées tant que le paquet est fermé.
 */
export async function ensureStarterPacks(
  supabase: SupabaseClient,
  userId: string,
  options: { autoOpen?: boolean } = {}
): Promise<StarterPacksResult> {
  const { data: existing, error: existingErr } = await supabase
    .from('card_packs')
    .select('reward_key')
    .eq('user_id', userId)
    .eq('season', CURRENT_SEASON)
    .eq('source', 'starter');
  if (existingErr) throw new Error(existingErr.message);

  const have = new Set((existing ?? []).map(p => p.reward_key as string));
  let created = 0;

  if (have.size < STARTER_PACKS) {
    const pool = await loadDrawPool(supabase);
    if (pool.length === 0) return { created: 0, reason: 'no_pool' };

    const drawn = drawStarterPacks(pool, Math.random);
    const now = new Date().toISOString();

    for (let i = 0; i < STARTER_PACKS; i++) {
      const key = String(i + 1);
      if (have.has(key)) continue;

      const { data: pack, error: packErr } = await supabase
        .from('card_packs')
        .insert({
          user_id: userId, season: CURRENT_SEASON, source: 'starter', quality: 'standard', reward_key: key,
          opened_at: options.autoOpen ? now : null,
        })
        .select('id')
        .single();
      // 23505 : un autre appel a créé ce paquet entre-temps, on le laisse faire.
      if (packErr) {
        if (packErr.code === '23505') continue;
        throw new Error(packErr.message);
      }

      const { error: cardsErr } = await supabase.from('player_cards').insert(
        drawn[i].map(c => ({
          user_id: userId, player_id: c.player_id, rarity: c.rarity, season: CURRENT_SEASON, pack_id: pack.id,
        }))
      );
      if (cardsErr) {
        // Pas de paquet vide : on le retire pour que le prochain appel le recrée.
        await supabase.from('card_packs').delete().eq('id', pack.id);
        throw new Error(cardsErr.message);
      }
      created++;
    }
  }

  if (options.autoOpen) {
    const { error } = await supabase
      .from('card_packs')
      .update({ opened_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('season', CURRENT_SEASON)
      .is('opened_at', null);
    if (error) throw new Error(error.message);
  }
  return { created };
}

/**
 * Ouvre un paquet du compte et renvoie ses cartes. Rejouer l'appel renvoie les mêmes cartes.
 * Renvoie null si le paquet n'existe pas ou n'appartient pas à ce compte.
 */
export async function openPack(supabase: SupabaseClient, userId: string, packId: string): Promise<CardView[] | null> {
  const { data: pack, error } = await supabase
    .from('card_packs')
    .select('id, user_id, opened_at')
    .eq('id', packId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pack || pack.user_id !== userId) return null;

  const readCards = async () => {
    const { data, error: cardsErr } = await supabase
      .from('player_cards')
      .select(CARD_SELECT)
      .eq('pack_id', packId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (cardsErr) throw new Error(cardsErr.message);
    return (data ?? []) as unknown as CardRow[];
  };

  if (!pack.opened_at) {
    const cards = await readCards();
    if (cards.length === 0) throw new Error('Paquet sans carte');
    // Ouverture conditionnelle : si un autre appel a gagné la course, la relecture donne les mêmes cartes.
    const { error: updErr } = await supabase
      .from('card_packs')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', packId)
      .is('opened_at', null);
    if (updErr) throw new Error(updErr.message);
  }

  // Relecture après ouverture : obtained_at reflète la date réelle d'ouverture.
  return (await readCards()).map(toCardView);
}

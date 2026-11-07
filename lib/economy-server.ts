// Économie des cartes, côté serveur : appels aux fonctions Postgres sell_cards, buy_pack et upgrade_card
// (migration 2026-11-08_economy.sql) avec db() (service_role). Routes API uniquement.
import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_SEASON } from '@/lib/sports-api';
import { PACK_PRICE, drawPack, upgradeError, type Rarity } from '@/lib/cards';
import type { ScoringCard } from '@/lib/card-scoring';
import { economyError, lockedCardIds, lockedError, sellValues, upgradePlan, upgradeSelectionError } from '@/lib/economy';
import { loadDrawPool, loadSeasonCardRows, toScoringCard } from '@/lib/collection';
import { getPlayableWeek } from '@/lib/week-scoring';

export interface LockInfo {
  /** Cartes qui jouent dans la journée verrouillée en cours. Vide hors verrou. */
  ids: Set<string>;
  /** Journée verrouillée en cours, ou null. */
  lockedWeek: number | null;
  /** Première journée dont les compositions peuvent encore changer. */
  openWeek: number;
}

/** Cartes verrouillées du compte. Le verrou tombe quand tous les matchs de la journée sont joués. */
export async function loadLockInfo(supabase: SupabaseClient, userId: string): Promise<LockInfo> {
  const { week, lockAt, isLocked } = await getPlayableWeek(supabase);
  if (!isLocked || !lockAt) return { ids: new Set(), lockedWeek: null, openWeek: week };

  // Ligues où le compte a un duel cette journée
  const { data: duels, error: duelsErr } = await supabase
    .from('weekly_matchups')
    .select('league_id')
    .eq('season', CURRENT_SEASON)
    .eq('week', week)
    .or(`home_user_id.eq.${userId},away_user_id.eq.${userId}`);
  if (duelsErr) throw new Error(duelsErr.message);
  const leagueIds = Array.from(new Set((duels ?? []).map(d => d.league_id as string)));

  const rows = await loadSeasonCardRows(supabase, [userId]);
  const cards = rows.map(toScoringCard).filter((c): c is ScoringCard => c !== null);

  const savedByLeague: (string[] | null)[] = [];
  if (leagueIds.length > 0) {
    const { data: lineups, error } = await supabase
      .from('weekly_lineups')
      .select('league_id, week, starter_card_ids')
      .eq('user_id', userId)
      .in('league_id', leagueIds)
      .lte('week', week)
      .not('starter_card_ids', 'is', null);
    if (error) throw new Error(error.message);
    const latest = new Map<string, { week: number; ids: string[] }>();
    for (const l of lineups ?? []) {
      const cur = latest.get(l.league_id as string);
      if (!cur || (l.week as number) > cur.week) latest.set(l.league_id as string, { week: l.week as number, ids: l.starter_card_ids ?? [] });
    }
    for (const id of leagueIds) savedByLeague.push(latest.get(id)?.ids ?? null);
  }

  return { ids: lockedCardIds(savedByLeague, cards, new Date(lockAt).getTime()), lockedWeek: week, openWeek: week + 1 };
}

export type EconomyResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

const fail = (code: string | undefined): { ok: false; status: number; error: string } => {
  const e = economyError(code);
  return { ok: false, status: e.status, error: e.message };
};

/** Vend des cartes. Le montant est calculé en base depuis la rareté réelle des cartes. */
export async function sellCards(
  supabase: SupabaseClient,
  userId: string,
  cardIds: string[]
): Promise<EconomyResult<{ coins: number; amount: number }>> {
  const lock = await loadLockInfo(supabase, userId);
  const locked = lockedError(cardIds, lock.ids);
  if (locked) return { ok: false, status: 423, error: locked };

  const { data, error } = await supabase.rpc('sell_cards', {
    p_user: userId,
    p_season: CURRENT_SEASON,
    p_card_ids: cardIds,
    p_values: sellValues(),
    p_locked_ids: Array.from(lock.ids),
    p_locked_week: lock.lockedWeek,
  });
  if (error) throw new Error(error.message);
  const res = data as { ok: boolean; error?: string; coins?: number; amount?: number };
  if (!res?.ok) return fail(res?.error);
  return { ok: true, coins: res.coins ?? 0, amount: res.amount ?? 0 };
}

/** Achète un paquet standard au prix PACK_PRICE. Solde insuffisant : refus sans erreur technique. */
export async function buyPack(
  supabase: SupabaseClient,
  userId: string
): Promise<EconomyResult<{ coins: number; packId: string }>> {
  const pool = await loadDrawPool(supabase);
  if (pool.length === 0) return { ok: false, status: 503, error: 'Aucun paquet disponible pour l’instant' };
  const cards = drawPack(pool, Math.random, 'standard');

  const { data, error } = await supabase.rpc('buy_pack', {
    p_user: userId, p_season: CURRENT_SEASON, p_price: PACK_PRICE, p_cards: cards,
  });
  if (error) throw new Error(error.message);
  const res = data as { ok: boolean; error?: string; coins?: number; pack_id?: string };
  if (!res?.ok) return fail(res?.error);
  return { ok: true, coins: res.coins ?? 0, packId: res.pack_id ?? '' };
}

/**
 * Améliore une carte en sacrifiant des cartes de même rareté. La carte d'origine n'est jamais modifiée :
 * elle est consommée et une nouvelle carte est créée (voir la fonction SQL upgrade_card).
 * `rarityOf` donne la rareté réelle des cartes du compte, lue en base par la route.
 */
export async function upgradeCard(
  supabase: SupabaseClient,
  userId: string,
  cardId: string,
  sacrificeCardIds: string[],
  rarityOf: Map<string, Rarity>
): Promise<EconomyResult<{ cardId: string }>> {
  const selectionError = upgradeSelectionError(cardId, sacrificeCardIds);
  if (selectionError) return { ok: false, status: 400, error: selectionError };
  const target = rarityOf.get(cardId);
  if (!target) return fail('carte_indisponible');
  const sacrificeRarities: Rarity[] = [];
  for (const id of sacrificeCardIds) {
    const r = rarityOf.get(id);
    if (!r) return fail('carte_indisponible');
    sacrificeRarities.push(r);
  }
  const invalid = upgradeError(target, sacrificeRarities);
  if (invalid) return { ok: false, status: 400, error: invalid };
  const plan = upgradePlan(target)!;

  const lock = await loadLockInfo(supabase, userId);
  const locked = lockedError([cardId].concat(sacrificeCardIds), lock.ids);
  if (locked) return { ok: false, status: 423, error: locked };

  const { data, error } = await supabase.rpc('upgrade_card', {
    p_user: userId,
    p_season: CURRENT_SEASON,
    p_card: cardId,
    p_sacrifices: sacrificeCardIds,
    p_from: target,
    p_to: plan.to,
    p_required: plan.cost,
    p_locked_ids: Array.from(lock.ids),
    p_locked_week: lock.lockedWeek,
    p_open_week: lock.openWeek,
  });
  if (error) throw new Error(error.message);
  const res = data as { ok: boolean; error?: string; card_id?: string };
  if (!res?.ok) return fail(res?.error);
  return { ok: true, cardId: res.card_id ?? '' };
}

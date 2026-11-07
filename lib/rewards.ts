// Gains de paquets : un seul point d'entrée, idempotent. Écritures via db() (service_role) uniquement,
// depuis les API Routes. La création du paquet et de ses cartes est atomique (fonction SQL grant_pack).
import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_SEASON } from '@/lib/sports-api';
import { drawPack, type PackQuality, type PackSource, type PoolPlayer, type Rng } from '@/lib/cards';
import { loadDrawPool } from '@/lib/collection';
import { allMissionsDone, evaluateMissions } from '@/lib/missions';
import type { UserWeekStats } from '@/lib/card-scoring';

/** Du moins bon au meilleur. */
export const PACK_QUALITIES: PackQuality[] = ['standard', 'argent', 'or'];

export const qualityRank = (q: PackQuality): number => PACK_QUALITIES.indexOf(q);

/** Qualités strictement moins bonnes que `q` : un paquet fermé de l'une d'elles est remplacé. */
export const worseQualities = (q: PackQuality): PackQuality[] => PACK_QUALITIES.slice(0, qualityRank(q));

export interface GrantPackArgs {
  userId: string;
  source: PackSource;
  /** La journée (ou le numéro du paquet de départ). null pour un achat. */
  rewardKey: string | null;
  quality: PackQuality;
  /** Paquet ouvert d'office (comptes bots). */
  autoOpen?: boolean;
  /** Réservoir déjà chargé, pour éviter de le relire à chaque gain d'une série. */
  pool?: PoolPlayer[];
  rng?: Rng;
}

export type GrantStatus = 'created' | 'replaced' | 'kept';
export interface GrantResult { status: GrantStatus; packId: string }

/**
 * Crée un paquet de 5 cartes tirées via drawPack. Idempotent grâce à l'index unique
 * (compte, saison, source, reward_key) : un même compte ne reçoit jamais deux fois le même gain
 * pour la même journée, quel que soit le nombre de ses ligues.
 * Si le paquet existe, encore fermé et de moins bonne qualité, ses cartes sont remplacées
 * (meilleur résultat parmi les ligues). S'il est déjà ouvert ou d'égale qualité, rien ne change.
 */
export async function grantPack(supabase: SupabaseClient, args: GrantPackArgs): Promise<GrantResult> {
  const pool = args.pool ?? (await loadDrawPool(supabase));
  if (pool.length === 0) throw new Error('Aucun joueur à tirer');
  const cards = drawPack(pool, args.rng ?? Math.random, args.quality);

  const { data, error } = await supabase.rpc('grant_pack', {
    p_user: args.userId,
    p_season: CURRENT_SEASON,
    p_source: args.source,
    p_reward_key: args.rewardKey,
    p_quality: args.quality,
    p_cards: cards,
    p_open: args.autoOpen === true,
    p_replace_qualities: worseQualities(args.quality),
  });
  if (error) throw new Error(error.message);
  const res = data as { ok: boolean; error?: string; status?: GrantStatus; pack_id?: string } | null;
  if (!res?.ok || !res.status || !res.pack_id) throw new Error(res?.error ?? 'Gain refusé');
  return { status: res.status, packId: res.pack_id };
}

/** Un compte bot est un utilisateur dont l'email finit par @system.internal. */
export async function getBotUserIds(supabase: SupabaseClient, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data } = await supabase.from('users').select('id, email').in('id', userIds);
  return (data ?? [])
    .filter((u: { email: string | null }) => (u.email ?? '').endsWith('@system.internal'))
    .map((u: { id: string }) => u.id);
}

/**
 * Gains au règlement d'une journée d'une ligue : paquet de victoire au vainqueur de chaque duel réglé
 * (ni bot, ni égalité), paquet de mission à qui réussit les trois missions. Ne lève jamais d'erreur :
 * un échec est journalisé et ne doit pas empêcher le règlement. Les gains sont idempotents, un nouvel
 * appel complète ce qui manque.
 */
export async function grantSettlementRewards(
  supabase: SupabaseClient,
  leagueId: string,
  week: number,
  stats: Map<string, UserWeekStats>
): Promise<void> {
  try {
    const [{ data: matchups }, { data: lineups }] = await Promise.all([
      supabase
        .from('weekly_matchups')
        .select('home_user_id, away_user_id, winner_user_id')
        .eq('league_id', leagueId)
        .eq('season', CURRENT_SEASON)
        .eq('week', week)
        .not('settled_at', 'is', null),
      supabase
        .from('weekly_lineups')
        .select('user_id')
        .eq('league_id', leagueId)
        .eq('week', week)
        .not('starter_card_ids', 'is', null),
    ]);
    if (!matchups?.length) return;

    const userIds = Array.from(new Set(matchups.flatMap(m => [m.home_user_id as string, m.away_user_id as string])));
    const bots = new Set(await getBotUserIds(supabase, userIds));
    const placed = new Set((lineups ?? []).map(l => l.user_id as string));
    const pool = await loadDrawPool(supabase);
    const key = String(week);

    for (const userId of userIds) {
      if (bots.has(userId)) continue;
      const won = matchups.some(m => m.winner_user_id === userId);
      const missions = evaluateMissions({
        lineupPlaced: placed.has(userId),
        won,
        starterPoints: (stats.get(userId)?.starters ?? []).map(s => s.points),
      });
      const rewards: PackSource[] = [];
      if (won) rewards.push('victoire');
      if (allMissionsDone(missions)) rewards.push('mission');

      for (const source of rewards) {
        try {
          await grantPack(supabase, { userId, source, rewardKey: key, quality: 'standard', pool });
        } catch (e) {
          console.error('rewards: gain refusé', { leagueId, week, userId, source }, e);
        }
      }
    }
  } catch (e) {
    console.error('rewards: règlement', { leagueId, week }, e);
  }
}

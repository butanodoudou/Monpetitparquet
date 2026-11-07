// ─── Loterie du lundi : helpers serveur (routes API uniquement) ─
// Toutes les écritures passent par db() (service_role). Ne jamais importer ce fichier côté navigateur.

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_SEASON } from '@/lib/sports-api';
import { loadDrawPool } from '@/lib/collection';
import { getBotUserIds, grantPack } from '@/lib/rewards';
import { standingsFromDuels, type QualifiedEntry, type SettledDuel, type StandingInput } from '@/lib/lottery';

export { getBotUserIds };

export interface SessionRow {
  id: string;
  league_id: string;
  week: number;
  // « live » n'existe plus : seules les anciennes sessions du tirage tour par tour peuvent encore l'avoir
  status: 'scheduled' | 'live' | 'done' | 'cancelled';
  draw_order: { user_id: string; tickets: number; pick: number; quality?: string }[] | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/** Secret du cron : en-tête Bearer, en-tête x-cron-secret ou ?secret=. Refuse si CRON_SECRET n'est pas défini. */
export function isCronAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '');
  const provided = bearer ?? req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret');
  return provided === expected;
}

export async function getMembership(supabase: SupabaseClient, leagueId: string, userId: string) {
  const { data: league } = await supabase
    .from('leagues')
    .select('id, commissioner_id, draft_status')
    .eq('id', leagueId)
    .maybeSingle();
  if (!league) return null;
  const { data: member } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member) return null;
  return { league, isCommissioner: league.commissioner_id === userId };
}

/** Session la plus récente de la ligue (la semaine la plus haute). */
export async function getLatestSession(supabase: SupabaseClient, leagueId: string): Promise<SessionRow | null> {
  const { data } = await supabase
    .from('lottery_sessions')
    .select('id, league_id, week, status, draw_order, started_at, ended_at, created_at')
    .eq('league_id', leagueId)
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SessionRow | null) ?? null;
}

/**
 * Classement de la ligue au moment de la session : victoires de duels puis points marqués,
 * depuis les duels réglés (weekly_matchups) des journées <= week. Ne lit plus team_players.
 */
export async function computeLeagueStats(
  supabase: SupabaseClient,
  leagueId: string,
  memberIds: string[],
  week: number,
): Promise<StandingInput[]> {
  const { data, error } = await supabase
    .from('weekly_matchups')
    .select('home_user_id, away_user_id, winner_user_id, home_score, away_score')
    .eq('league_id', leagueId)
    .eq('season', CURRENT_SEASON)
    .lte('week', week)
    .not('settled_at', 'is', null);
  if (error) throw new Error(error.message);
  return standingsFromDuels(memberIds, (data ?? []) as SettledDuel[]);
}

/**
 * Donne à chaque manager son paquet de la journée avec la qualité tirée. Idempotent : rejouer l'appel ne
 * crée rien de plus. Les paquets des bots sont ouverts d'office. Renvoie les comptes dont le gain a échoué
 * (journalisé), pour que l'appelant puisse réessayer sans bloquer la loterie.
 */
export async function grantLotteryPacks(
  supabase: SupabaseClient,
  session: Pick<SessionRow, 'id' | 'league_id' | 'week'>,
  order: QualifiedEntry[],
): Promise<string[]> {
  const pool = await loadDrawPool(supabase);
  const bots = new Set(await getBotUserIds(supabase, order.map(o => o.user_id)));
  const failed: string[] = [];
  for (const entry of order) {
    try {
      await grantPack(supabase, {
        userId: entry.user_id,
        source: 'lundi',
        rewardKey: String(session.week),
        quality: entry.quality,
        autoOpen: bots.has(entry.user_id),
        pool,
      });
    } catch (e) {
      failed.push(entry.user_id);
      console.error('lottery: gain du paquet', { league: session.league_id, week: session.week, user: entry.user_id }, e);
    }
  }
  return failed;
}

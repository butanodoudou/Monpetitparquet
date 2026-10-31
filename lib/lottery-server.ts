// ─── Loterie du lundi : helpers serveur (routes API uniquement) ─
// Toutes les écritures passent par db() (service_role). Ne jamais importer ce fichier côté navigateur.

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_SEASON } from '@/lib/sports-api';
import { ROSTER_SIZE, type AuctionTier } from '@/lib/fantasy';
import type { LotteryOpenedPack, LotteryPlayer, LotteryRosterPlayer } from '@/lib/lottery-types';
import {
  LOTTERY_PICK_SECONDS,
  groupOf,
  validatePick,
  type RosterPlayer,
  type StandingInput,
} from '@/lib/lottery';

export interface SessionRow {
  id: string;
  league_id: string;
  week: number;
  status: 'scheduled' | 'live' | 'done' | 'cancelled';
  draw_order: { user_id: string; tickets: number; pick: number }[] | null;
  current_pick: number;
  pick_deadline: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface PackRow {
  id: string;
  session_id: string;
  pack_number: number;
  player_ids: number[];
  player_tiers: string[];
  opened: boolean;
  opened_by: string | null;
  taken_by: string | null;
  chosen_player_id: number | null;
  released_player_id: number | null;
  taken_at: string | null;
}

export const PLAYER_COLUMNS =
  'id, name, team, position, photo_url, jersey_number, season_avg_fantasy, avg_points, avg_assists, avg_rebounds';

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
    .select('*')
    .eq('league_id', leagueId)
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SessionRow | null) ?? null;
}

/** Un compte bot est un utilisateur dont l'email finit par @system.internal. */
export async function getBotUserIds(supabase: SupabaseClient, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data } = await supabase.from('users').select('id, email').in('id', userIds);
  return (data ?? [])
    .filter((u: { email: string | null }) => (u.email ?? '').endsWith('@system.internal'))
    .map((u: { id: string }) => u.id);
}

export async function getRoster(supabase: SupabaseClient, leagueId: string, userId: string): Promise<RosterPlayer[]> {
  const { data } = await supabase
    .from('team_players')
    .select('player_id, player:players(position, season_avg_fantasy)')
    .eq('league_id', leagueId)
    .eq('user_id', userId);
  return (data ?? []).map((tp: any) => ({
    player_id: tp.player_id,
    position: tp.player?.position ?? null,
    season_avg_fantasy: tp.player?.season_avg_fantasy ?? 0,
  }));
}

/**
 * Classement de la ligue au moment de la session : victoires de duels (weekly_matchups.winner_user_id,
 * semaines <= week) puis points cumulés de la saison en cours des joueurs actuellement en équipe.
 */
export async function computeLeagueStats(
  supabase: SupabaseClient,
  leagueId: string,
  memberIds: string[],
  week: number,
): Promise<StandingInput[]> {
  const [{ data: tps }, { data: matchups }] = await Promise.all([
    supabase.from('team_players').select('user_id, player_id').eq('league_id', leagueId),
    supabase
      .from('weekly_matchups')
      .select('winner_user_id')
      .eq('league_id', leagueId)
      .eq('season', CURRENT_SEASON)
      .lte('week', week)
      .not('winner_user_id', 'is', null),
  ]);

  const owner: Record<number, string> = {};
  const playerIds: number[] = [];
  for (const tp of tps ?? []) { owner[tp.player_id] = tp.user_id; playerIds.push(tp.player_id); }

  const points: Record<string, number> = {};
  if (playerIds.length > 0) {
    const { data: perfs } = await supabase
      .from('player_performances')
      .select('player_id, fantasy_score, match:matches!inner(status, season)')
      .in('player_id', playerIds)
      .eq('match.season', CURRENT_SEASON);
    for (const p of (perfs ?? []) as any[]) {
      if (p.match?.status !== 'finished') continue;
      const uid = owner[p.player_id];
      if (uid) points[uid] = (points[uid] ?? 0) + (p.fantasy_score ?? 0);
    }
  }

  const wins: Record<string, number> = {};
  for (const m of matchups ?? []) {
    if (m.winner_user_id) wins[m.winner_user_id] = (wins[m.winner_user_id] ?? 0) + 1;
  }

  return memberIds.map(id => ({ user_id: id, wins: wins[id] ?? 0, points: points[id] ?? 0 }));
}

export type ApplyPickResult =
  | { ok: true; status: string; current_pick: number; pick_deadline: string | null }
  | { ok: false; status: number; error: string };

/**
 * Valide un pick (pack ouvert par ce manager, joueur du pack, relâche cohérente avec ROSTER_SLOTS)
 * puis appelle la fonction SQL lottery_apply_pick, qui fait le swap de façon atomique.
 */
export async function applyLotteryPick(
  supabase: SupabaseClient,
  session: SessionRow,
  args: { packId: string; userId: string; playerId: number; releasePlayerId: number | null },
): Promise<ApplyPickResult> {
  const { data: pack } = await supabase
    .from('lottery_packs')
    .select('*')
    .eq('id', args.packId)
    .eq('session_id', session.id)
    .maybeSingle();
  if (!pack) return { ok: false, status: 404, error: 'Pack introuvable' };
  const p = pack as PackRow;
  if (!p.opened || p.opened_by !== args.userId || p.taken_by) {
    return { ok: false, status: 409, error: "Ce pack n'est pas disponible" };
  }
  if (p.player_ids.indexOf(args.playerId) === -1) {
    return { ok: false, status: 400, error: "Ce joueur ne fait pas partie du pack" };
  }

  const [roster, { data: incoming }] = await Promise.all([
    getRoster(supabase, session.league_id, args.userId),
    supabase.from('players').select('id, position').eq('id', args.playerId).maybeSingle(),
  ]);
  if (!incoming) return { ok: false, status: 400, error: 'Joueur introuvable' };

  const check = validatePick(roster, incoming.position ?? null, args.releasePlayerId, ROSTER_SIZE);
  if (!check.ok) return { ok: false, status: 400, error: check.error };

  const { data, error } = await supabase.rpc('lottery_apply_pick', {
    p_session_id: session.id,
    p_pack_id: args.packId,
    p_user_id: args.userId,
    p_player_id: args.playerId,
    p_release_player_id: args.releasePlayerId,
    p_expected_pick: session.current_pick,
    p_roster_size: ROSTER_SIZE,
    p_pick_seconds: LOTTERY_PICK_SECONDS,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.indexOf('pick_conflict') !== -1) return { ok: false, status: 409, error: 'Un autre pick vient d\'être enregistré' };
    if (msg.indexOf('pas_ton_tour') !== -1) return { ok: false, status: 403, error: "Ce n'est pas ton tour" };
    if (msg.indexOf('pack_indisponible') !== -1 || msg.indexOf('pack_introuvable') !== -1) {
      return { ok: false, status: 409, error: "Ce pack n'est plus disponible" };
    }
    if (msg.indexOf('joueur_hors_pack') !== -1) return { ok: false, status: 400, error: 'Ce joueur ne fait pas partie du pack' };
    if (msg.indexOf('relache_invalide') !== -1) return { ok: false, status: 400, error: "Le joueur à relâcher n'est plus dans ton équipe" };
    if (msg.indexOf('roster_plein') !== -1) return { ok: false, status: 400, error: 'Ton équipe est complète : relâche un joueur' };
    if (error.code === '23505') return { ok: false, status: 409, error: 'Ce joueur vient d\'être pris dans la ligue' };
    console.error('lottery_apply_pick', error);
    return { ok: false, status: 500, error: 'Erreur serveur pendant le pick' };
  }

  // Un titulaire relâché ne doit pas rester dans une composition enregistrée pour une semaine à venir :
  // on supprime la composition (le cinq par défaut est alors recalculé via computeDefaultStarters).
  // Les compositions des semaines déjà jouées ne sont pas touchées. Meilleur effort : un échec ici
  // n'annule pas le pick.
  if (args.releasePlayerId !== null) {
    const { error: lineupError } = await supabase
      .from('weekly_lineups')
      .delete()
      .eq('league_id', session.league_id)
      .eq('user_id', args.userId)
      .gt('week', session.week)
      .contains('starter_player_ids', [args.releasePlayerId]);
    if (lineupError) console.error('lottery: nettoyage weekly_lineups', lineupError.message);
  }

  const res = data as { status: string; current_pick: number; pick_deadline: string | null };
  return { ok: true, status: res.status, current_pick: res.current_pick, pick_deadline: res.pick_deadline };
}

// ─── Mise en forme pour le client ──────────────────────────────

export function toLotteryPlayer(row: any, tier: string): LotteryPlayer {
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    position: row.position ?? null,
    group: groupOf(row.position),
    photo_url: row.photo_url ?? null,
    jersey_number: row.jersey_number ?? null,
    season_avg_fantasy: row.season_avg_fantasy ?? 0,
    tier: (tier === 'elite' || tier === 'star' ? tier : 'basique') as AuctionTier,
  };
}

export function toRosterPlayer(row: any): LotteryRosterPlayer {
  return {
    id: row.id,
    name: row.name,
    team: row.team,
    position: row.position ?? null,
    group: groupOf(row.position),
    season_avg_fantasy: row.season_avg_fantasy ?? 0,
  };
}

/** Pack ouvert : les cartes dans l'ordre du pack, chacune avec son tier. */
export function buildOpenedPack(pack: PackRow, players: any[]): LotteryOpenedPack {
  const byId: Record<number, any> = {};
  for (const p of players) byId[p.id] = p;
  const cards: LotteryPlayer[] = [];
  pack.player_ids.forEach((id, i) => {
    if (byId[id]) cards.push(toLotteryPlayer(byId[id], pack.player_tiers[i]));
  });
  return { id: pack.id, pack_number: pack.pack_number, players: cards };
}

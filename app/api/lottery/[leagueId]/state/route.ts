import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { firstPickOdds, isFallbackStartOpen } from '@/lib/lottery';
import {
  PLAYER_COLUMNS, buildOpenedPack, getBotUserIds, getLatestSession, getMembership, jsonError,
  toLotteryPlayer, toRosterPlayer, type PackRow,
} from '@/lib/lottery-server';
import type { LotteryEvent, LotteryPackView, LotteryState } from '@/lib/lottery-types';

export const dynamic = 'force-dynamic';

// État complet de la loterie pour le manager connecté.
// Garantie : player_ids d'un pack n'est jamais renvoyé avant son ouverture, et un pack ouvert mais pas
// encore pris n'est détaillé qu'à celui qui l'a ouvert. Pour les packs pris, seuls le joueur gardé et
// le joueur relâché sortent, pas les autres cartes.
export async function GET(req: NextRequest, { params }: { params: { leagueId: string } }) {
  const auth = getAuth(req);
  if (!auth) return jsonError('Non authentifié', 401);

  const supabase = db();
  const membership = await getMembership(supabase, params.leagueId, auth.userId);
  if (!membership) return jsonError('Accès refusé', 403);

  const session = await getLatestSession(supabase, params.leagueId);
  const now = new Date();

  const empty: LotteryState = {
    server_now: now.toISOString(),
    session: null,
    is_commissioner: membership.isCommissioner,
    can_start: false,
    members: [],
    total_tickets: 0,
    order: [],
    current_user_id: null,
    packs: [],
    my_open_pack: null,
    my_roster: [],
    events: [],
  };
  if (!session) return NextResponse.json(empty);

  const [{ data: tickets }, { data: memberRows }, { data: packRows }, { data: rosterRows }] = await Promise.all([
    supabase.from('lottery_tickets').select('user_id, tickets, rank').eq('session_id', session.id),
    supabase
      .from('league_members')
      .select('user_id, team_name, user:users(username, avatar_color)')
      .eq('league_id', params.leagueId),
    supabase.from('lottery_packs').select('*').eq('session_id', session.id).order('pack_number', { ascending: true }),
    supabase.from('team_players').select('player_id').eq('league_id', params.leagueId).eq('user_id', auth.userId),
  ]);

  const packs = (packRows ?? []) as PackRow[];
  const myOpen = packs.find(p => p.opened && !p.taken_by && p.opened_by === auth.userId) ?? null;

  // Un seul aller-retour pour tous les joueurs à afficher
  const wantedIds: Record<number, true> = {};
  for (const p of packs) {
    if (p.chosen_player_id) wantedIds[p.chosen_player_id] = true;
    if (p.released_player_id) wantedIds[p.released_player_id] = true;
  }
  if (myOpen) for (const id of myOpen.player_ids) wantedIds[id] = true;
  for (const r of rosterRows ?? []) wantedIds[r.player_id as number] = true;
  const ids = Object.keys(wantedIds).map(Number);
  const { data: playerRows } = ids.length
    ? await supabase.from('players').select(PLAYER_COLUMNS).in('id', ids)
    : { data: [] as any[] };
  const playerById: Record<number, any> = {};
  for (const p of playerRows ?? []) playerById[p.id] = p;

  const ticketByUser: Record<string, { tickets: number; rank: number }> = {};
  for (const t of tickets ?? []) ticketByUser[t.user_id as string] = { tickets: t.tickets, rank: t.rank };
  const odds = firstPickOdds((tickets ?? []).map(t => ({ user_id: t.user_id as string, tickets: t.tickets as number })));
  const botIds = await getBotUserIds(supabase, (memberRows ?? []).map(m => m.user_id as string));

  const members = (memberRows ?? [])
    .filter(m => ticketByUser[m.user_id as string])
    .map(m => {
      const u = m.user as unknown as { username: string; avatar_color: string } | null;
      const t = ticketByUser[m.user_id as string];
      return {
        user_id: m.user_id as string,
        username: u?.username ?? '?',
        team_name: (m.team_name as string | null) ?? null,
        avatar_color: u?.avatar_color ?? '#F59E0B',
        is_bot: botIds.indexOf(m.user_id as string) !== -1,
        tickets: t.tickets,
        rank: t.rank,
        odds: odds[m.user_id as string] ?? 0,
      };
    })
    .sort((a, b) => b.tickets - a.tickets || a.rank - b.rank);
  const nameById: Record<string, string> = {};
  for (const m of members) nameById[m.user_id] = m.username;

  const tierOf = (p: PackRow, playerId: number | null) => {
    const i = playerId ? p.player_ids.indexOf(playerId) : -1;
    return i >= 0 ? p.player_tiers[i] : 'basique';
  };

  const packViews: LotteryPackView[] = packs.map(p => ({
    id: p.id,
    pack_number: p.pack_number,
    opened: p.opened,
    opened_by: p.opened_by,
    taken_by: p.taken_by,
    chosen: p.chosen_player_id && playerById[p.chosen_player_id]
      ? toLotteryPlayer(playerById[p.chosen_player_id], tierOf(p, p.chosen_player_id))
      : null,
    released: p.released_player_id && playerById[p.released_player_id]
      ? toRosterPlayer(playerById[p.released_player_id])
      : null,
  }));

  const pickByUser: Record<string, number> = {};
  for (const e of session.draw_order ?? []) pickByUser[e.user_id] = e.pick;

  const events: LotteryEvent[] = packs
    .filter(p => p.taken_by)
    .map(p => ({
      pick: pickByUser[p.taken_by as string] ?? 0,
      user_id: p.taken_by as string,
      username: nameById[p.taken_by as string] ?? '?',
      pack_number: p.pack_number,
      chosen: packViews.find(v => v.id === p.id)?.chosen ?? null,
      released: packViews.find(v => v.id === p.id)?.released ?? null,
      taken_at: p.taken_at,
    }))
    .sort((a, b) => a.pick - b.pick);

  const current = session.status === 'live'
    ? session.draw_order?.find(e => e.pick === session.current_pick) ?? null
    : null;

  const state: LotteryState = {
    server_now: now.toISOString(),
    session: {
      id: session.id,
      week: session.week,
      status: session.status,
      current_pick: session.current_pick,
      pick_deadline: session.pick_deadline,
      started_at: session.started_at,
      ended_at: session.ended_at,
      created_at: session.created_at,
      total_picks: session.draw_order?.length ?? members.length,
    },
    is_commissioner: membership.isCommissioner,
    can_start:
      session.status === 'scheduled' &&
      (membership.isCommissioner || isFallbackStartOpen(new Date(session.created_at), now)),
    members,
    total_tickets: members.reduce((s, m) => s + m.tickets, 0),
    order: session.draw_order ?? [],
    current_user_id: current?.user_id ?? null,
    packs: packViews,
    my_open_pack: myOpen ? buildOpenedPack(myOpen, ids.length ? (playerRows ?? []) : []) : null,
    my_roster: (rosterRows ?? [])
      .map(r => playerById[r.player_id as number])
      .filter(Boolean)
      .map(toRosterPlayer),
    events,
  };

  return NextResponse.json(state);
}

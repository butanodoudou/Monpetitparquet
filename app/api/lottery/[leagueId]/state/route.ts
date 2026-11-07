import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { CURRENT_SEASON } from '@/lib/sports-api';
import type { PackQuality } from '@/lib/cards';
import { firstPickOdds, isFallbackStartOpen, orderRevealDurationMs, withQualities } from '@/lib/lottery';
import { getBotUserIds, getLatestSession, getMembership, jsonError } from '@/lib/lottery-server';
import type { LotteryMyPack, LotteryState } from '@/lib/lottery-types';

export const dynamic = 'force-dynamic';

// État de la loterie pour le manager connecté : tickets, ordre tiré avec la qualité de chacun,
// et son paquet de la journée (le meilleur résultat parmi ses ligues).
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
    reveal_ms: 0,
    my_pack: null,
  };
  if (!session) return NextResponse.json(empty);

  const [{ data: tickets }, { data: memberRows }, { data: packRow }] = await Promise.all([
    supabase.from('lottery_tickets').select('user_id, tickets, rank').eq('session_id', session.id),
    supabase
      .from('league_members')
      .select('user_id, team_name, user:users(username, avatar_color)')
      .eq('league_id', params.leagueId),
    supabase
      .from('card_packs')
      .select('id, quality, opened_at')
      .eq('user_id', auth.userId)
      .eq('season', CURRENT_SEASON)
      .eq('source', 'lundi')
      .eq('reward_key', String(session.week))
      .maybeSingle(),
  ]);

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

  // Une ancienne session « live » (tirage tour par tour) n'a pas de tirage utilisable : elle compte comme programmée.
  const drawn = session.status === 'done';
  const order = drawn
    ? withQualities((session.draw_order ?? []).map(e => ({ user_id: e.user_id, tickets: e.tickets, pick: e.pick })))
    : [];
  const status = drawn ? 'done' : session.status === 'cancelled' ? 'cancelled' : 'scheduled';

  const myPack: LotteryMyPack | null = drawn && packRow
    ? { id: packRow.id as string, quality: packRow.quality as PackQuality, opened: packRow.opened_at !== null }
    : null;

  const state: LotteryState = {
    server_now: now.toISOString(),
    session: {
      id: session.id,
      week: session.week,
      status,
      started_at: session.started_at,
      ended_at: session.ended_at,
      created_at: session.created_at,
      total_picks: order.length || members.length,
    },
    is_commissioner: membership.isCommissioner,
    can_start:
      status === 'scheduled' &&
      (membership.isCommissioner || isFallbackStartOpen(new Date(session.created_at), now)),
    members,
    total_tickets: members.reduce((s, m) => s + m.tickets, 0),
    order,
    reveal_ms: drawn ? orderRevealDurationMs(order.length) : 0,
    my_pack: myPack,
  };

  return NextResponse.json(state);
}

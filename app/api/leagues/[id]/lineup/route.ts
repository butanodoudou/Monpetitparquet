import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  STARTER_SLOTS, POSITION_GROUP_MAP, computeDefaultStarters,
  type PositionGroup,
} from '@/lib/fantasy';

function isLineupLocked(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  if (day === 5 && hour >= 22) return true;
  if (day === 6 || day === 0) return true;
  return false;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  const { data: weekRow } = await supabase
    .from('matches').select('week').eq('status', 'finished')
    .order('week', { ascending: false }).limit(1).maybeSingle();
  const currentWeek = weekRow?.week ?? 1;

  const [{ data: tps }, { data: lineupRow }] = await Promise.all([
    supabase
      .from('team_players')
      .select('player_id, player:players(id, name, position, photo_url, jersey_number, season_avg_fantasy, avg_points, avg_assists, avg_rebounds)')
      .eq('league_id', leagueId)
      .eq('user_id', auth.userId),
    supabase
      .from('weekly_lineups')
      .select('starter_player_ids')
      .eq('league_id', leagueId)
      .eq('user_id', auth.userId)
      .eq('week', currentWeek)
      .maybeSingle(),
  ]);

  const players = (tps ?? []).map(tp => tp.player as any).filter(Boolean);

  let starterIds: number[] = lineupRow?.starter_player_ids ?? [];
  if (!starterIds.length && players.length > 0) {
    const roster = players.map((p: any) => ({
      player_id: p.id,
      position: p.position ?? '',
      season_avg_fantasy: p.season_avg_fantasy ?? 0,
    }));
    starterIds = computeDefaultStarters(roster);
  }

  return NextResponse.json({ currentWeek, isLocked: isLineupLocked(), starterIds, players });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  if (isLineupLocked()) {
    return NextResponse.json({ error: 'Composition verrouillée jusqu\'à lundi' }, { status: 400 });
  }

  const { starterIds, week } = (await req.json()) as { starterIds: number[]; week: number };
  if (!Array.isArray(starterIds) || starterIds.length !== 5) {
    return NextResponse.json({ error: 'Il faut exactement 5 titulaires' }, { status: 400 });
  }

  const supabase = db();
  const leagueId = params.id;

  const { data: tps } = await supabase
    .from('team_players')
    .select('player_id, player:players(position)')
    .eq('league_id', leagueId)
    .eq('user_id', auth.userId);

  const rosterIds = new Set((tps ?? []).map(tp => tp.player_id));
  if (!starterIds.every(id => rosterIds.has(id))) {
    return NextResponse.json({ error: 'Joueur non dans ton roster' }, { status: 400 });
  }

  const posMap = new Map((tps ?? []).map(tp => [tp.player_id, (tp.player as any)?.position ?? '']));
  const groupCounts: Record<PositionGroup, number> = { arriere: 0, sf: 0, grand: 0 };
  for (const id of starterIds) {
    const group = POSITION_GROUP_MAP[posMap.get(id) ?? ''];
    if (group) groupCounts[group]++;
  }

  for (const [group, required] of Object.entries(STARTER_SLOTS) as [PositionGroup, number][]) {
    if (groupCounts[group] !== required) {
      const label = group === 'arriere' ? 'arrière(s)' : group === 'sf' ? 'SF' : 'grand(s)';
      return NextResponse.json({ error: `Il faut exactement ${required} ${label} titulaire(s)` }, { status: 400 });
    }
  }

  await supabase.from('weekly_lineups').upsert(
    { league_id: leagueId, user_id: auth.userId, week, starter_player_ids: starterIds, updated_at: new Date().toISOString() },
    { onConflict: 'league_id,user_id,week' }
  );

  return NextResponse.json({ ok: true });
}

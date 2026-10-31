import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  STARTER_SLOTS, POSITION_GROUP_MAP, computeDefaultStarters,
  type PositionGroup,
} from '@/lib/fantasy';
import { getPlayableWeek, isLeagueMember } from '@/lib/week-scoring';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  if (!(await isLeagueMember(supabase, leagueId, auth.userId))) {
    return NextResponse.json({ error: 'Tu n\'es pas membre de cette ligue' }, { status: 403 });
  }

  // La composition s'applique à la prochaine journée à jouer
  const { week: currentWeek, isLocked, lockAt } = await getPlayableWeek(supabase);

  const [{ data: tps }, { data: lineupRows }] = await Promise.all([
    supabase
      .from('team_players')
      .select('player_id, player:players(id, name, position, photo_url, jersey_number, season_avg_fantasy, avg_points, avg_assists, avg_rebounds)')
      .eq('league_id', leagueId)
      .eq('user_id', auth.userId),
    // Composition de la journée, sinon la dernière enregistrée
    supabase
      .from('weekly_lineups')
      .select('week, starter_player_ids')
      .eq('league_id', leagueId)
      .eq('user_id', auth.userId)
      .lte('week', currentWeek)
      .order('week', { ascending: false })
      .limit(1),
  ]);

  const players = (tps ?? []).map(tp => tp.player as any).filter(Boolean);
  const rosterIds = new Set<number>(players.map((p: any) => p.id));

  let starterIds: number[] = (lineupRows?.[0]?.starter_player_ids ?? []).filter((id: number) => rosterIds.has(id));
  if (starterIds.length !== 5 && players.length > 0) {
    const roster = players.map((p: any) => ({
      player_id: p.id,
      position: p.position ?? '',
      season_avg_fantasy: p.season_avg_fantasy ?? 0,
    }));
    starterIds = computeDefaultStarters(roster);
  }

  return NextResponse.json({ currentWeek, isLocked, lockAt, starterIds, players });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  if (!(await isLeagueMember(supabase, leagueId, auth.userId))) {
    return NextResponse.json({ error: 'Tu n\'es pas membre de cette ligue' }, { status: 403 });
  }

  // La journée est déterminée côté serveur (le client ne choisit pas)
  const { week, isLocked } = await getPlayableWeek(supabase);
  if (isLocked) {
    return NextResponse.json({ error: 'Composition verrouillée : la journée a commencé' }, { status: 423 });
  }

  const { starterIds } = (await req.json()) as { starterIds: number[] };
  if (!Array.isArray(starterIds) || starterIds.length !== 5 || new Set(starterIds).size !== 5) {
    return NextResponse.json({ error: 'Il faut exactement 5 titulaires distincts' }, { status: 400 });
  }

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

  const { error } = await supabase.from('weekly_lineups').upsert(
    { league_id: leagueId, user_id: auth.userId, week, starter_player_ids: starterIds, updated_at: new Date().toISOString() },
    { onConflict: 'league_id,user_id,week' }
  );
  if (error) {
    console.error('weekly_lineups upsert', error);
    return NextResponse.json({ error: 'Échec de la sauvegarde de la composition' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, week });
}

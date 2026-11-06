import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import type { StandingRow } from '@/lib/card-view';
import { loadRecords, isLeagueMember } from '@/lib/week-scoring';

export async function GET(req: NextRequest, { params }: { params: { leagueId: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();

  if (!(await isLeagueMember(supabase, params.leagueId, auth.userId))) {
    return NextResponse.json({ error: "Tu n'es pas membre de cette ligue" }, { status: 403 });
  }

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, team_name, user:users(username, avatar_color)')
    .eq('league_id', params.leagueId);

  if (!members?.length) return NextResponse.json([]);

  // Bilan tiré des duels réglés uniquement
  const records = await loadRecords(supabase, params.leagueId);

  const standings: StandingRow[] = members.map(m => {
    const u = m.user as unknown as { username: string; avatar_color: string } | null;
    const r = records[m.user_id];
    return {
      user_id: m.user_id,
      username: u?.username ?? '',
      team_name: m.team_name ?? '',
      avatar_color: u?.avatar_color ?? '#F59E0B',
      wins: r?.wins ?? 0,
      losses: r?.losses ?? 0,
      draws: r?.draws ?? 0,
      points_for: r?.pointsFor ?? 0,
    };
  });

  // Classement : victoires, puis points pour
  standings.sort((a, b) => b.wins - a.wins || b.points_for - a.points_for);
  return NextResponse.json(standings);
}

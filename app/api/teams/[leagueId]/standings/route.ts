import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { CURRENT_SEASON } from '@/lib/sports-api';
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

  const records = await loadRecords(supabase, params.leagueId);

  const standings = await Promise.all(members.map(async m => {
    const { data: tps } = await supabase
      .from('team_players')
      .select('player_id')
      .eq('league_id', params.leagueId)
      .eq('user_id', m.user_id);

    const playerIds = (tps ?? []).map(tp => tp.player_id);
    let totalScore = 0;

    if (playerIds.length > 0) {
      const { data: perfs } = await supabase
        .from('player_performances')
        .select('fantasy_score, match:matches!inner(status, season)')
        .in('player_id', playerIds)
        .eq('match.season', CURRENT_SEASON);

      totalScore = (perfs ?? [])
        .filter((p: any) => p.match?.status === 'finished')
        .reduce((s: number, p: any) => s + p.fantasy_score, 0);
    }

    return {
      user_id: m.user_id,
      team_name: m.team_name,
      username: (m.user as any)?.username,
      avatar_color: (m.user as any)?.avatar_color,
      total_score: Math.round(totalScore * 10) / 10,
      player_count: playerIds.length,
      wins: records[m.user_id]?.wins ?? 0,
      draws: records[m.user_id]?.draws ?? 0,
      losses: records[m.user_id]?.losses ?? 0,
      points_for: records[m.user_id]?.pointsFor ?? 0,
    };
  }));

  // Classement : victoires, puis points pour (scores finaux des duels), puis score total
  standings.sort((a, b) => b.wins - a.wins || b.points_for - a.points_for || b.total_score - a.total_score);
  return NextResponse.json(standings);
}

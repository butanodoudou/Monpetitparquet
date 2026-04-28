import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { leagueId: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, team_name, user:users(username, avatar_color)')
    .eq('league_id', params.leagueId);

  if (!members?.length) return NextResponse.json([]);

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
        .select('fantasy_score, match:matches(status)')
        .in('player_id', playerIds);

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
    };
  }));

  standings.sort((a, b) => b.total_score - a.total_score);
  return NextResponse.json(standings);
}

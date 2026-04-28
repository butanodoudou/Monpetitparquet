import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { leagueId: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const { data: tps } = await supabase
    .from('team_players')
    .select('player_id')
    .eq('league_id', params.leagueId)
    .eq('user_id', auth.userId);

  if (!tps?.length) return NextResponse.json({ players: [], totalScore: 0 });

  const playerIds = tps.map(tp => tp.player_id);
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .in('id', playerIds);

  const { data: perfs } = await supabase
    .from('player_performances')
    .select('player_id, fantasy_score, match:matches(status, week)')
    .in('player_id', playerIds);

  const enriched = (players ?? []).map(p => {
    const playerPerfs = (perfs ?? []).filter((pp: any) => pp.player_id === p.id);
    const finishedPerfs = playerPerfs.filter((pp: any) => pp.match?.status === 'finished');
    const totalFantasy = finishedPerfs.reduce((s: number, pp: any) => s + pp.fantasy_score, 0);

    const sorted = [...finishedPerfs].sort((a: any, b: any) => (b.match?.week ?? 0) - (a.match?.week ?? 0));
    const lastWeekFantasy = sorted[0]?.fantasy_score ?? 0;

    return { ...p, total_fantasy: Math.round(totalFantasy * 10) / 10, last_week_fantasy: Math.round(lastWeekFantasy * 10) / 10 };
  }).sort((a, b) => b.total_fantasy - a.total_fantasy);

  const totalScore = Math.round(enriched.reduce((s, p) => s + p.total_fantasy, 0) * 10) / 10;
  return NextResponse.json({ players: enriched, totalScore });
}

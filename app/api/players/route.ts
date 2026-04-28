import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!getAuth(req)) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const url = new URL(req.url);
  const leagueId = url.searchParams.get('league');

  const supabase = db();
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .order('season_avg_fantasy', { ascending: false });

  if (!leagueId) return NextResponse.json(players ?? []);

  // Mark which players are already drafted in this league
  const { data: drafted } = await supabase
    .from('team_players')
    .select('player_id, user_id')
    .eq('league_id', leagueId);

  const draftedMap = new Map((drafted ?? []).map(d => [d.player_id, d.user_id]));

  const result = (players ?? []).map(p => ({
    ...p,
    drafted_by: draftedMap.get(p.id) ?? null,
  }));

  return NextResponse.json(result);
}

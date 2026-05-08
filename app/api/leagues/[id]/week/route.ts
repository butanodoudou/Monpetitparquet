import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  // 1. Current week from finished matches
  const { data: weekRow } = await supabase
    .from('matches')
    .select('week')
    .eq('status', 'finished')
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle();

  const currentWeek = weekRow?.week ?? 1;

  // 2. All team_players for the league
  const { data: teamPlayers } = await supabase
    .from('team_players')
    .select('user_id, player_id')
    .eq('league_id', leagueId);

  const playerIds = (teamPlayers ?? []).map(tp => tp.player_id);

  // 3. Match IDs for current week (finished)
  const { data: weekMatches } = await supabase
    .from('matches')
    .select('id')
    .eq('week', currentWeek)
    .eq('status', 'finished');

  const matchIds = (weekMatches ?? []).map(m => m.id);

  // 4. Player performances for those matches and those players
  const weekScoreByUser: Record<string, number> = {};

  if (matchIds.length > 0 && playerIds.length > 0) {
    const { data: performances } = await supabase
      .from('player_performances')
      .select('player_id, fantasy_score')
      .in('match_id', matchIds)
      .in('player_id', playerIds);

    for (const perf of performances ?? []) {
      const tp = (teamPlayers ?? []).find(t => t.player_id === perf.player_id);
      if (!tp) continue;
      weekScoreByUser[tp.user_id] = (weekScoreByUser[tp.user_id] ?? 0) + (perf.fantasy_score ?? 0);
    }
  }

  // 5 & 6. Current week matchups + schedule check (parallel)
  const [{ data: currentMatchups }, { count: scheduleCount }, { data: members }] = await Promise.all([
    supabase
      .from('weekly_matchups')
      .select('id, home_user_id, away_user_id')
      .eq('league_id', leagueId)
      .eq('week', currentWeek),
    supabase
      .from('weekly_matchups')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId),
    supabase
      .from('league_members')
      .select('user_id, team_name, user:users(username, avatar_color)')
      .eq('league_id', leagueId),
  ]);

  const scheduleGenerated = (scheduleCount ?? 0) > 0;

  // Build member lookup
  const memberMap: Record<string, { team_name: string; username: string; avatar_color: string }> = {};
  for (const m of members ?? []) {
    const u = m.user as unknown as { username: string; avatar_color: string } | null;
    memberMap[m.user_id] = {
      team_name: m.team_name ?? '',
      username: u?.username ?? '',
      avatar_color: u?.avatar_color ?? '#F59E0B',
    };
  }

  // 9. Build matchup objects
  const matchups = (currentMatchups ?? []).map(mu => {
    const homeScore = weekScoreByUser[mu.home_user_id] ?? 0;
    const awayScore = weekScoreByUser[mu.away_user_id] ?? 0;
    const leadingUserId =
      homeScore > awayScore ? mu.home_user_id :
      awayScore > homeScore ? mu.away_user_id :
      null;

    return {
      id: mu.id,
      home: {
        user_id: mu.home_user_id,
        team_name: memberMap[mu.home_user_id]?.team_name ?? '',
        username: memberMap[mu.home_user_id]?.username ?? '',
        avatar_color: memberMap[mu.home_user_id]?.avatar_color ?? '#F59E0B',
        weekScore: homeScore,
      },
      away: {
        user_id: mu.away_user_id,
        team_name: memberMap[mu.away_user_id]?.team_name ?? '',
        username: memberMap[mu.away_user_id]?.username ?? '',
        avatar_color: memberMap[mu.away_user_id]?.avatar_color ?? '#F59E0B',
        weekScore: awayScore,
      },
      leadingUserId,
    };
  });

  // 10. Past weeks W/L
  const { data: pastMatchups } = await supabase
    .from('weekly_matchups')
    .select('home_user_id, away_user_id, winner_user_id')
    .eq('league_id', leagueId)
    .lt('week', currentWeek)
    .not('winner_user_id', 'is', null);

  // 11. Compute wld per user
  const wld: Record<string, { wins: number; losses: number; draws: number }> = {};
  const ensureWld = (uid: string) => {
    if (!wld[uid]) wld[uid] = { wins: 0, losses: 0, draws: 0 };
  };

  for (const pm of pastMatchups ?? []) {
    ensureWld(pm.home_user_id);
    ensureWld(pm.away_user_id);

    if (pm.winner_user_id === 'draw') {
      wld[pm.home_user_id].draws++;
      wld[pm.away_user_id].draws++;
    } else if (pm.winner_user_id === pm.home_user_id) {
      wld[pm.home_user_id].wins++;
      wld[pm.away_user_id].losses++;
    } else if (pm.winner_user_id === pm.away_user_id) {
      wld[pm.away_user_id].wins++;
      wld[pm.home_user_id].losses++;
    }
  }

  return NextResponse.json({
    currentWeek,
    scheduleGenerated,
    matchups,
    weekScores: weekScoreByUser,
    wld,
  });
}

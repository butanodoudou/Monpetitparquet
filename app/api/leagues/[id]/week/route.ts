import { NextRequest, NextResponse } from 'next/server';
import { CURRENT_SEASON } from '@/lib/sports-api';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  getLastScoredWeek,
  loadLeagueContext,
  computeWeekStats,
  scoreMatchup,
  statsOf,
  settleFinishedWeeks,
  loadRecords,
  isLeagueMember,
} from '@/lib/week-scoring';

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  if (!(await isLeagueMember(supabase, leagueId, auth.userId))) {
    return NextResponse.json({ error: 'Tu n\'es pas membre de cette ligue' }, { status: 403 });
  }

  // Clôture paresseuse des journées terminées (le cron le fait aussi)
  try {
    await settleFinishedWeeks(leagueId);
  } catch (e) {
    console.error('settleFinishedWeeks', e);
  }

  // Journée scorée = dernière journée de la saison en cours avec au moins un match terminé
  const currentWeek = (await getLastScoredWeek(supabase)) ?? 1;

  const ctx = await loadLeagueContext(supabase, leagueId);
  const stats = await computeWeekStats(supabase, leagueId, currentWeek, ctx);

  const [{ data: currentMatchups }, { count: scheduleCount }, { data: members }] = await Promise.all([
    supabase
      .from('weekly_matchups')
      .select('id, home_user_id, away_user_id')
      .eq('league_id', leagueId)
      .eq('season', CURRENT_SEASON)
      .eq('week', currentWeek),
    supabase
      .from('weekly_matchups')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .eq('season', CURRENT_SEASON),
    supabase
      .from('league_members')
      .select('user_id, team_name, user:users(username, avatar_color)')
      .eq('league_id', leagueId),
  ]);

  const scheduleGenerated = (scheduleCount ?? 0) > 0;

  const memberMap: Record<string, { team_name: string; username: string; avatar_color: string }> = {};
  for (const m of members ?? []) {
    const u = m.user as unknown as { username: string; avatar_color: string } | null;
    memberMap[m.user_id] = {
      team_name: m.team_name ?? '',
      username: u?.username ?? '',
      avatar_color: u?.avatar_color ?? '#F59E0B',
    };
  }

  // Score de la semaine de chaque manager (sans adversaire : base + chimie, x weekend)
  const weekScoreByUser: Record<string, number> = {};
  for (const [userId, s] of Array.from(stats)) {
    weekScoreByUser[userId] = round1((s.base + s.chem) * s.weekendMult);
  }

  const side = (userId: string, score: number, opp: string) => {
    const s = statsOf(stats, userId);
    return {
      user_id: userId,
      team_name: memberMap[userId]?.team_name ?? '',
      username: memberMap[userId]?.username ?? '',
      avatar_color: memberMap[userId]?.avatar_color ?? '#F59E0B',
      weekScore: score,
      baseScore: round1(s.base),
      chemBonus: s.chem,
      weekendMult: s.weekendMult,
      defMultApplied: statsOf(stats, opp).defMult,
    };
  };

  const matchups = (currentMatchups ?? []).map(mu => {
    const r = scoreMatchup(
      mu.home_user_id, mu.away_user_id,
      statsOf(stats, mu.home_user_id), statsOf(stats, mu.away_user_id)
    );
    // Pour les managers en duel, le score affiché inclut le malus défensif adverse
    weekScoreByUser[mu.home_user_id] = r.homeScore;
    weekScoreByUser[mu.away_user_id] = r.awayScore;
    return {
      id: mu.id,
      home: side(mu.home_user_id, r.homeScore, mu.away_user_id),
      away: side(mu.away_user_id, r.awayScore, mu.home_user_id),
      leadingUserId: r.winnerUserId,
    };
  });

  const records = await loadRecords(supabase, leagueId);
  const wld: Record<string, { wins: number; losses: number; draws: number }> = {};
  for (const uid of Object.keys(records)) {
    const { wins, losses, draws } = records[uid];
    wld[uid] = { wins, losses, draws };
  }

  return NextResponse.json({ currentWeek, scheduleGenerated, matchups, weekScores: weekScoreByUser, wld });
}

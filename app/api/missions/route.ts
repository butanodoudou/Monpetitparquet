import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { CURRENT_SEASON } from '@/lib/sports-api';
import { bestLeagueIndex, evaluateMissions, type MissionState } from '@/lib/missions';
import { computeWeekStats, getPlayableWeek, loadLeagueContext } from '@/lib/week-scoring';

export const dynamic = 'force-dynamic';

// État des missions de la journée en cours, sur l'ensemble des ligues du joueur.
// Les trois missions ne se cumulent pas entre ligues : on renvoie celle où il en a réussi le plus.
// Réponse : { week, missions: { id, label, done }[], claimed, league }.
export async function GET(req: NextRequest) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const supabase = db();
    const { week, isLocked } = await getPlayableWeek(supabase);

    const [{ data: duels }, { data: claimedRow }] = await Promise.all([
      supabase
        .from('weekly_matchups')
        .select('league_id, winner_user_id, settled_at, league:leagues(name)')
        .eq('season', CURRENT_SEASON)
        .eq('week', week)
        .or(`home_user_id.eq.${auth.userId},away_user_id.eq.${auth.userId}`),
      supabase
        .from('card_packs')
        .select('id')
        .eq('user_id', auth.userId)
        .eq('season', CURRENT_SEASON)
        .eq('source', 'mission')
        .eq('reward_key', String(week))
        .maybeSingle(),
    ]);

    const leagues = (duels ?? []).map(d => ({
      id: d.league_id as string,
      name: (d.league as unknown as { name: string } | null)?.name ?? '',
      won: d.settled_at !== null && d.winner_user_id === auth.userId,
    }));

    const results: MissionState[][] = [];
    for (const league of leagues) {
      const [{ data: lineup }, starterPoints] = await Promise.all([
        supabase
          .from('weekly_lineups')
          .select('user_id')
          .eq('league_id', league.id)
          .eq('user_id', auth.userId)
          .eq('week', week)
          .not('starter_card_ids', 'is', null)
          .maybeSingle(),
        // Les points n'existent qu'après le verrou
        isLocked ? userStarterPoints(supabase, league.id, week, auth.userId) : Promise.resolve([] as number[]),
      ]);
      results.push(evaluateMissions({ lineupPlaced: !!lineup, won: league.won, starterPoints }));
    }

    const best = bestLeagueIndex(results);
    const missions = best >= 0 ? results[best] : evaluateMissions({ lineupPlaced: false, won: false, starterPoints: [] });
    return NextResponse.json({
      week,
      missions: missions.map(m => ({ id: m.id, label: m.label, done: m.done })),
      claimed: !!claimedRow,
      league: best >= 0 ? { id: leagues[best].id, name: leagues[best].name } : null,
    });
  } catch (e) {
    console.error('missions', e);
    return NextResponse.json({ error: 'Impossible de charger tes missions' }, { status: 500 });
  }
}

async function userStarterPoints(supabase: ReturnType<typeof db>, leagueId: string, week: number, userId: string): Promise<number[]> {
  const ctx = await loadLeagueContext(supabase, leagueId);
  const stats = await computeWeekStats(supabase, leagueId, week, ctx);
  return (stats.get(userId)?.starters ?? []).map(s => s.points);
}

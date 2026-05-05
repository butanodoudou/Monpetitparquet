import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { fetchRecentFinishedEvents, fetchEventLineups } from '@/lib/sports-api';
import { computeFantasyScore } from '@/lib/fantasy';

// Called by Vercel Cron (daily at 23h) or manually with secret
export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '') ??
    new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  return syncResults();
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  return syncResults();
}

async function syncResults() {
  const supabase = db();
  const results = { matchesUpserted: 0, performancesUpserted: 0, errors: [] as string[] };

  try {
    const events = await fetchRecentFinishedEvents();

    for (const event of events) {
      await supabase.from('matches').upsert({
        id: event.id,
        home_team: event.homeTeam.name,
        home_team_id: event.homeTeam.id,
        away_team: event.awayTeam.name,
        away_team_id: event.awayTeam.id,
        home_score: event.homeScore?.current ?? null,
        away_score: event.awayScore?.current ?? null,
        match_date: new Date(event.startTimestamp * 1000).toISOString(),
        week: event.round?.round ?? 0,
        status: 'finished',
        season: '2025-2026',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      results.matchesUpserted++;

      const { count } = await supabase
        .from('player_performances')
        .select('*', { count: 'exact', head: true })
        .eq('match_id', event.id);

      if ((count ?? 0) > 0) continue;

      try {
        const perfs = await fetchEventLineups(event.id, event.homeTeam.id, event.awayTeam.id);

        for (const perf of perfs) {
          const s = perf.statistics;
          const pts = s.points ?? 0;
          const ast = s.assists ?? 0;
          const reb = s.rebounds ?? 0;
          const stl = s.steals ?? 0;
          const blk = s.blocks ?? 0;
          const tov = s.turnovers ?? 0;
          const thr = s.threePointsMade ?? 0;
          const mins = Math.round((s.secondsPlayed ?? 0) / 60);
          const fs = computeFantasyScore(pts, ast, reb, stl, blk, tov, thr);

          await supabase.from('player_performances').upsert({
            player_id: perf.player.id,
            match_id: event.id,
            team_id: perf.teamId,
            points: pts, assists: ast, rebounds: reb,
            steals: stl, blocks: blk, turnovers: tov,
            three_pointers: thr, minutes_played: mins,
            fantasy_score: fs,
          }, { onConflict: 'player_id,match_id' });
          results.performancesUpserted++;
        }
      } catch (e: any) {
        results.errors.push(`Event ${event.id}: ${e.message}`);
      }
    }

    await recomputeAverages(supabase);

  } catch (e: any) {
    results.errors.push(e.message);
  }

  return NextResponse.json(results);
}

async function recomputeAverages(supabase: ReturnType<typeof db>) {
  const { data: players } = await supabase.from('players').select('id');
  if (!players?.length) return;

  for (const p of players) {
    const { data: perfs } = await supabase
      .from('player_performances')
      .select('points, assists, rebounds, steals, blocks, turnovers, three_pointers, fantasy_score')
      .eq('player_id', p.id);

    if (!perfs?.length) continue;
    const n = perfs.length;
    const avg = (key: keyof typeof perfs[0]) =>
      Math.round((perfs.reduce((s, r) => s + ((r[key] as number) ?? 0), 0) / n) * 10) / 10;

    await supabase.from('players').update({
      avg_points: avg('points'),
      avg_assists: avg('assists'),
      avg_rebounds: avg('rebounds'),
      avg_steals: avg('steals'),
      avg_blocks: avg('blocks'),
      avg_turnovers: avg('turnovers'),
      avg_three_pointers: avg('three_pointers'),
      season_avg_fantasy: avg('fantasy_score'),
      games_played: n,
      updated_at: new Date().toISOString(),
    }).eq('id', p.id);
  }
}

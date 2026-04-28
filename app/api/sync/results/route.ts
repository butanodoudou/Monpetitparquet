import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { fetchGames, fetchGamePlayerStats, normalizeStatus } from '@/lib/sports-api';
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
    const games = await fetchGames();
    let weekCounter = 1;
    const weekMap = new Map<string, number>(); // date → week number (approximate grouping)

    // Sort by date and assign week numbers
    const sorted = [...games].sort((a, b) => a.timestamp - b.timestamp);
    let lastDate = '';
    for (const g of sorted) {
      const d = g.date.slice(0, 10);
      if (!weekMap.has(d)) {
        // New week if > 4 days gap
        if (lastDate && daysDiff(lastDate, d) > 4) weekCounter++;
        weekMap.set(d, weekCounter);
        lastDate = d;
      }
    }

    for (const game of games) {
      const status = normalizeStatus(game.status.short);
      const week = weekMap.get(game.date.slice(0, 10)) ?? 1;

      await supabase.from('matches').upsert({
        id: game.id,
        home_team: game.teams.home.name,
        home_team_id: game.teams.home.id,
        away_team: game.teams.away.name,
        away_team_id: game.teams.away.id,
        home_score: game.scores.home.total,
        away_score: game.scores.away.total,
        match_date: new Date(game.timestamp * 1000).toISOString(),
        week,
        status,
        season: game.league.season,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      results.matchesUpserted++;

      // Only fetch player stats for finished games not yet processed
      if (status !== 'finished') continue;

      const { count } = await supabase
        .from('player_performances')
        .select('*', { count: 'exact', head: true })
        .eq('match_id', game.id);

      if ((count ?? 0) > 0) continue; // already processed

      try {
        const statsRows = await fetchGamePlayerStats(game.id);

        for (const stat of statsRows) {
          if (!stat.player?.id) continue;

          const pts = stat.points ?? 0;
          const ast = stat.assists ?? 0;
          const reb = stat.totReb ?? 0;
          const stl = stat.steals ?? 0;
          const blk = stat.blocks ?? 0;
          const tov = stat.turnovers ?? 0;
          const thr = stat.tpm ?? 0;
          const mins = parseInt(stat.min ?? '0') || 0;
          const fs = computeFantasyScore(pts, ast, reb, stl, blk, tov, thr);

          await supabase.from('player_performances').upsert({
            player_id: stat.player.id,
            match_id: game.id,
            team_id: stat.team?.id,
            points: pts, assists: ast, rebounds: reb,
            steals: stl, blocks: blk, turnovers: tov,
            three_pointers: thr, minutes_played: mins,
            fantasy_score: fs,
          }, { onConflict: 'player_id,match_id' });
          results.performancesUpserted++;
        }
      } catch (e: any) {
        results.errors.push(`Game ${game.id}: ${e.message}`);
      }
    }

    // Recompute season averages
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

function daysDiff(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { CURRENT_SEASON } from '@/lib/sports-api';

type PerfRow = {
  player_id: number;
  points: number | null;
  assists: number | null;
  rebounds: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
  three_pointers: number | null;
  minutes_played: number | null;
  fantasy_score: number | null;
};

const ZEROED_AVERAGES = {
  avg_points: 0,
  avg_assists: 0,
  avg_rebounds: 0,
  avg_steals: 0,
  avg_blocks: 0,
  avg_turnovers: 0,
  avg_three_pointers: 0,
  avg_minutes: 0,
  season_avg_fantasy: 0,
  games_played: 0,
};

export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret') ??
    req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const supabase = db();

  // Averages are per-season: join matches to keep only the current season's games.
  // player_performances has no season column of its own — matches.season is the source of truth.
  const { data: perfs, error } = await supabase
    .from('player_performances')
    .select(
      'player_id, points, assists, rebounds, steals, blocks, turnovers, three_pointers, minutes_played, fantasy_score, matches!inner(season)'
    )
    .eq('matches.season', CURRENT_SEASON);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Reset everyone first: a player with no game this season must read 0, not last season's
  // numbers. Without this, relegated or retired players keep stale averages and pollute the
  // draft tiers (which are computed from percentiles over the whole players table).
  const { error: resetError } = await supabase
    .from('players')
    .update({ ...ZEROED_AVERAGES, updated_at: new Date().toISOString() })
    .gt('id', 0);

  if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 });

  if (!perfs?.length) {
    return NextResponse.json({ season: CURRENT_SEASON, reset: true, updated: 0 });
  }

  // Group by player
  const byPlayer = new Map<number, PerfRow[]>();
  for (const p of perfs as unknown as PerfRow[]) {
    if (!byPlayer.has(p.player_id)) byPlayer.set(p.player_id, []);
    byPlayer.get(p.player_id)!.push(p);
  }

  const avg = (rows: PerfRow[], key: keyof PerfRow) =>
    Math.round((rows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0) / rows.length) * 10) / 10;

  let updated = 0;
  for (const [playerId, rows] of Array.from(byPlayer.entries())) {
    await supabase.from('players').update({
      avg_points:         avg(rows, 'points'),
      avg_assists:        avg(rows, 'assists'),
      avg_rebounds:       avg(rows, 'rebounds'),
      avg_steals:         avg(rows, 'steals'),
      avg_blocks:         avg(rows, 'blocks'),
      avg_turnovers:      avg(rows, 'turnovers'),
      avg_three_pointers: avg(rows, 'three_pointers'),
      avg_minutes:        avg(rows, 'minutes_played'),
      season_avg_fantasy: avg(rows, 'fantasy_score'),
      games_played:       rows.length,
      updated_at:         new Date().toISOString(),
    }).eq('id', playerId);
    updated++;
  }

  return NextResponse.json({
    season: CURRENT_SEASON,
    reset: true,
    updated,
    players_with_perfs: byPlayer.size,
    performances: perfs.length,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { fetchRecentFinishedEvents, fetchEventsByRound, fetchEventLineups, fetchUpcomingMatches, CURRENT_SEASON } from '@/lib/sports-api';
import { settleFinishedWeeks } from '@/lib/week-scoring';
import { computeFantasyScore } from '@/lib/fantasy';

// Called by Vercel Cron (daily at 23h) or manually with secret
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = req.headers.get('authorization')?.replace('Bearer ', '') ?? url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const round = url.searchParams.get('round');
  return syncResults(round ? parseInt(round) : undefined);
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const secret = req.headers.get('x-cron-secret') ?? url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const round = url.searchParams.get('round');
  return syncResults(round ? parseInt(round) : undefined);
}

async function syncResults(round?: number) {
  const supabase = db();
  const results = { matchesUpserted: 0, upcomingUpserted: 0, performancesUpserted: 0, weeksSettled: 0, errors: [] as string[] };

  try {
    const events = round
      ? await fetchEventsByRound(round)
      : await fetchRecentFinishedEvents();

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
        week: event.roundInfo?.round ?? 0,
        status: 'finished',
        season: CURRENT_SEASON,
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
          const nameParts = perf.player.name.split(' ');
          await supabase.from('players').upsert({
            id: perf.player.id,
            name: perf.player.name,
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' '),
            team: event.homeTeam.id === perf.teamId ? event.homeTeam.name : event.awayTeam.name,
            photo_url: `https://img.sofascore.com/api/v1/player/${perf.player.id}/image`,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id', ignoreDuplicates: false });

          const s = perf.statistics;
          const line = {
            points:            s.points ?? 0,
            assists:           s.assists ?? 0,
            rebounds:          s.rebounds ?? 0,
            offensiveRebounds: s.offensiveRebounds ?? 0,
            defensiveRebounds: s.defensiveRebounds ?? 0,
            steals:            s.steals ?? 0,
            blocks:            s.blocks ?? 0,
            turnovers:         s.turnovers ?? 0,
            threePointersMade: s.threePointsMade ?? 0,
            fieldGoalsMade:    s.fieldGoalsMade ?? 0,
            fieldGoalAttempts: s.fieldGoalAttempts ?? 0,
            freeThrowsMade:    s.freeThrowsMade ?? 0,
            freeThrowAttempts: s.freeThrowAttempts ?? 0,
          };
          const mins = Math.round((s.secondsPlayed ?? 0) / 60);

          const { error: perfError } = await supabase.from('player_performances').upsert({
            player_id: perf.player.id,
            match_id: event.id,
            team_id: perf.teamId,
            points: line.points,
            assists: line.assists,
            rebounds: line.rebounds,
            offensive_rebounds: line.offensiveRebounds,
            defensive_rebounds: line.defensiveRebounds,
            steals: line.steals,
            blocks: line.blocks,
            turnovers: line.turnovers,
            three_pointers: line.threePointersMade,
            three_point_attempts: s.threePointAttempts ?? 0,
            field_goals_made: line.fieldGoalsMade,
            field_goal_attempts: line.fieldGoalAttempts,
            free_throws_made: line.freeThrowsMade,
            free_throw_attempts: line.freeThrowAttempts,
            personal_fouls: s.personalFouls ?? 0,
            plus_minus: s.plusMinus ?? 0,
            minutes_played: mins,
            fantasy_score: computeFantasyScore(line),
          }, { onConflict: 'player_id,match_id' });

          if (perfError) {
            results.errors.push(`Perf ${perf.player.id}@${event.id}: ${perfError.message}`);
          } else {
            results.performancesUpserted++;
          }
        }
      } catch (e: any) {
        results.errors.push(`Event ${event.id}: ${e.message}`);
      }
    }

  } catch (e: any) {
    results.errors.push(e.message);
  }

  // Matchs à venir (1 seul appel Sofascore) : alimente « Prochains matchs » et le verrou de compo
  try {
    const upcoming = await fetchUpcomingMatches();
    if (upcoming.length > 0) {
      // Un match déjà terminé en base ne repasse jamais en scheduled/postponed/etc.
      const { data: done, error: doneErr } = await supabase
        .from('matches')
        .select('id')
        .in('id', upcoming.map(m => m.id))
        .eq('status', 'finished');
      if (doneErr) throw new Error(doneErr.message);
      const finishedIds = new Set<number>((done ?? []).map(r => r.id as number));

      const now = new Date().toISOString();
      const rows = upcoming
        .filter(m => !finishedIds.has(m.id))
        .map(m => ({ ...m, updated_at: now }));
      if (rows.length > 0) {
        const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'id' });
        if (error) throw new Error(error.message);
        results.upcomingUpserted = rows.length;
      }
    }
  } catch (e: any) {
    results.errors.push(`Upcoming: ${e.message}`);
  }

  // Clôture des semaines terminées (vainqueur + scores finaux) pour toutes les ligues
  try {
    const { data: leagues } = await supabase.from('leagues').select('id');
    for (const league of leagues ?? []) {
      try {
        results.weeksSettled += await settleFinishedWeeks(league.id);
      } catch (e: any) {
        results.errors.push(`Settle ${league.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    results.errors.push(`Settle: ${e.message}`);
  }

  return NextResponse.json(results);
}

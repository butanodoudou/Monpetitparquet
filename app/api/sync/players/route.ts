import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { fetchTeams, fetchPlayers, normalizePosition, LEAGUE_ID } from '@/lib/sports-api';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const supabase = db();
  const results = { teams: 0, players: 0, errors: [] as string[] };

  try {
    // 1. Upsert teams
    const teamsData = await fetchTeams();
    for (const { team } of teamsData) {
      if (team.national) continue;
      await supabase.from('betclic_teams').upsert(
        { id: team.id, name: team.name, logo_url: team.logo },
        { onConflict: 'id' }
      );
      results.teams++;
    }

    // 2. Upsert players per team
    for (const { team } of teamsData) {
      if (team.national) continue;
      let page = 1;
      while (true) {
        const playersData = await fetchPlayers(team.id, page);
        if (!playersData.length) break;

        for (const { player } of playersData) {
          // leagues is keyed by league id (number or string depending on API version)
          const leagueData =
            player.leagues?.[LEAGUE_ID] ?? player.leagues?.[String(LEAGUE_ID)];
          if (!leagueData) continue;

          await supabase.from('players').upsert({
            id: player.id,
            name: `${player.firstname} ${player.lastname}`.trim(),
            first_name: player.firstname,
            last_name: player.lastname,
            team: team.name,
            team_id: team.id,
            position: normalizePosition(leagueData.position),
            jersey_number: leagueData.jersey ?? null,
            nationality: player.nationality ?? null,
            height: player.height?.meters ?? null,
            weight: player.weight?.kilograms ?? null,
            birth_date: player.birth?.date ?? null,
            photo_url: player.photo ?? null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
          results.players++;
        }

        if (playersData.length < 20) break;
        page++;
      }
    }
  } catch (e: any) {
    results.errors.push(String(e.message ?? e));
  }

  return NextResponse.json(results);
}

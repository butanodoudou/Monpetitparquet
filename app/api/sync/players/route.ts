import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { fetchTeams, fetchTeamPlayers, normalizePosition } from '@/lib/sports-api';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const supabase = db();
  const results = { teams: 0, players: 0, errors: [] as string[] };

  try {
    const teams = await fetchTeams();

    for (const team of teams) {
      await supabase.from('betclic_teams').upsert(
        {
          id: team.id,
          name: team.name,
          logo_url: `https://img.sofascore.com/api/v1/team/${team.id}/image`,
        },
        { onConflict: 'id' }
      );
      results.teams++;

      const players = await fetchTeamPlayers(team.id);

      for (const player of players) {
        const nameParts = player.name.split(' ');
        await supabase.from('players').upsert({
          id: player.id,
          name: player.name,
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' '),
          team: team.name,
          team_id: team.id,
          position: normalizePosition(player.position),
          jersey_number: player.jerseyNumber ?? null,
          nationality: player.nationality ?? null,
          height: player.height ? (player.height / 100).toFixed(2) : null,
          birth_date: player.dateOfBirthTimestamp
            ? new Date(player.dateOfBirthTimestamp * 1000).toISOString().slice(0, 10)
            : null,
          photo_url: `https://img.sofascore.com/api/v1/player/${player.id}/image`,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        results.players++;
      }
    }
  } catch (e: any) {
    results.errors.push(String(e.message ?? e));
  }

  return NextResponse.json(results);
}

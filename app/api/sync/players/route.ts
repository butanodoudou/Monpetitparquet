import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { fetchTeams, fetchTeamPlayers, normalizePosition } from '@/lib/sports-api';

// Garde-fou : on ne désactive en masse que si le sync a ramené un effectif crédible.
// La LNB Élite c'est 16 clubs × ~12 joueurs ≈ 190. Sous ce seuil, Sofascore a probablement
// répondu partiellement et on préfère ne rien désactiver.
const MIN_PLAYERS_TO_PRUNE = 120;

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const supabase = db();
  const results = { teams: 0, players: 0, deactivated: 0, pruned: false, errors: [] as string[] };
  const activeIds = new Set<number>();
  // Club dont l'effectif n'a pas pu être lu : on l'ignore pour cette fois sans désactiver ses joueurs.
  const failedTeamIds: number[] = [];

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

      let players: Awaited<ReturnType<typeof fetchTeamPlayers>>;
      try {
        players = await fetchTeamPlayers(team.id);
      } catch (e: any) {
        failedTeamIds.push(team.id);
        results.errors.push(`${team.name} : ${e.message ?? e}`);
        continue;
      }

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
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        activeIds.add(player.id);
        results.players++;
      }
    }

    // Les joueurs plus présents dans aucun effectif de la saison en cours (clubs relégués,
    // départs à l'étranger, fins de carrière) sortent du pool draftable sans être supprimés —
    // leurs performances passées restent référencées.
    if (activeIds.size >= MIN_PLAYERS_TO_PRUNE) {
      const idList = `(${Array.from(activeIds).join(',')})`;
      let prune = supabase
        .from('players')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .not('id', 'in', idList)
        .eq('is_active', true);
      if (failedTeamIds.length > 0) {
        prune = prune.not('team_id', 'in', `(${failedTeamIds.join(',')})`);
      }
      const { data: gone, error: pruneError } = await prune.select('id');

      if (pruneError) results.errors.push(`Prune: ${pruneError.message}`);
      else {
        results.deactivated = gone?.length ?? 0;
        results.pruned = true;
      }
    } else if (activeIds.size > 0) {
      results.errors.push(
        `Seulement ${activeIds.size} joueurs récupérés (< ${MIN_PLAYERS_TO_PRUNE}) — désactivation en masse ignorée.`
      );
    }
  } catch (e: any) {
    results.errors.push(String(e.message ?? e));
  }

  return NextResponse.json(results);
}

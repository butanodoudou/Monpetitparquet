import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { CURRENT_SEASON } from '@/lib/sports-api';
import { assignAuctionTier, computeAuctionTierThresholds, type AuctionTier } from '@/lib/fantasy';
import { buildPacks, rankMembers, groupOf, type PoolPlayer } from '@/lib/lottery';
import { computeLeagueStats, isCronAuthorized } from '@/lib/lottery-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Cron Vercel (lundi 8h UTC) : GET avec "Authorization: Bearer CRON_SECRET".
// Appel manuel : POST ?secret=... (ou en-tête x-cron-secret).
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  return prepareSessions();
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  return prepareSessions();
}

type LeagueResult = { leagueId: string; result: 'created' | 'exists' | 'cancelled' | 'error'; detail?: string };

/** Prépare une session "scheduled" (tickets + packs) par ligue dont le draft est terminé. */
async function prepareSessions() {
  const supabase = db();

  // Semaine écoulée = la journée LNB la plus récente ayant au moins un match terminé dans les 7 derniers jours.
  // Aucun match terminé sur la période : pas de loterie (semaine sans championnat).
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from('matches')
    .select('week')
    .eq('status', 'finished')
    .eq('season', CURRENT_SEASON)
    .gte('match_date', since)
    .order('week', { ascending: false })
    .limit(1);
  if (recentError) return NextResponse.json({ error: recentError.message }, { status: 500 });

  const week: number | null = recent?.[0]?.week ?? null;
  if (!week || week <= 0) {
    return NextResponse.json({ ok: true, skipped: 'Aucun match terminé cette semaine : pas de loterie', leagues: [] });
  }

  const { data: leagues } = await supabase.from('leagues').select('id').eq('draft_status', 'completed');
  if (!leagues || leagues.length === 0) return NextResponse.json({ ok: true, week, leagues: [] });

  // Seuils de tier calculés une fois, sur tous les joueurs actifs (même méthode que le draft par enchères).
  const { data: activePlayers } = await supabase
    .from('players')
    .select('id, position, season_avg_fantasy')
    .eq('is_active', true);
  const players = activePlayers ?? [];
  const { p5, p25 } = computeAuctionTierThresholds(players.map(p => p.season_avg_fantasy ?? 0));
  const eligible: PoolPlayer[] = players
    .filter(p => groupOf(p.position) !== null) // un joueur sans poste connu ne peut pas être validé à la relâche
    .map(p => ({ id: p.id as number, tier: assignAuctionTier(p.season_avg_fantasy ?? 0, p5, p25) }));

  const results: LeagueResult[] = [];
  for (const league of leagues) {
    try {
      results.push(await prepareLeague(supabase, league.id, week, eligible));
    } catch (e: any) {
      console.error('lottery/run', league.id, e);
      results.push({ leagueId: league.id, result: 'error', detail: e?.message ?? 'erreur inconnue' });
    }
  }

  return NextResponse.json({ ok: true, week, leagues: results });
}

async function prepareLeague(
  supabase: ReturnType<typeof db>,
  leagueId: string,
  week: number,
  eligible: PoolPlayer[],
): Promise<LeagueResult> {
  // Idempotence : une session par (ligue, semaine)
  const { data: existing } = await supabase
    .from('lottery_sessions')
    .select('id')
    .eq('league_id', leagueId)
    .eq('week', week)
    .maybeSingle();
  if (existing) return { leagueId, result: 'exists' };

  const { data: members } = await supabase.from('league_members').select('user_id').eq('league_id', leagueId);
  const memberIds = (members ?? []).map(m => m.user_id as string);
  if (memberIds.length === 0) return { leagueId, result: 'error', detail: 'Ligue sans membre' };

  // Free agents : actifs, avec poste connu, absents des équipes de la ligue
  const { data: taken } = await supabase.from('team_players').select('player_id').eq('league_id', leagueId);
  const takenIds: Record<number, true> = {};
  for (const t of taken ?? []) takenIds[t.player_id as number] = true;
  const pool = eligible.filter(p => !takenIds[p.id]);

  const built = buildPacks(pool, memberIds.length);

  if (!built.ok) {
    const { error } = await supabase.from('lottery_sessions').insert({ league_id: leagueId, week, status: 'cancelled' });
    if (error && error.code !== '23505') throw new Error(error.message);
    return { leagueId, result: 'cancelled', detail: built.reason };
  }

  const stats = await computeLeagueStats(supabase, leagueId, memberIds, week);
  const ranked = rankMembers(stats);

  const { data: session, error: sessionError } = await supabase
    .from('lottery_sessions')
    .insert({ league_id: leagueId, week, status: 'scheduled' })
    .select('id')
    .single();
  if (sessionError) {
    if (sessionError.code === '23505') return { leagueId, result: 'exists' }; // cron lancé deux fois en parallèle
    throw new Error(sessionError.message);
  }

  const [{ error: ticketsError }, { error: packsError }] = await Promise.all([
    supabase.from('lottery_tickets').insert(
      ranked.map(r => ({ session_id: session.id, user_id: r.user_id, tickets: r.tickets, rank: r.rank })),
    ),
    supabase.from('lottery_packs').insert(
      built.packs.map((cards, i) => ({
        session_id: session.id,
        pack_number: i + 1,
        player_ids: cards.map(c => c.id),
        player_tiers: cards.map(c => c.tier as AuctionTier),
      })),
    ),
  ]);

  if (ticketsError || packsError) {
    // Pas de session à moitié préparée : on supprime (cascade) pour que le prochain passage réessaie.
    await supabase.from('lottery_sessions').delete().eq('id', session.id);
    throw new Error((ticketsError ?? packsError)!.message);
  }

  return { leagueId, result: 'created', detail: built.degraded ? `packs de ${built.packSize}` : undefined };
}

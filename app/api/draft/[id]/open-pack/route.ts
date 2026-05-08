import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  PACK_PRICES, PACK_WEIGHTS, DRAFT_BUDGET,
  assignTier, weightedRandom, computeTierThresholds,
  type PlayerTier,
} from '@/lib/fantasy';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { tier } = (await req.json()) as { tier: PlayerTier };
  if (!PACK_PRICES[tier]) return NextResponse.json({ error: 'Tier invalide' }, { status: 400 });

  const supabase = db();
  const leagueId = params.id;

  const [{ data: league }, { data: member }] = await Promise.all([
    supabase.from('leagues').select('draft_status, picks_per_team').eq('id', leagueId).single(),
    supabase.from('league_members').select('draft_credits').eq('league_id', leagueId).eq('user_id', auth.userId).single(),
  ]);

  if (!league) return NextResponse.json({ error: 'Ligue introuvable' }, { status: 404 });
  if (league.draft_status !== 'in_progress') return NextResponse.json({ error: 'Draft non active' }, { status: 400 });
  if (!member) return NextResponse.json({ error: 'Non membre' }, { status: 403 });

  const credits = member.draft_credits ?? DRAFT_BUDGET;
  if (credits < PACK_PRICES[tier]) {
    return NextResponse.json({ error: 'Crédits insuffisants' }, { status: 400 });
  }

  const { count: myCount } = await supabase
    .from('team_players')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', leagueId)
    .eq('user_id', auth.userId);

  if ((myCount ?? 0) >= league.picks_per_team) {
    return NextResponse.json({ error: 'Roster complet' }, { status: 400 });
  }

  const { data: existingOffer } = await supabase
    .from('draft_pack_offers')
    .select('id, player_ids, tier, credits_spent')
    .eq('league_id', leagueId)
    .eq('user_id', auth.userId)
    .is('chosen_player_id', null)
    .maybeSingle();

  if (existingOffer) {
    const { data: players } = await supabase
      .from('players')
      .select('id, name, team, position, jersey_number, photo_url, avg_points, avg_assists, avg_rebounds, season_avg_fantasy')
      .in('id', existingOffer.player_ids);

    const { p5, p20, p50 } = computeTierThresholds(
      (await supabase.from('players').select('season_avg_fantasy')).data?.map(p => p.season_avg_fantasy) ?? []
    );

    const orderedPlayers = existingOffer.player_ids.map((id: number) => players?.find(p => p.id === id)).filter(Boolean);
    return NextResponse.json({
      offerId: existingOffer.id,
      players: orderedPlayers.map((p: any) => ({ ...p, tier: assignTier(p.season_avg_fantasy, p5, p20, p50) })),
      credits,
    });
  }

  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, name, team, position, jersey_number, photo_url, avg_points, avg_assists, avg_rebounds, season_avg_fantasy');

  if (!allPlayers?.length) return NextResponse.json({ error: 'Aucun joueur en base' }, { status: 500 });

  const { p5, p20, p50 } = computeTierThresholds(allPlayers.map(p => p.season_avg_fantasy));

  const [{ data: drafted }, { data: activeOffers }] = await Promise.all([
    supabase.from('team_players').select('player_id').eq('league_id', leagueId),
    supabase.from('draft_pack_offers').select('player_ids').eq('league_id', leagueId).is('chosen_player_id', null),
  ]);

  const unavailable = new Set<number>([
    ...(drafted?.map(d => d.player_id) ?? []),
    ...(activeOffers?.flatMap(o => o.player_ids) ?? []),
  ]);

  const available = allPlayers
    .filter(p => !unavailable.has(p.id))
    .map(p => ({ ...p, tier: assignTier(p.season_avg_fantasy, p5, p20, p50) }));

  const selected: typeof available = [];
  const usedIds = new Set<number>();

  for (let i = 0; i < 3; i++) {
    let targetTier = weightedRandom(PACK_WEIGHTS[tier]);
    let pool = available.filter(p => p.tier === targetTier && !usedIds.has(p.id));

    if (!pool.length) {
      const fallbackOrder: PlayerTier[] = ['gold', 'silver', 'bronze', 'elite'];
      for (const fb of fallbackOrder) {
        pool = available.filter(p => p.tier === fb && !usedIds.has(p.id));
        if (pool.length) { targetTier = fb; break; }
      }
    }
    if (!pool.length) break;

    const pick = pool[Math.floor(Math.random() * pool.length)];
    selected.push(pick);
    usedIds.add(pick.id);
  }

  if (selected.length < 3) return NextResponse.json({ error: 'Plus assez de joueurs disponibles' }, { status: 400 });

  const { data: offer } = await supabase
    .from('draft_pack_offers')
    .insert({
      league_id: leagueId,
      user_id: auth.userId,
      tier,
      player_ids: selected.map(p => p.id),
      credits_spent: PACK_PRICES[tier],
    })
    .select('id')
    .single();

  return NextResponse.json({ offerId: offer!.id, players: selected, credits });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  DRAFT_BUDGET, TIER_MIN_BIDS, ROSTER_SIZE, GROUP_LABELS,
  assignAuctionTier, computeAuctionTierThresholds, getPositionGroup, getRemainingRosterSlots,
} from '@/lib/fantasy';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  let bids: Record<string, number> | undefined;
  try {
    bids = (await req.json())?.bids;
  } catch {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }
  if (!bids || typeof bids !== 'object') {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

  const [{ data: league }, { data: member }] = await Promise.all([
    supabase.from('leagues').select('draft_status').eq('id', leagueId).single(),
    supabase.from('league_members').select('draft_credits').eq('league_id', leagueId).eq('user_id', auth.userId).single(),
  ]);

  if (!league || league.draft_status !== 'in_progress') {
    return NextResponse.json({ error: 'Draft non active' }, { status: 400 });
  }
  if (!member) return NextResponse.json({ error: 'Non membre' }, { status: 403 });

  const { data: pack } = await supabase
    .from('auction_packs')
    .select('id, player_ids, status')
    .eq('league_id', leagueId)
    .eq('status', 'bidding')
    .maybeSingle();

  if (!pack) return NextResponse.json({ error: 'Aucun pack en cours' }, { status: 400 });

  const packPlayerIds = pack.player_ids as number[];
  const credits = member.draft_credits ?? DRAFT_BUDGET;

  // Get tier info for each player to validate minimums
  // Seuils calculés sur tout le pool (comme execute-close-pack et auction-state), pas sur les 5 joueurs du pack
  const [{ data: allPlayersData }, { data: packPlayers }, { data: myTeam }] = await Promise.all([
    supabase.from('players').select('id, season_avg_fantasy').eq('is_active', true),
    supabase.from('players').select('id, name, position').in('id', packPlayerIds),
    supabase.from('team_players').select('player:players(position)').eq('league_id', leagueId).eq('user_id', auth.userId),
  ]);
  const { p5, p25 } = computeAuctionTierThresholds((allPlayersData ?? []).map(p => p.season_avg_fantasy));
  const tierMap: Record<number, 'elite' | 'star' | 'basique'> = {};
  for (const p of allPlayersData ?? []) {
    tierMap[p.id] = assignAuctionTier(p.season_avg_fantasy, p5, p25);
  }

  // Places restantes par poste : on refuse toute mise sur un poste déjà plein
  const myRoster = (myTeam ?? []).map((tp: any) => ({ position: tp.player?.position ?? '' }));
  const remaining = getRemainingRosterSlots(myRoster);
  const rosterFull = myRoster.length >= ROSTER_SIZE;

  let totalBid = 0;
  for (const playerId of packPlayerIds) {
    const amount = Number(bids[String(playerId)] ?? 0);
    if (!Number.isInteger(amount) || amount < 0) {
      return NextResponse.json({ error: 'Enchère invalide' }, { status: 400 });
    }
    const tier = tierMap[playerId] ?? 'basique';
    const tierMin = TIER_MIN_BIDS[tier];
    // Bid must be 0 (skip) or >= tier minimum
    if (amount > 0 && amount < tierMin) {
      return NextResponse.json({ error: `Mise minimum ${tierMin.toLocaleString()}$ pour un ${tier}` }, { status: 400 });
    }
    if (amount > 0) {
      const pp = (packPlayers ?? []).find(p => p.id === playerId);
      const group = getPositionGroup(pp?.position ?? '');
      if (rosterFull) {
        return NextResponse.json({ error: 'Ton roster est complet, tu ne peux plus miser' }, { status: 400 });
      }
      if (group && remaining[group] <= 0) {
        return NextResponse.json({
          error: `Poste complet : tu as déjà tous tes ${GROUP_LABELS[group].toLowerCase()}${pp ? ` (${pp.name})` : ''}. Mets cette mise à 0.`,
        }, { status: 400 });
      }
    }
    totalBid += amount;
  }

  if (totalBid > credits) {
    return NextResponse.json({ error: `Budget insuffisant (${credits.toLocaleString()}$ disponibles)` }, { status: 400 });
  }

  const bidRows = packPlayerIds.map(playerId => ({
    pack_id: pack.id,
    league_id: leagueId,
    user_id: auth.userId,
    player_id: playerId,
    amount: Number(bids[String(playerId)] ?? 0),
    submitted_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await supabase
    .from('auction_bids')
    .upsert(bidRows, { onConflict: 'pack_id,user_id,player_id' });

  if (upsertErr) return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 });

  return NextResponse.json({ ok: true, totalBid });
}

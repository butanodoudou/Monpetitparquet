import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  AUCTION_PACK_COMPOSITION, DRAFT_BUDGET, MIN_BID,
  assignAuctionTier, computeAuctionTierThresholds,
  type AuctionTier,
} from '@/lib/fantasy';

function generateBotBids(
  players: { id: number; tier: AuctionTier }[],
  credits: number,
): Record<number, number> {
  const packSize = players.length;
  const minTotal = MIN_BID * packSize;

  if (credits < minTotal) return Object.fromEntries(players.map(p => [p.id, 0]));

  // Spend ~20% of remaining budget per pack, at least the minimum
  const packBudget = Math.max(minTotal, Math.floor(credits * 0.20));
  const avgPerPlayer = packBudget / packSize;

  const tierMultipliers: Record<AuctionTier, [number, number]> = {
    elite:   [1.5, 2.5],
    star:    [0.8, 1.4],
    basique: [0.3, 0.7],
  };

  const bids: Record<number, number> = {};
  let totalBid = 0;

  for (const player of players) {
    const [min, max] = tierMultipliers[player.tier];
    const mult = min + Math.random() * (max - min);
    // Round to nearest 1,000
    const raw = Math.round(avgPerPlayer * mult / 1000) * 1000;
    bids[player.id] = Math.max(MIN_BID, raw);
    totalBid += bids[player.id];
  }

  if (totalBid > credits) {
    // Scale down preserving minimum
    const excess = totalBid - packSize * MIN_BID;
    const budget = credits - packSize * MIN_BID;
    const scale = Math.max(0, budget / Math.max(1, excess));
    for (const id in bids) {
      const over = bids[Number(id)] - MIN_BID;
      bids[Number(id)] = MIN_BID + Math.floor(over * scale / 1000) * 1000;
    }
  }

  return bids;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, draft_status')
    .eq('id', leagueId)
    .single();

  if (!league) return NextResponse.json({ error: 'Ligue introuvable' }, { status: 404 });
  if (league.commissioner_id !== auth.userId) return NextResponse.json({ error: 'Commissaire uniquement' }, { status: 403 });
  if (league.draft_status !== 'in_progress') return NextResponse.json({ error: 'Draft non active' }, { status: 400 });

  const { data: activePack } = await supabase
    .from('auction_packs')
    .select('id')
    .eq('league_id', leagueId)
    .eq('status', 'bidding')
    .maybeSingle();

  if (activePack) return NextResponse.json({ error: 'Un pack est déjà en cours d\'enchère' }, { status: 400 });

  const { count: packCount } = await supabase
    .from('auction_packs')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId);

  const packNumber = (packCount ?? 0) + 1;

  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, name, team, position, jersey_number, photo_url, avg_points, avg_assists, avg_rebounds, season_avg_fantasy');

  if (!allPlayers?.length) return NextResponse.json({ error: 'Aucun joueur en base' }, { status: 500 });

  const { p5, p25 } = computeAuctionTierThresholds(allPlayers.map(p => p.season_avg_fantasy));
  const playersWithTier = allPlayers.map(p => ({
    ...p,
    tier: assignAuctionTier(p.season_avg_fantasy, p5, p25) as AuctionTier,
  }));

  const { data: drafted } = await supabase
    .from('team_players')
    .select('player_id')
    .eq('league_id', leagueId);

  const draftedIds = new Set((drafted ?? []).map(d => d.player_id));
  const available = playersWithTier.filter(p => !draftedIds.has(p.id));

  const selected: typeof available = [];
  const usedIds = new Set<number>();

  for (const tier of AUCTION_PACK_COMPOSITION) {
    const pool = available.filter(p => p.tier === tier && !usedIds.has(p.id));
    const fallback = available.filter(p => !usedIds.has(p.id));
    const source = pool.length > 0 ? pool : fallback;
    if (source.length === 0) break;
    const pick = source[Math.floor(Math.random() * source.length)];
    selected.push(pick);
    usedIds.add(pick.id);
  }

  if (selected.length < AUCTION_PACK_COMPOSITION.length) {
    return NextResponse.json({ error: 'Plus assez de joueurs disponibles' }, { status: 400 });
  }

  const { data: newPack } = await supabase
    .from('auction_packs')
    .insert({
      league_id: leagueId,
      pack_number: packNumber,
      player_ids: selected.map(p => p.id),
      status: 'bidding',
    })
    .select('id')
    .single();

  if (!newPack) return NextResponse.json({ error: 'Erreur création pack' }, { status: 500 });

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, draft_credits, user:users(email)')
    .eq('league_id', leagueId);

  const botMembers = (members ?? []).filter(m => ((m.user as any)?.email ?? '').endsWith('@system.internal'));

  for (const bot of botMembers) {
    const botCredits = bot.draft_credits ?? DRAFT_BUDGET;
    const botBids = generateBotBids(selected, botCredits);

    const bidRows = selected.map(p => ({
      pack_id: newPack.id,
      league_id: leagueId,
      user_id: bot.user_id,
      player_id: p.id,
      amount: botBids[p.id] ?? 0,
    }));

    await supabase.from('auction_bids').upsert(bidRows, { onConflict: 'pack_id,user_id,player_id' });
  }

  return NextResponse.json({ ok: true, packNumber, playerCount: selected.length });
}

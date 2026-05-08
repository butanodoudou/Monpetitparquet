import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  AUCTION_PACK_COMPOSITION, DRAFT_BUDGET,
  assignAuctionTier, computeAuctionTierThresholds, getRemainingRosterSlots,
  POSITION_GROUP_MAP,
  type AuctionTier, type PositionGroup,
} from '@/lib/fantasy';

function generateBotBids(
  players: { id: number; tier: AuctionTier; position: string }[],
  credits: number,
  remainingPicks: number,
  remainingSlots: Record<PositionGroup, number>,
): Record<number, number> {
  if (credits <= 0) return Object.fromEntries(players.map(p => [p.id, 0]));

  const avgPerPick = Math.max(1, credits / Math.max(1, remainingPicks));
  const tierMultipliers: Record<AuctionTier, [number, number]> = {
    elite:   [1.4, 2.2],
    star:    [0.7, 1.3],
    basique: [0.2, 0.6],
  };

  const bids: Record<number, number> = {};
  let totalBid = 0;

  for (const player of players) {
    const group = POSITION_GROUP_MAP[player.position] as PositionGroup | undefined;
    if (!group || remainingSlots[group] <= 0) {
      bids[player.id] = 0;
      continue;
    }
    const [min, max] = tierMultipliers[player.tier];
    const mult = min + Math.random() * (max - min);
    const raw = Math.round(avgPerPick * mult);
    bids[player.id] = Math.max(1, raw);
    totalBid += bids[player.id];
  }

  if (totalBid > credits) {
    const scale = credits / totalBid;
    for (const id in bids) {
      bids[Number(id)] = Math.max(0, Math.floor(bids[Number(id)] * scale));
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
    .select('commissioner_id, draft_status, picks_per_team')
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

  const picksPerTeam = league.picks_per_team ?? 8;

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, draft_credits, user:users(email)')
    .eq('league_id', leagueId);

  const botMembers = (members ?? []).filter(m => ((m.user as any)?.email ?? '').endsWith('@system.internal'));

  for (const bot of botMembers) {
    const { data: botRoster } = await supabase
      .from('team_players')
      .select('player_id, player:players(position)')
      .eq('league_id', leagueId)
      .eq('user_id', bot.user_id);

    const botCredits = bot.draft_credits ?? DRAFT_BUDGET;
    const botPlayerCount = botRoster?.length ?? 0;
    const remainingPicks = Math.max(1, picksPerTeam - botPlayerCount);
    const botRemainingSlots = getRemainingRosterSlots(
      (botRoster ?? []).map(tp => ({ position: (tp.player as any)?.position ?? '' }))
    );

    const botBids = generateBotBids(selected, botCredits, remainingPicks, botRemainingSlots);

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

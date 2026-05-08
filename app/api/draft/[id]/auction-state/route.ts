import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  assignAuctionTier, computeAuctionTierThresholds, getRemainingRosterSlots,
  type AuctionTier,
} from '@/lib/fantasy';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  const [{ data: league }, { data: membership }] = await Promise.all([
    supabase.from('leagues').select('commissioner_id, draft_status, picks_per_team').eq('id', leagueId).single(),
    supabase.from('league_members').select('draft_credits').eq('league_id', leagueId).eq('user_id', auth.userId).single(),
  ]);

  if (!league) return NextResponse.json({ error: 'Ligue introuvable' }, { status: 404 });
  if (!membership) return NextResponse.json({ error: 'Non membre' }, { status: 403 });

  const picksPerTeam = league.picks_per_team ?? 8;

  const [{ data: members }, { data: allTeamPlayers }] = await Promise.all([
    supabase.from('league_members')
      .select('user_id, draft_credits, user:users(username, avatar_color, email)')
      .eq('league_id', leagueId),
    supabase.from('team_players')
      .select('user_id, player_id, player:players(position)')
      .eq('league_id', leagueId),
  ]);

  const myPlayers = (allTeamPlayers ?? []).filter(tp => tp.user_id === auth.userId);
  const myRemainingSlots = getRemainingRosterSlots(
    myPlayers.map(tp => ({ position: (tp.player as any)?.position ?? '' }))
  );

  const membersData = (members ?? []).map(m => ({
    userId: m.user_id,
    username: (m.user as any)?.username ?? '',
    avatarColor: (m.user as any)?.avatar_color ?? '#666',
    isBot: ((m.user as any)?.email ?? '').endsWith('@system.internal'),
    playerCount: (allTeamPlayers ?? []).filter(tp => tp.user_id === m.user_id).length,
    credits: m.draft_credits ?? 100,
    hasSubmitted: false,
  }));

  const { data: packs } = await supabase
    .from('auction_packs')
    .select('*')
    .eq('league_id', leagueId)
    .order('pack_number', { ascending: false })
    .limit(1);

  const currentPack = packs?.[0] ?? null;

  if (!currentPack) {
    return NextResponse.json({
      isCommissioner: league.commissioner_id === auth.userId,
      myCredits: membership.draft_credits ?? 100,
      myRemainingSlots,
      members: membersData,
      currentPack: null,
      draftComplete: league.draft_status === 'completed',
      picksPerTeam,
    });
  }

  const { data: allPlayersData } = await supabase.from('players').select('id, season_avg_fantasy');
  const { p5, p25 } = computeAuctionTierThresholds((allPlayersData ?? []).map(p => p.season_avg_fantasy));

  const { data: packPlayers } = await supabase
    .from('players')
    .select('id, name, team, position, jersey_number, photo_url, avg_points, avg_assists, avg_rebounds, season_avg_fantasy')
    .in('id', currentPack.player_ids as number[]);

  const orderedPlayers = (currentPack.player_ids as number[])
    .map(id => packPlayers?.find(p => p.id === id))
    .filter(Boolean)
    .map((p: any) => ({ ...p, tier: assignAuctionTier(p.season_avg_fantasy, p5, p25) as AuctionTier }));

  const { data: bids } = await supabase
    .from('auction_bids')
    .select('user_id, player_id, amount, submitted_at')
    .eq('pack_id', currentPack.id);

  const packSize = (currentPack.player_ids as number[]).length;
  const submittedUserIds = (members ?? [])
    .filter(m => (bids ?? []).filter(b => b.user_id === m.user_id).length >= packSize)
    .map(m => m.user_id);

  const updatedMembers = membersData.map(m => ({
    ...m,
    hasSubmitted: submittedUserIds.includes(m.userId),
  }));

  const myBids: Record<number, number> = {};
  for (const bid of (bids ?? []).filter(b => b.user_id === auth.userId)) {
    myBids[bid.player_id] = bid.amount;
  }

  return NextResponse.json({
    isCommissioner: league.commissioner_id === auth.userId,
    myCredits: membership.draft_credits ?? 100,
    myRemainingSlots,
    members: updatedMembers,
    currentPack: {
      id: currentPack.id,
      packNumber: currentPack.pack_number,
      status: currentPack.status,
      players: orderedPlayers,
      myBids,
      submittedUserIds,
      winners: currentPack.winners ?? null,
    },
    draftComplete: league.draft_status === 'completed',
    picksPerTeam,
  });
}

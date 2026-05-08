import { SupabaseClient } from '@supabase/supabase-js';
import {
  TIER_MIN_BIDS, ROSTER_SIZE, AUCTION_PACK_COMPOSITION,
  assignAuctionTier, computeAuctionTierThresholds,
  type AuctionTier,
} from '@/lib/fantasy';
import { buildRoundRobin } from '@/lib/schedule';

const SEASON_WEEKS = 30;

export async function executeClosePack(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<{ ok: boolean; winners?: Record<string, any>; draftComplete?: boolean; error?: string }> {
  const { data: pack } = await supabase
    .from('auction_packs')
    .select('*')
    .eq('league_id', leagueId)
    .eq('status', 'bidding')
    .maybeSingle();

  if (!pack) return { ok: false, error: 'Aucun pack en cours' };

  // Mark pack as closing atomically to prevent race conditions
  const { data: claimed } = await supabase
    .from('auction_packs')
    .update({ status: 'closing' })
    .eq('id', pack.id)
    .eq('status', 'bidding')
    .select('id');

  if (!claimed || claimed.length === 0) return { ok: true, winners: {}, draftComplete: false }; // already being closed

  const [{ data: existingBids }, { data: packPlayers }, { data: members }] = await Promise.all([
    supabase.from('auction_bids').select('user_id, player_id, amount, submitted_at').eq('pack_id', pack.id),
    supabase.from('players').select('id, name, position, season_avg_fantasy').in('id', pack.player_ids as number[]),
    supabase.from('league_members').select('user_id, draft_credits, user:users(username)').eq('league_id', leagueId),
  ]);

  // Compute tiers for pack players
  const { data: allPlayersData } = await supabase.from('players').select('id, season_avg_fantasy');
  const { p5, p25 } = computeAuctionTierThresholds((allPlayersData ?? []).map(p => p.season_avg_fantasy));
  const tierMap: Record<number, AuctionTier> = {};
  for (const p of packPlayers ?? []) {
    tierMap[p.id] = assignAuctionTier(p.season_avg_fantasy, p5, p25);
  }

  const creditsMap: Record<string, number> = {};
  const usernameMap: Record<string, string> = {};
  for (const m of members ?? []) {
    creditsMap[m.user_id] = m.draft_credits ?? 500_000;
    usernameMap[m.user_id] = (m.user as any)?.username ?? '?';
  }

  // Auto-generate bids for members who didn't submit — use far-future timestamp so they always lose ties
  const autoSubmitTime = new Date('2099-01-01T00:00:00Z').toISOString();
  const submittedUserIds = new Set(
    (members ?? [])
      .filter(m => (existingBids ?? []).filter(b => b.user_id === m.user_id).length >= (pack.player_ids as number[]).length)
      .map(m => m.user_id)
  );

  const autoBidRows: { pack_id: string; league_id: string; user_id: string; player_id: number; amount: number; submitted_at: string }[] = [];
  for (const m of members ?? []) {
    if (submittedUserIds.has(m.user_id)) continue;
    const credits = creditsMap[m.user_id] ?? 0;
    for (const playerId of pack.player_ids as number[]) {
      const tier = tierMap[playerId] ?? 'basique';
      const tierMin = TIER_MIN_BIDS[tier];
      const autoBid = credits >= tierMin ? tierMin : 0;
      autoBidRows.push({
        pack_id: pack.id,
        league_id: leagueId,
        user_id: m.user_id,
        player_id: playerId,
        amount: autoBid,
        submitted_at: autoSubmitTime,
      });
    }
  }
  if (autoBidRows.length > 0) {
    await supabase.from('auction_bids').upsert(autoBidRows, { onConflict: 'pack_id,user_id,player_id' });
  }

  // Re-fetch all bids including auto-generated
  const { data: allBids } = await supabase
    .from('auction_bids')
    .select('user_id, player_id, amount, submitted_at')
    .eq('pack_id', pack.id);

  const { count: existingPickCount } = await supabase
    .from('draft_picks')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId);

  let pickNumber = (existingPickCount ?? 0) + 1;
  const winners: Record<string, { userId: string; username: string; amount: number } | null> = {};
  const teamPlayersToInsert: { league_id: string; user_id: string; player_id: number }[] = [];
  const draftPicksToInsert: { league_id: string; user_id: string; player_id: number; pick_number: number }[] = [];

  for (const playerId of pack.player_ids as number[]) {
    const tier = tierMap[playerId] ?? 'basique';
    const tierMin = TIER_MIN_BIDS[tier];

    const playerBids = (allBids ?? [])
      .filter(b => b.player_id === playerId && b.amount >= tierMin)
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
      });

    let winner: typeof playerBids[0] | null = null;
    for (const bid of playerBids) {
      const userCredits = creditsMap[bid.user_id] ?? 0;
      if (userCredits < bid.amount) continue;
      winner = bid;
      break;
    }

    if (winner) {
      teamPlayersToInsert.push({ league_id: leagueId, user_id: winner.user_id, player_id: playerId });
      draftPicksToInsert.push({ league_id: leagueId, user_id: winner.user_id, player_id: playerId, pick_number: pickNumber++ });
      creditsMap[winner.user_id] -= winner.amount;
      winners[String(playerId)] = { userId: winner.user_id, username: usernameMap[winner.user_id] ?? '?', amount: winner.amount };
    } else {
      winners[String(playerId)] = null;
    }
  }

  if (teamPlayersToInsert.length > 0) await supabase.from('team_players').insert(teamPlayersToInsert);
  if (draftPicksToInsert.length > 0) await supabase.from('draft_picks').insert(draftPicksToInsert);

  const changedUsers = Object.values(winners).filter(Boolean).map(w => w!.userId).filter((v, i, a) => a.indexOf(v) === i);
  await Promise.all(
    changedUsers.map(userId =>
      supabase.from('league_members')
        .update({ draft_credits: creditsMap[userId] })
        .eq('league_id', leagueId)
        .eq('user_id', userId)
    )
  );

  await supabase.from('auction_packs').update({ status: 'closed', winners }).eq('id', pack.id);

  // Draft complete when everyone has >= ROSTER_SIZE players
  const { data: allMembersCheck } = await supabase.from('league_members').select('user_id').eq('league_id', leagueId);
  const { data: allPicksAfter } = await supabase.from('team_players').select('user_id').eq('league_id', leagueId);

  const allDone = (allMembersCheck ?? []).every(m =>
    (allPicksAfter ?? []).filter(p => p.user_id === m.user_id).length >= ROSTER_SIZE
  );

  if (allDone) {
    await supabase.from('leagues').update({ draft_status: 'completed' }).eq('id', leagueId);

    const { count: scheduleExists } = await supabase
      .from('weekly_matchups').select('id', { count: 'exact', head: true }).eq('league_id', leagueId);

    if ((scheduleExists ?? 0) === 0 && allMembersCheck && allMembersCheck.length >= 2) {
      const userIds = allMembersCheck.map(m => m.user_id);
      const baseRounds = buildRoundRobin(userIds);
      const rows = [];
      for (let week = 1; week <= SEASON_WEEKS; week++) {
        const round = baseRounds[(week - 1) % baseRounds.length];
        for (const [h, a] of round) {
          rows.push({ league_id: leagueId, week, home_user_id: h, away_user_id: a });
        }
      }
      await supabase.from('weekly_matchups').insert(rows);
    }
  }

  return { ok: true, winners, draftComplete: allDone };
}

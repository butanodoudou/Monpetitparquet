import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { MIN_BID, AUCTION_PACK_COMPOSITION } from '@/lib/fantasy';
import { buildRoundRobin } from '@/lib/schedule';

const SEASON_WEEKS = 30;

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

  const { data: pack } = await supabase
    .from('auction_packs')
    .select('*')
    .eq('league_id', leagueId)
    .eq('status', 'bidding')
    .maybeSingle();

  if (!pack) return NextResponse.json({ error: 'Aucun pack en cours' }, { status: 400 });

  const [{ data: allBids }, { data: packPlayers }, { data: members }] = await Promise.all([
    supabase.from('auction_bids').select('user_id, player_id, amount, submitted_at').eq('pack_id', pack.id),
    supabase.from('players').select('id, name, position').in('id', pack.player_ids as number[]),
    supabase.from('league_members').select('user_id, draft_credits, user:users(username)').eq('league_id', leagueId),
  ]);

  const playerMap = new Map((packPlayers ?? []).map(p => [p.id, p]));

  const creditsMap: Record<string, number> = {};
  const usernameMap: Record<string, string> = {};

  for (const m of (members ?? [])) {
    creditsMap[m.user_id] = m.draft_credits ?? 500_000;
    usernameMap[m.user_id] = (m.user as any)?.username ?? '?';
  }

  const winners: Record<string, { userId: string; username: string; amount: number } | null> = {};
  const teamPlayersToInsert: { league_id: string; user_id: string; player_id: number }[] = [];

  const { count: existingPickCount } = await supabase
    .from('draft_picks')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId);

  let pickNumber = (existingPickCount ?? 0) + 1;
  const draftPicksToInsert: { league_id: string; user_id: string; player_id: number; pick_number: number }[] = [];

  for (const playerId of (pack.player_ids as number[])) {
    const playerBids = (allBids ?? [])
      .filter(b => b.player_id === playerId && b.amount > 0)
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

  const changedUsers = Object.keys(winners)
    .map(pid => winners[pid])
    .filter(Boolean)
    .map(w => w!.userId)
    .filter((v, i, a) => a.indexOf(v) === i);

  await Promise.all(
    changedUsers.map(userId =>
      supabase.from('league_members')
        .update({ draft_credits: creditsMap[userId] })
        .eq('league_id', leagueId)
        .eq('user_id', userId)
    )
  );

  await supabase.from('auction_packs')
    .update({ status: 'closed', winners })
    .eq('id', pack.id);

  // Draft ends when nobody can afford the minimum for a full pack
  const minToParticipate = MIN_BID * AUCTION_PACK_COMPOSITION.length;
  const allDone = Object.values(creditsMap).every(credits => credits < minToParticipate);

  if (allDone) {
    await supabase.from('leagues').update({ draft_status: 'completed' }).eq('id', leagueId);

    const { data: allMembersCheck } = await supabase.from('league_members').select('user_id').eq('league_id', leagueId);
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

  return NextResponse.json({ ok: true, winners, draftComplete: allDone });
}

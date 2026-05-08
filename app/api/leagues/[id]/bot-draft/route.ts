import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  PACK_PRICES, assignTier, computeTierThresholds, type PlayerTier,
} from '@/lib/fantasy';
import { buildRoundRobin } from '@/lib/schedule';

const SEASON_WEEKS = 30;
const TIER_PRIORITY: PlayerTier[] = ['elite', 'gold', 'silver', 'bronze'];

async function draftForBot(
  supabase: ReturnType<typeof db>,
  leagueId: string,
  botUserId: string,
  picksPerTeam: number,
  playersWithTier: Array<{ id: number; season_avg_fantasy: number; tier: PlayerTier }>,
) {
  let picks = 0;

  while (picks < picksPerTeam) {
    const [{ count: rosterCount }, { data: member }] = await Promise.all([
      supabase.from('team_players').select('*', { count: 'exact', head: true })
        .eq('league_id', leagueId).eq('user_id', botUserId),
      supabase.from('league_members').select('draft_credits')
        .eq('league_id', leagueId).eq('user_id', botUserId).single(),
    ]);

    if ((rosterCount ?? 0) >= picksPerTeam) break;

    const credits = member?.draft_credits ?? 0;
    const tier = TIER_PRIORITY.find(t => PACK_PRICES[t] <= credits);
    if (!tier) break;

    // Get unavailable player IDs
    const [{ data: drafted }, { data: activeOffers }] = await Promise.all([
      supabase.from('team_players').select('player_id').eq('league_id', leagueId),
      supabase.from('draft_pack_offers').select('player_ids').eq('league_id', leagueId).is('chosen_player_id', null),
    ]);

    const unavailable = new Set<number>([
      ...(drafted?.map(d => d.player_id) ?? []),
      ...(activeOffers?.flatMap(o => o.player_ids) ?? []),
    ]);

    const available = playersWithTier.filter(p => !unavailable.has(p.id));
    if (available.length === 0) break;

    // Simulate pack draw: 3 random candidates of target tier, pick best
    const pool = available.filter(p => p.tier === tier);
    const candidates = (pool.length >= 3 ? pool : available)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    const best = candidates.reduce((a, b) => a.season_avg_fantasy > b.season_avg_fantasy ? a : b);

    const { error: insertErr } = await supabase.from('team_players').insert({
      league_id: leagueId,
      user_id: botUserId,
      player_id: best.id,
    });

    if (insertErr) {
      if (insertErr.code === '23505') continue; // Race: player just taken, retry
      break;
    }

    const newCredits = Math.max(0, credits - PACK_PRICES[tier]);
    await supabase.from('league_members')
      .update({ draft_credits: newCredits })
      .eq('league_id', leagueId)
      .eq('user_id', botUserId);

    picks++;
  }

  return picks;
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
  if (league.commissioner_id !== auth.userId) return NextResponse.json({ error: 'Réservé au commissaire' }, { status: 403 });
  if (league.draft_status !== 'in_progress') return NextResponse.json({ error: 'Draft non active' }, { status: 400 });

  // Find bot members in this league
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, user:users(email, username)')
    .eq('league_id', leagueId);

  const botMembers = (members ?? []).filter(m => (m.user as any)?.email?.endsWith('@system.internal'));

  if (botMembers.length === 0) {
    return NextResponse.json({ error: 'Aucun bot dans la ligue' }, { status: 400 });
  }

  // Load all players once for all bots
  const { data: allPlayers } = await supabase
    .from('players')
    .select('id, season_avg_fantasy');

  if (!allPlayers?.length) {
    return NextResponse.json({ error: 'Aucun joueur en base' }, { status: 500 });
  }

  const { p5, p20, p50 } = computeTierThresholds(allPlayers.map(p => p.season_avg_fantasy));
  const playersWithTier = allPlayers.map(p => ({
    ...p,
    tier: assignTier(p.season_avg_fantasy, p5, p20, p50),
  }));

  const picksPerTeam = league.picks_per_team ?? 8;
  const results: Record<string, number> = {};

  for (const bot of botMembers) {
    const picks = await draftForBot(supabase, leagueId, bot.user_id, picksPerTeam, playersWithTier);
    results[(bot.user as any)?.username ?? bot.user_id] = picks;
  }

  // Check if all members have full rosters → complete draft
  const [{ data: allMembers }, { data: allPicks }] = await Promise.all([
    supabase.from('league_members').select('user_id').eq('league_id', leagueId),
    supabase.from('team_players').select('user_id').eq('league_id', leagueId),
  ]);

  const allDone = allMembers?.every(m =>
    (allPicks?.filter(p => p.user_id === m.user_id).length ?? 0) >= picksPerTeam
  );

  if (allDone) {
    await supabase.from('leagues').update({ draft_status: 'completed' }).eq('id', leagueId);

    const { count: scheduleExists } = await supabase
      .from('weekly_matchups').select('id', { count: 'exact', head: true }).eq('league_id', leagueId);

    if ((scheduleExists ?? 0) === 0 && allMembers && allMembers.length >= 2) {
      const userIds = allMembers.map(m => m.user_id);
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

  return NextResponse.json({ ok: true, results, draftComplete: allDone ?? false });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { PACK_PRICES } from '@/lib/fantasy';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { offerId, playerId } = (await req.json()) as { offerId: string; playerId: number };
  const supabase = db();
  const leagueId = params.id;

  // Load offer
  const { data: offer } = await supabase
    .from('draft_pack_offers')
    .select('*')
    .eq('id', offerId)
    .eq('league_id', leagueId)
    .eq('user_id', auth.userId)
    .is('chosen_player_id', null)
    .single();

  if (!offer) return NextResponse.json({ error: 'Offre invalide ou expirée' }, { status: 400 });
  if (!offer.player_ids.includes(playerId)) return NextResponse.json({ error: 'Joueur non présent dans ce pack' }, { status: 400 });

  // Check player still available (not drafted by someone who was faster)
  const { data: alreadyDrafted } = await supabase
    .from('team_players')
    .select('id')
    .eq('league_id', leagueId)
    .eq('player_id', playerId)
    .maybeSingle();

  if (alreadyDrafted) return NextResponse.json({ error: 'Joueur déjà drafté par quelqu\'un d\'autre' }, { status: 409 });

  // Add player to team
  const { error: insertError } = await supabase
    .from('team_players')
    .insert({ league_id: leagueId, user_id: auth.userId, player_id: playerId });

  if (insertError) {
    if (insertError.code === '23505') return NextResponse.json({ error: 'Joueur déjà drafté' }, { status: 409 });
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }

  // Deduct credits + mark offer as chosen
  const [{ data: member }, { data: league }] = await Promise.all([
    supabase.from('league_members').select('draft_credits').eq('league_id', leagueId).eq('user_id', auth.userId).single(),
    supabase.from('leagues').select('picks_per_team').eq('id', leagueId).single(),
  ]);

  const newCredits = Math.max(0, (member?.draft_credits ?? 100) - offer.credits_spent);

  await Promise.all([
    supabase.from('draft_pack_offers').update({ chosen_player_id: playerId }).eq('id', offerId),
    supabase.from('league_members').update({ draft_credits: newCredits }).eq('league_id', leagueId).eq('user_id', auth.userId),
  ]);

  // Check if all members have a full roster → complete draft
  const [{ data: members }, { data: allPicks }] = await Promise.all([
    supabase.from('league_members').select('user_id').eq('league_id', leagueId),
    supabase.from('team_players').select('user_id').eq('league_id', leagueId),
  ]);

  const picksPerTeam = league?.picks_per_team ?? 8;
  const allDone = members?.every(m =>
    (allPicks?.filter(p => p.user_id === m.user_id).length ?? 0) >= picksPerTeam
  );

  if (allDone) {
    await supabase.from('leagues').update({ draft_status: 'completed' }).eq('id', leagueId);
  }

  // Get picked player details
  const { data: player } = await supabase.from('players').select('id, name, team, position, photo_url, season_avg_fantasy').eq('id', playerId).single();

  return NextResponse.json({ ok: true, player, creditsLeft: newCredits, draftComplete: allDone ?? false });
}

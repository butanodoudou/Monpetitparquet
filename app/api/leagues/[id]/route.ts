import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const { data: league } = await supabase.from('leagues').select('*').eq('id', params.id).single();
  if (!league) return NextResponse.json({ error: 'Ligue introuvable' }, { status: 404 });

  const { data: myMembership } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', params.id)
    .eq('user_id', auth.userId)
    .single();
  if (!myMembership) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const { data: members } = await supabase
    .from('league_members')
    .select('*, user:users(username, avatar_color, email)')
    .eq('league_id', params.id)
    .order('draft_position', { ascending: true });

  // Compute total score per member
  const enrichedMembers = await Promise.all((members ?? []).map(async m => {
    const { data: tps } = await supabase
      .from('team_players')
      .select('player_id')
      .eq('league_id', params.id)
      .eq('user_id', m.user_id);

    const playerIds = (tps ?? []).map(tp => tp.player_id);
    let totalScore = 0;

    if (playerIds.length > 0) {
      const { data: perfs } = await supabase
        .from('player_performances')
        .select('fantasy_score, match:matches(status)')
        .in('player_id', playerIds);

      totalScore = (perfs ?? [])
        .filter((p: any) => p.match?.status === 'finished')
        .reduce((s: number, p: any) => s + (p.fantasy_score ?? 0), 0);
    }

    return {
      user_id: m.user_id,
      team_name: m.team_name,
      draft_position: m.draft_position,
      player_count: playerIds.length,
      total_score: Math.round(totalScore * 10) / 10,
      username: (m.user as any)?.username,
      avatar_color: (m.user as any)?.avatar_color,
      is_bot: ((m.user as any)?.email ?? '').endsWith('@system.internal'),
    };
  }));

  enrichedMembers.sort((a, b) => b.total_score - a.total_score);

  const { data: draftPicks } = await supabase
    .from('draft_picks')
    .select('*, user:users(username), player:players(name, position, team)')
    .eq('league_id', params.id)
    .order('pick_number', { ascending: true });

  return NextResponse.json({ ...league, members: enrichedMembers, draftPicks: draftPicks ?? [] });
}

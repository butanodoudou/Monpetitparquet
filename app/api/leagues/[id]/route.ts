import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { loadRecords } from '@/lib/week-scoring';

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

  // total_score = points pour, tirés des duels réglés
  const records = await loadRecords(supabase, params.id);
  const enrichedMembers = (members ?? []).map(m => ({
    user_id: m.user_id,
    team_name: m.team_name,
    draft_position: m.draft_position,
    total_score: records[m.user_id]?.pointsFor ?? 0,
    username: (m.user as any)?.username,
    avatar_color: (m.user as any)?.avatar_color,
    is_bot: ((m.user as any)?.email ?? '').endsWith('@system.internal'),
  }));

  enrichedMembers.sort((a, b) => b.total_score - a.total_score);

  return NextResponse.json({ ...league, members: enrichedMembers });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', params.id)
    .single();

  if (!league) return NextResponse.json({ error: 'Ligue introuvable' }, { status: 404 });
  if (league.commissioner_id !== auth.userId) {
    return NextResponse.json({ error: 'Seul le commissaire peut supprimer cette ligue' }, { status: 403 });
  }

  await supabase.from('leagues').delete().eq('id', params.id);
  return NextResponse.json({ ok: true });
}

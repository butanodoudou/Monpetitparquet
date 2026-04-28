import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

const PICK_SECONDS = 45;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const { data: league } = await supabase.from('leagues').select('*').eq('id', params.id).single();
  if (!league) return NextResponse.json({ error: 'Ligue introuvable' }, { status: 404 });
  if (league.commissioner_id !== auth.userId) {
    return NextResponse.json({ error: 'Seul le commissaire peut démarrer la draft' }, { status: 403 });
  }
  if (league.draft_status !== 'pending') {
    return NextResponse.json({ error: 'Draft déjà démarrée' }, { status: 400 });
  }

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', params.id)
    .order('created_at', { ascending: true });

  if (!members || members.length < 2) {
    return NextResponse.json({ error: 'Au moins 2 équipes nécessaires' }, { status: 400 });
  }

  // Shuffle for draft order
  const shuffled = [...members].sort(() => Math.random() - 0.5);
  await Promise.all(shuffled.map((m, i) =>
    supabase.from('league_members')
      .update({ draft_position: i + 1 })
      .eq('league_id', params.id)
      .eq('user_id', m.user_id)
  ));

  const deadline = new Date(Date.now() + PICK_SECONDS * 1000).toISOString();
  await supabase
    .from('leagues')
    .update({ draft_status: 'in_progress', current_draft_pick: 1, pick_deadline: deadline })
    .eq('id', params.id);

  return NextResponse.json({ ok: true });
}

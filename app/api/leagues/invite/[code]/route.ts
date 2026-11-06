import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';

// Public : aperçu de l'invitation avant inscription. Le code d'invitation fait office d'accès.
export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const supabase = db();
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, draft_status, commissioner:users!commissioner_id(username)')
    .eq('invite_code', params.code.trim().toUpperCase())
    .maybeSingle();

  if (!league || league.draft_status !== 'pending') {
    return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });
  }

  const { count } = await supabase
    .from('league_members')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', league.id);

  const commissioner = league.commissioner as unknown as { username: string } | null;
  return NextResponse.json({
    leagueName: league.name,
    commissioner: commissioner?.username ?? null,
    memberCount: count ?? 0,
  });
}

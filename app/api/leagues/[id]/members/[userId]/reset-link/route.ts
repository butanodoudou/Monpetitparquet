import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { buildLoginToken, getAuth } from '@/lib/auth';

// Le commissaire génère un nouveau lien pour un membre qui a perdu le sien. L'ancien cesse de marcher.
export async function POST(req: NextRequest, { params }: { params: { id: string; userId: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!league) return NextResponse.json({ error: 'Ligue introuvable' }, { status: 404 });
  if (league.commissioner_id !== auth.userId) {
    return NextResponse.json({ error: 'Réservé au commissaire' }, { status: 403 });
  }

  const { data: member } = await supabase
    .from('league_members')
    .select('user:users(id, email, login_version)')
    .eq('league_id', params.id)
    .eq('user_id', params.userId)
    .maybeSingle();

  const target = member?.user as unknown as { id: string; email: string | null; login_version: number } | null;
  if (!target) return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
  if (target.email?.endsWith('@system.internal')) {
    return NextResponse.json({ error: "Un bot n'a pas de lien" }, { status: 400 });
  }

  const version = target.login_version + 1;
  const { error } = await supabase.from('users').update({ login_version: version }).eq('id', target.id);
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });

  return NextResponse.json({ loginToken: buildLoginToken(target.id, version) });
}

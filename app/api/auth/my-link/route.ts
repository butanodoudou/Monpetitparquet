import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { buildLoginToken, getAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: user } = await db()
    .from('users')
    .select('id, login_version')
    .eq('id', auth.userId)
    .maybeSingle();

  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
  return NextResponse.json({ loginToken: buildLoginToken(user.id, user.login_version) });
}

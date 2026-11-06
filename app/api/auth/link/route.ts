import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { parseLoginToken, signToken } from '@/lib/auth';

const INVALID = 'Ce lien ne fonctionne plus. Demande-en un nouveau au commissaire de ta ligue.';

export async function POST(req: NextRequest) {
  const { loginToken } = await req.json();
  const parsed = parseLoginToken(loginToken);
  if (!parsed) return NextResponse.json({ error: INVALID }, { status: 401 });

  const { data: user } = await db()
    .from('users')
    .select('id, username, avatar_color, login_version')
    .eq('id', parsed.userId)
    .maybeSingle();

  if (!user || user.login_version !== parsed.version) {
    return NextResponse.json({ error: INVALID }, { status: 401 });
  }

  return NextResponse.json({
    token: signToken(user.id, user.username),
    user: { id: user.id, username: user.username, avatarColor: user.avatar_color },
  });
}

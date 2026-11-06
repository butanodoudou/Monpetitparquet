import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { buildLoginToken, signToken } from '@/lib/auth';

const COLORS = ['#F59E0B','#EF4444','#10B981','#3B82F6','#8B5CF6','#EC4899','#06B6D4','#84CC16'];
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;

export async function POST(req: NextRequest) {
  const { username } = await req.json();
  const name = typeof username === 'string' ? username.trim() : '';

  if (name.length < USERNAME_MIN) {
    return NextResponse.json({ error: `Pseudo trop court (min ${USERNAME_MIN} caractères)` }, { status: 400 });
  }
  if (name.length > USERNAME_MAX) {
    return NextResponse.json({ error: `Pseudo trop long (max ${USERNAME_MAX} caractères)` }, { status: 400 });
  }

  const avatarColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  const { data, error } = await db()
    .from('users')
    .insert({ username: name, avatar_color: avatarColor })
    .select('id, username, avatar_color, login_version')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ce pseudo est déjà pris' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }

  return NextResponse.json({
    token: signToken(data.id, data.username),
    loginToken: buildLoginToken(data.id, data.login_version),
    user: { id: data.id, username: data.username, avatarColor: data.avatar_color },
  });
}

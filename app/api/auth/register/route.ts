import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/supabase';
import { signToken } from '@/lib/auth';

const COLORS = ['#F59E0B','#EF4444','#10B981','#3B82F6','#8B5CF6','#EC4899','#06B6D4','#84CC16'];

export async function POST(req: NextRequest) {
  const { username, email, password } = await req.json();

  if (!username?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
  }
  if (username.trim().length < 3) {
    return NextResponse.json({ error: 'Pseudo trop court (min 3 caractères)' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Mot de passe trop court (min 6 caractères)' }, { status: 400 });
  }

  const supabase = db();
  const passwordHash = await bcrypt.hash(password, 10);
  const avatarColor = COLORS[Math.floor(Math.random() * COLORS.length)];

  const { data, error } = await supabase
    .from('users')
    .insert({ username: username.trim(), email: email.trim().toLowerCase(), password_hash: passwordHash, avatar_color: avatarColor })
    .select('id, username, email, avatar_color')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Pseudo ou email déjà utilisé' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }

  const token = signToken(data.id, data.username);
  return NextResponse.json({ token, user: { id: data.id, username: data.username, email: data.email, avatarColor: data.avatar_color } });
}

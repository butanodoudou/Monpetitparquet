import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/supabase';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
  }

  const supabase = db();
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .single();

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 });
  }

  const token = signToken(user.id, user.username);
  return NextResponse.json({ token, user: { id: user.id, username: user.username, email: user.email, avatarColor: user.avatar_color } });
}

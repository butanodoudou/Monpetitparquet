import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data } = await db()
    .from('users')
    .select('id, username, email, avatar_color')
    .eq('id', auth.userId)
    .single();

  if (!data) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
  return NextResponse.json({ id: data.id, username: data.username, email: data.email, avatarColor: data.avatar_color });
}

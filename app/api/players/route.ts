import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

// Pool de joueurs actifs. Les joueurs ne sont plus attribués à une ligue : les cartes sont par compte.
export async function GET(req: NextRequest) {
  if (!getAuth(req)) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: players } = await db()
    .from('players')
    .select('*')
    .eq('is_active', true)
    .order('season_avg_fantasy', { ascending: false });

  return NextResponse.json(players ?? []);
}

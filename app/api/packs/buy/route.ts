import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { buyPack } from '@/lib/economy-server';
import type { PackView } from '@/lib/card-view';

export const dynamic = 'force-dynamic';

// Achat d'un paquet standard : -> { coins, pack }. Le paquet est fermé, il s'ouvre dans /packs.
export async function POST(req: NextRequest) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const res = await buyPack(db(), auth.userId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    const pack: PackView = { id: res.packId, source: 'achat', quality: 'standard' };
    return NextResponse.json({ coins: res.coins, pack });
  } catch (e) {
    console.error('packs/buy', e);
    return NextResponse.json({ error: 'Impossible d’acheter un paquet pour l’instant' }, { status: 500 });
  }
}

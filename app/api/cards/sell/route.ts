import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { sellCards } from '@/lib/economy-server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CARDS = 100;

// Vente de cartes : { cardIds } -> { coins }. Le montant est calculé côté serveur, jamais reçu du client.
export async function POST(req: NextRequest) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ids: unknown = body?.cardIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_CARDS
      || !ids.every(id => typeof id === 'string' && UUID.test(id))
      || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'Choisis au moins une carte, sans doublon' }, { status: 400 });
  }

  try {
    const res = await sellCards(db(), auth.userId, ids as string[]);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json({ coins: res.coins });
  } catch (e) {
    console.error('cards/sell', e);
    return NextResponse.json({ error: 'Impossible de vendre ces cartes pour l’instant' }, { status: 500 });
  }
}

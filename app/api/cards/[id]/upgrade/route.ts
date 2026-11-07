import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { upgradeCard } from '@/lib/economy-server';
import { upgradeSelectionError } from '@/lib/economy';
import { loadCardRows, toCardView } from '@/lib/collection';
import type { Rarity } from '@/lib/cards';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Amélioration : { sacrificeCardIds } -> { card }. La carte améliorée est une nouvelle carte (l'ancienne
// est consommée), pour que les duels déjà joués ne changent pas. Renvoie la nouvelle carte.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Carte introuvable' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const ids: unknown = body?.sacrificeCardIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 10 || !ids.every(id => typeof id === 'string' && UUID.test(id))) {
    return NextResponse.json({ error: 'Choisis les cartes à sacrifier' }, { status: 400 });
  }
  const sacrifices = ids as string[];
  const selectionError = upgradeSelectionError(params.id, sacrifices);
  if (selectionError) return NextResponse.json({ error: selectionError }, { status: 400 });

  try {
    const supabase = db();
    // Raretés lues en base, jamais reçues du client. Une carte hors de la collection du compte est absente.
    const rows = await loadCardRows(supabase, auth.userId);
    const rarityOf = new Map<string, Rarity>(rows.map(r => [r.id, r.rarity] as [string, Rarity]));

    const res = await upgradeCard(supabase, auth.userId, params.id, sacrifices, rarityOf);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

    const fresh = (await loadCardRows(supabase, auth.userId)).find(r => r.id === res.cardId);
    if (!fresh) return NextResponse.json({ error: 'Carte améliorée introuvable' }, { status: 500 });
    return NextResponse.json({ card: toCardView(fresh) });
  } catch (e) {
    console.error('cards/upgrade', e);
    return NextResponse.json({ error: 'Impossible d’améliorer cette carte pour l’instant' }, { status: 500 });
  }
}

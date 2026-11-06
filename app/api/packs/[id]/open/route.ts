import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { openPack } from '@/lib/collection';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  if (!UUID.test(params.id)) return NextResponse.json({ error: 'Paquet introuvable' }, { status: 404 });

  try {
    const cards = await openPack(db(), auth.userId, params.id);
    // Même réponse pour un paquet inexistant et pour celui d'un autre joueur
    if (!cards) return NextResponse.json({ error: 'Paquet introuvable' }, { status: 404 });
    return NextResponse.json({ cards });
  } catch (e) {
    console.error('openPack', e);
    return NextResponse.json({ error: "Impossible d'ouvrir ce paquet pour l'instant" }, { status: 500 });
  }
}

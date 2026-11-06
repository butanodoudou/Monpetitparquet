import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { ensureStarterPacks, loadCollection } from '@/lib/collection';

export async function GET(req: NextRequest) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();

  // Rattrape les comptes sans paquets de départ (inscription sans réservoir, ou compte existant)
  try {
    await ensureStarterPacks(supabase, auth.userId);
  } catch (e) {
    console.error('ensureStarterPacks', e);
  }

  try {
    return NextResponse.json(await loadCollection(supabase, auth.userId));
  } catch (e) {
    console.error('loadCollection', e);
    return NextResponse.json({ error: 'Impossible de charger ta collection' }, { status: 500 });
  }
}

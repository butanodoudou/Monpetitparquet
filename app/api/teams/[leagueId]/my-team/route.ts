import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { loadCollection } from '@/lib/collection';
import { isLeagueMember, loadRecords } from '@/lib/week-scoring';

// Ma collection (elle appartient au compte) et mes points dans cette ligue
export async function GET(req: NextRequest, { params }: { params: { leagueId: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();

  if (!(await isLeagueMember(supabase, params.leagueId, auth.userId))) {
    return NextResponse.json({ error: "Tu n'es pas membre de cette ligue" }, { status: 403 });
  }

  try {
    const [collection, records] = await Promise.all([
      loadCollection(supabase, auth.userId),
      loadRecords(supabase, params.leagueId),
    ]);
    return NextResponse.json({ ...collection, totalScore: records[auth.userId]?.pointsFor ?? 0 });
  } catch (e) {
    console.error('my-team', e);
    return NextResponse.json({ error: 'Impossible de charger ton équipe' }, { status: 500 });
  }
}

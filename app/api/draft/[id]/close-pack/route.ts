import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { executeClosePack } from '@/lib/execute-close-pack';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single();

  if (!league) return NextResponse.json({ error: 'Ligue introuvable' }, { status: 404 });
  if (league.commissioner_id !== auth.userId) return NextResponse.json({ error: 'Commissaire uniquement' }, { status: 403 });

  const result = await executeClosePack(supabase, leagueId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true, winners: result.winners, draftComplete: result.draftComplete });
}

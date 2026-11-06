import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { ensureStarterPacks } from '@/lib/collection';
import { createLeagueSchedule } from '@/lib/week-scoring';

// Lance la ligue : plus personne ne la rejoint, le calendrier est créé.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  const { data: league } = await supabase
    .from('leagues')
    .select('id, commissioner_id, draft_status')
    .eq('id', leagueId)
    .single();
  if (!league) return NextResponse.json({ error: 'Ligue introuvable' }, { status: 404 });
  if (league.commissioner_id !== auth.userId) {
    return NextResponse.json({ error: 'Seul le commissaire peut lancer la ligue' }, { status: 403 });
  }
  if (league.draft_status !== 'pending') {
    return NextResponse.json({ error: 'La ligue est déjà lancée' }, { status: 400 });
  }

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, user:users(email)')
    .eq('league_id', leagueId);
  if (!members || members.length < 2) {
    return NextResponse.json({ error: 'Au moins 2 équipes nécessaires' }, { status: 400 });
  }

  // Passage conditionnel : un double clic ne crée pas deux calendriers
  const { data: claimed } = await supabase
    .from('leagues')
    .update({ draft_status: 'completed' })
    .eq('id', leagueId)
    .eq('draft_status', 'pending')
    .select('id');
  if (!claimed?.length) return NextResponse.json({ error: 'La ligue est déjà lancée' }, { status: 400 });

  const { error: scheduleError } = await createLeagueSchedule(supabase, leagueId, members.map(m => m.user_id));
  if (scheduleError) {
    console.error('createLeagueSchedule', scheduleError);
    // On rouvre la ligue pour que le commissaire puisse réessayer
    await supabase.from('leagues').update({ draft_status: 'pending' }).eq('id', leagueId);
    return NextResponse.json({ error: 'Impossible de créer le calendrier, réessaie' }, { status: 500 });
  }

  // Filet de sécurité : chaque membre a ses paquets de départ (les bots les ouvrent d'office)
  for (const m of members) {
    const isBot = ((m.user as unknown as { email: string | null } | null)?.email ?? '').endsWith('@system.internal');
    try {
      await ensureStarterPacks(supabase, m.user_id, { autoOpen: isBot });
    } catch (e) {
      console.error('ensureStarterPacks', e);
    }
  }

  return NextResponse.json({ ok: true });
}

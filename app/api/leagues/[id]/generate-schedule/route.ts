import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { buildRoundRobin } from '@/lib/schedule';

const SEASON_WEEKS = 30;

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
  if (league.commissioner_id !== auth.userId) return NextResponse.json({ error: 'Réservé au commissaire' }, { status: 403 });
  if (league.draft_status !== 'completed') return NextResponse.json({ error: 'Le draft doit être terminé' }, { status: 400 });

  const { count: existingCount } = await supabase
    .from('weekly_matchups')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId);

  if ((existingCount ?? 0) > 0) return NextResponse.json({ error: 'Le calendrier existe déjà' }, { status: 409 });

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId);

  if (!members || members.length < 2) return NextResponse.json({ error: 'Pas assez de membres' }, { status: 400 });

  const userIds = members.map(m => m.user_id);
  const baseRounds = buildRoundRobin(userIds);

  const rows = [];
  for (let week = 1; week <= SEASON_WEEKS; week++) {
    const round = baseRounds[(week - 1) % baseRounds.length];
    for (const [homeUserId, awayUserId] of round) {
      rows.push({ league_id: leagueId, week, home_user_id: homeUserId, away_user_id: awayUserId });
    }
  }

  const { error: insertError } = await supabase.from('weekly_matchups').insert(rows);
  if (insertError) return NextResponse.json({ error: 'Erreur lors de l\'insertion' }, { status: 500 });

  return NextResponse.json({ ok: true, weeksGenerated: SEASON_WEEKS, matchupsCreated: rows.length });
}

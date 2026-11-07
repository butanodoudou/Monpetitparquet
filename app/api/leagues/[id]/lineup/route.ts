import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { lineupError } from '@/lib/cards';
import { resolveLineup } from '@/lib/card-scoring';
import { loadCardRows, toCardView, toScoringCard } from '@/lib/collection';
import type { LineupState } from '@/lib/card-view';
import { getPlayableWeek, isLeagueMember } from '@/lib/week-scoring';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  if (!(await isLeagueMember(supabase, leagueId, auth.userId))) {
    return NextResponse.json({ error: 'Tu n\'es pas membre de cette ligue' }, { status: 403 });
  }

  // La composition s'applique à la prochaine journée à jouer
  const { week: currentWeek, isLocked, lockAt } = await getPlayableWeek(supabase, leagueId);

  try {
    const [rows, { data: lineupRows }] = await Promise.all([
      loadCardRows(supabase, auth.userId),
      // Composition de la journée, sinon la dernière enregistrée
      supabase
        .from('weekly_lineups')
        .select('week, starter_card_ids')
        .eq('league_id', leagueId)
        .eq('user_id', auth.userId)
        .lte('week', currentWeek)
        .not('starter_card_ids', 'is', null)
        .order('week', { ascending: false })
        .limit(1),
    ]);

    const scoring = rows.map(toScoringCard).filter((c): c is NonNullable<typeof c> => c !== null);
    // Composition enregistrée si elle est encore valide, sinon le cinq par défaut
    const starterCardIds = resolveLineup(lineupRows?.[0]?.starter_card_ids, scoring).map(c => c.id);

    const state: LineupState = { currentWeek, isLocked, lockAt, cards: rows.map(toCardView), starterCardIds };
    return NextResponse.json(state);
  } catch (e) {
    console.error('lineup GET', e);
    return NextResponse.json({ error: 'Impossible de charger ta composition' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  if (!(await isLeagueMember(supabase, leagueId, auth.userId))) {
    return NextResponse.json({ error: 'Tu n\'es pas membre de cette ligue' }, { status: 403 });
  }

  // La journée est déterminée côté serveur (le client ne choisit pas)
  const { week, isLocked } = await getPlayableWeek(supabase, leagueId);
  if (isLocked) {
    return NextResponse.json({ error: 'Composition verrouillée : la journée a commencé' }, { status: 423 });
  }

  const body = await req.json().catch(() => null);
  const starterCardIds: unknown = body?.starterCardIds;
  if (!Array.isArray(starterCardIds) || !starterCardIds.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'Il faut 5 cartes différentes' }, { status: 400 });
  }
  const ids = starterCardIds as string[];

  let owned;
  try {
    const rows = await loadCardRows(supabase, auth.userId);
    owned = new Map(
      rows.map(toScoringCard).filter((c): c is NonNullable<typeof c> => c !== null).map(c => [c.id, c])
    );
  } catch (e) {
    console.error('lineup POST collection', e);
    return NextResponse.json({ error: 'Impossible de vérifier ta collection' }, { status: 500 });
  }

  // Tous les postes sont permis : seul le nombre, l'unicité et la propriété des cartes comptent
  const invalid = lineupError(ids, owned);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { error } = await supabase.from('weekly_lineups').upsert(
    { league_id: leagueId, user_id: auth.userId, week, starter_card_ids: ids, updated_at: new Date().toISOString() },
    { onConflict: 'league_id,user_id,week' }
  );
  if (error) {
    console.error('weekly_lineups upsert', error);
    return NextResponse.json({ error: 'Échec de la sauvegarde de la composition' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, week });
}

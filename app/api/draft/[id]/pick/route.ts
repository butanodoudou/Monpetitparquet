import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { buildSnakeOrder } from '@/lib/fantasy';

const PICK_SECONDS = 45;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { playerId, auto = false } = await req.json();
  const supabase = db();

  // Load league with lock-like read (Supabase doesn't support SELECT FOR UPDATE via client,
  // so we validate atomically then insert with unique constraint as guard)
  const { data: league } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!league || league.draft_status !== 'in_progress') {
    return NextResponse.json({ error: 'Draft non active' }, { status: 400 });
  }

  // Build snake order
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, draft_position')
    .eq('league_id', params.id)
    .order('draft_position', { ascending: true });

  if (!members?.length) return NextResponse.json({ error: 'Aucun membre' }, { status: 400 });

  const orderedUserIds = members
    .filter(m => m.draft_position != null)
    .sort((a, b) => a.draft_position - b.draft_position)
    .map(m => m.user_id);

  const pickOrder = buildSnakeOrder(orderedUserIds, league.picks_per_team);
  const pickIndex = league.current_draft_pick - 1;

  if (pickIndex >= pickOrder.length) {
    return NextResponse.json({ error: 'Draft déjà terminée' }, { status: 400 });
  }

  const expectedUserId = pickOrder[pickIndex];

  // Auto-pick: any client can trigger when deadline passed; validate deadline
  if (auto) {
    const deadline = league.pick_deadline ? new Date(league.pick_deadline).getTime() : 0;
    if (Date.now() < deadline) {
      return NextResponse.json({ error: 'Timer pas encore expiré' }, { status: 400 });
    }
  } else {
    if (expectedUserId !== auth.userId) {
      return NextResponse.json({ error: "Ce n'est pas votre tour" }, { status: 403 });
    }
  }

  // Resolve player for auto-pick
  let resolvedPlayerId = playerId;
  if (auto || !resolvedPlayerId) {
    const { data: best } = await supabase
      .from('players')
      .select('id')
      .not('id', 'in', `(SELECT player_id FROM team_players WHERE league_id = '${params.id}')`)
      .order('season_avg_fantasy', { ascending: false })
      .limit(1)
      .single();
    if (!best) return NextResponse.json({ error: 'Aucun joueur disponible' }, { status: 400 });
    resolvedPlayerId = best.id;
  }

  const round = Math.floor(pickIndex / orderedUserIds.length) + 1;
  const pickUserId = auto ? expectedUserId : auth.userId;

  // Insert team_player (UNIQUE constraint prevents duplicate picks)
  const { error: tpError } = await supabase
    .from('team_players')
    .insert({ league_id: params.id, user_id: pickUserId, player_id: resolvedPlayerId });

  if (tpError) {
    if (tpError.code === '23505') {
      return NextResponse.json({ error: 'Joueur déjà drafté' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erreur insertion' }, { status: 500 });
  }

  await supabase.from('draft_picks').insert({
    league_id: params.id,
    user_id: pickUserId,
    player_id: resolvedPlayerId,
    pick_number: league.current_draft_pick,
    round,
  });

  const nextPickIndex = league.current_draft_pick; // next = current + 1 (0-indexed pickIndex + 1)
  const isDone = nextPickIndex >= pickOrder.length;
  const deadline = new Date(Date.now() + PICK_SECONDS * 1000).toISOString();

  await supabase.from('leagues').update({
    draft_status: isDone ? 'completed' : 'in_progress',
    current_draft_pick: league.current_draft_pick + 1,
    pick_deadline: isDone ? null : deadline,
  }).eq('id', params.id);

  return NextResponse.json({ ok: true, done: isDone });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { applyLotteryPick, getLatestSession, getMembership, jsonError } from '@/lib/lottery-server';

export const dynamic = 'force-dynamic';

// Valide le choix du manager dont c'est le tour : { pack_id, player_id, release_player_id? }.
// Le pack doit avoir été ouvert par lui (route /open), le joueur doit en faire partie, la relâche doit
// respecter ROSTER_SLOTS. Le swap team_players est fait par lottery_apply_pick (atomique).
export async function POST(req: NextRequest, { params }: { params: { leagueId: string } }) {
  const auth = getAuth(req);
  if (!auth) return jsonError('Non authentifié', 401);

  const body = await req.json().catch(() => ({}));
  const packId = typeof body?.pack_id === 'string' ? body.pack_id : null;
  const playerId = Number.isInteger(body?.player_id) ? (body.player_id as number) : null;
  const releaseRaw = body?.release_player_id;
  const releasePlayerId = releaseRaw === undefined || releaseRaw === null ? null : Number.isInteger(releaseRaw) ? (releaseRaw as number) : NaN;
  if (!packId || playerId === null || Number.isNaN(releasePlayerId)) return jsonError('Paramètres invalides', 400);

  const supabase = db();
  const membership = await getMembership(supabase, params.leagueId, auth.userId);
  if (!membership) return jsonError('Accès refusé', 403);

  const session = await getLatestSession(supabase, params.leagueId);
  if (!session || session.status !== 'live') return jsonError('Pas de loterie en direct', 400);

  const current = session.draw_order?.find(e => e.pick === session.current_pick);
  if (!current || current.user_id !== auth.userId) return jsonError("Ce n'est pas ton tour", 403);

  const result = await applyLotteryPick(supabase, session, {
    packId,
    userId: auth.userId,
    playerId,
    releasePlayerId,
  });
  if (!result.ok) return jsonError(result.error, result.status);

  return NextResponse.json({ ok: true, status: result.status, current_pick: result.current_pick });
}

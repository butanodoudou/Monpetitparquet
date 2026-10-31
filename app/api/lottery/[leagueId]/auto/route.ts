import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { chooseAutoPick } from '@/lib/lottery';
import {
  applyLotteryPick, getBotUserIds, getLatestSession, getMembership, getRoster, jsonError, type PackRow,
} from '@/lib/lottery-server';

export const dynamic = 'force-dynamic';

// Pick automatique { pick } : timer expiré, ou tour d'un bot. N'importe quel membre peut l'appeler,
// le serveur déduplique sur current_pick (si le pick a déjà avancé, on répond ok sans rien faire).
// Choix : pack déjà ouvert par le manager, sinon un pack fermé au hasard ; meilleur joueur compatible
// avec les postes ; relâche du plus faible du poste.
export async function POST(req: NextRequest, { params }: { params: { leagueId: string } }) {
  const auth = getAuth(req);
  if (!auth) return jsonError('Non authentifié', 401);

  const body = await req.json().catch(() => ({}));
  const expectedPick = Number.isInteger(body?.pick) ? (body.pick as number) : null;
  if (expectedPick === null) return jsonError('pick manquant', 400);

  const supabase = db();
  const membership = await getMembership(supabase, params.leagueId, auth.userId);
  if (!membership) return jsonError('Accès refusé', 403);

  const session = await getLatestSession(supabase, params.leagueId);
  if (!session || session.status !== 'live') return NextResponse.json({ ok: true, skipped: true });
  if (session.current_pick !== expectedPick) return NextResponse.json({ ok: true, skipped: true });

  const current = session.draw_order?.find(e => e.pick === session.current_pick);
  if (!current) return jsonError('Ordre de tirage introuvable', 500);
  const pickerId = current.user_id;

  const bots = await getBotUserIds(supabase, [pickerId]);
  const isBot = bots.indexOf(pickerId) !== -1;
  if (!isBot) {
    const deadline = session.pick_deadline ? new Date(session.pick_deadline).getTime() : 0;
    // 500 ms de tolérance pour l'écart d'horloge entre le client et le serveur
    if (Date.now() < deadline - 500) return jsonError('Timer pas encore expiré', 400);
  }

  const { data: packs } = await supabase.from('lottery_packs').select('*').eq('session_id', session.id);
  const rows = (packs ?? []) as PackRow[];

  // Pack déjà ouvert par ce manager, sinon un pack fermé au hasard
  let pack: PackRow | undefined = rows.find(p => p.opened && !p.taken_by && p.opened_by === pickerId);
  if (!pack) {
    const closed = rows.filter(p => !p.opened);
    if (closed.length === 0) return jsonError('Aucun pack disponible', 409);
    pack = closed[Math.floor(Math.random() * closed.length)];
    const { data: claimed, error } = await supabase
      .from('lottery_packs')
      .update({ opened: true, opened_by: pickerId })
      .eq('id', pack.id)
      .eq('opened', false)
      .select('id');
    if (error || !claimed || claimed.length === 0) return jsonError('Un autre appel traite déjà ce pick', 409);
  }

  const [roster, { data: players }] = await Promise.all([
    getRoster(supabase, session.league_id, pickerId),
    supabase.from('players').select('id, position, season_avg_fantasy').in('id', pack.player_ids),
  ]);

  const choice = chooseAutoPick(
    roster,
    (players ?? []).map(p => ({ id: p.id, position: p.position ?? null, season_avg_fantasy: p.season_avg_fantasy ?? 0 })),
  );
  if (!choice) return jsonError('Aucun choix possible avec ce pack', 422);

  const result = await applyLotteryPick(supabase, session, {
    packId: pack.id,
    userId: pickerId,
    playerId: choice.playerId,
    releasePlayerId: choice.releaseId,
  });
  if (!result.ok) return jsonError(result.error, result.status);

  return NextResponse.json({ ok: true, status: result.status, current_pick: result.current_pick });
}

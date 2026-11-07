import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { drawOrder, isFallbackStartOpen, orderRevealDurationMs, withQualities } from '@/lib/lottery';
import { grantLotteryPacks, getLatestSession, getMembership, jsonError } from '@/lib/lottery-server';

export const dynamic = 'force-dynamic';

// Lance le tirage : tire l'ordre (pondéré par les tickets), fixe la qualité du paquet de chacun et le lui donne.
// Réservé au commissaire ; à partir de 12:00 UTC, n'importe quel membre peut lancer.
// Idempotent : si le tirage a déjà eu lieu, renvoie ok et complète les paquets manquants (sans rien changer d'autre).
export async function POST(req: NextRequest, { params }: { params: { leagueId: string } }) {
  const auth = getAuth(req);
  if (!auth) return jsonError('Non authentifié', 401);

  const supabase = db();
  const membership = await getMembership(supabase, params.leagueId, auth.userId);
  if (!membership) return jsonError('Accès refusé', 403);

  const session = await getLatestSession(supabase, params.leagueId);
  if (!session) return jsonError('Aucune loterie programmée', 404);
  if (session.status === 'cancelled') return jsonError('Cette loterie a été annulée', 400);

  if (session.status === 'done') {
    // Tirage déjà fait : on rejoue les gains depuis l'ordre enregistré (idempotent) au cas où l'un aurait échoué.
    const order = withQualities((session.draw_order ?? []).map(e => ({ user_id: e.user_id, tickets: e.tickets, pick: e.pick })));
    const failed = await grantLotteryPacks(supabase, session, order);
    return NextResponse.json({ ok: true, alreadyStarted: true, failed: failed.length });
  }

  const allowed = membership.isCommissioner || isFallbackStartOpen(new Date(session.created_at), new Date());
  if (!allowed) {
    return jsonError('Seul le commissaire peut lancer le tirage avant midi (UTC)', 403);
  }

  const { data: tickets } = await supabase
    .from('lottery_tickets')
    .select('user_id, tickets')
    .eq('session_id', session.id);
  if (!tickets || tickets.length === 0) return jsonError('Aucun ticket pour cette session', 400);

  const order = withQualities(drawOrder(tickets.map(t => ({ user_id: t.user_id as string, tickets: t.tickets as number }))));

  // Mise à jour conditionnelle : si deux lancements arrivent en même temps, un seul gagne l'ordre.
  // Elle passe avant les gains pour qu'un second tirage ne puisse jamais remplacer un paquet.
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('lottery_sessions')
    .update({
      status: 'done',
      draw_order: order,
      current_pick: order.length,
      pick_deadline: null,
      started_at: nowIso,
      ended_at: nowIso,
    })
    .eq('id', session.id)
    .eq('status', session.status)
    .select('id');
  if (error) return jsonError(error.message, 500);
  if (!updated || updated.length === 0) return NextResponse.json({ ok: true, alreadyStarted: true });

  const failed = await grantLotteryPacks(supabase, session, order);
  return NextResponse.json({
    ok: true,
    alreadyStarted: false,
    revealMs: orderRevealDurationMs(order.length),
    failed: failed.length,
  });
}

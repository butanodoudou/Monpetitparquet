import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  LOTTERY_PICK_SECONDS, drawOrder, isFallbackStartOpen, orderRevealDurationMs,
} from '@/lib/lottery';
import { getLatestSession, getMembership, jsonError } from '@/lib/lottery-server';

export const dynamic = 'force-dynamic';

// Lance le direct : tire l'ordre (pondéré par les tickets) et démarre le premier pick.
// Réservé au commissaire ; à partir de 12:00 UTC, n'importe quel membre peut lancer.
// Idempotent : si la session est déjà lancée, renvoie ok sans rien changer.
export async function POST(req: NextRequest, { params }: { params: { leagueId: string } }) {
  const auth = getAuth(req);
  if (!auth) return jsonError('Non authentifié', 401);

  const supabase = db();
  const membership = await getMembership(supabase, params.leagueId, auth.userId);
  if (!membership) return jsonError('Accès refusé', 403);

  const session = await getLatestSession(supabase, params.leagueId);
  if (!session) return jsonError('Aucune loterie programmée', 404);
  if (session.status === 'live' || session.status === 'done') return NextResponse.json({ ok: true, alreadyStarted: true });
  if (session.status !== 'scheduled') return jsonError('Cette loterie a été annulée', 400);

  const allowed = membership.isCommissioner || isFallbackStartOpen(new Date(session.created_at), new Date());
  if (!allowed) {
    return jsonError('Seul le commissaire peut lancer le tirage avant midi (UTC)', 403);
  }

  const { data: tickets } = await supabase
    .from('lottery_tickets')
    .select('user_id, tickets')
    .eq('session_id', session.id);
  if (!tickets || tickets.length === 0) return jsonError('Aucun ticket pour cette session', 400);

  const order = drawOrder(tickets.map(t => ({ user_id: t.user_id as string, tickets: t.tickets as number })));

  // Le premier timer inclut la durée de la révélation de l'ordre, jouée en même temps chez tous les clients.
  const now = Date.now();
  const firstDeadline = new Date(now + LOTTERY_PICK_SECONDS * 1000 + orderRevealDurationMs(order.length)).toISOString();

  // Mise à jour conditionnelle : si deux lancements arrivent en même temps, un seul gagne.
  const { data: updated, error } = await supabase
    .from('lottery_sessions')
    .update({
      status: 'live',
      draw_order: order,
      current_pick: 1,
      started_at: new Date(now).toISOString(),
      pick_deadline: firstDeadline,
    })
    .eq('id', session.id)
    .eq('status', 'scheduled')
    .select('id');
  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true, alreadyStarted: !updated || updated.length === 0 });
}

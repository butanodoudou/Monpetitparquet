import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import {
  PLAYER_COLUMNS, buildOpenedPack, getLatestSession, getMembership, jsonError, type PackRow,
} from '@/lib/lottery-server';

export const dynamic = 'force-dynamic';

// Ouvre un pack fermé : réservé au manager dont c'est le tour. La réponse contient les 5 cartes,
// c est le seul moment où player_ids sort du serveur (cf. aussi /state pour la reprise après rechargement).
export async function POST(req: NextRequest, { params }: { params: { leagueId: string } }) {
  const auth = getAuth(req);
  if (!auth) return jsonError('Non authentifié', 401);

  const body = await req.json().catch(() => ({}));
  const packId = typeof body?.pack_id === 'string' ? body.pack_id : null;
  if (!packId) return jsonError('pack_id manquant', 400);

  const supabase = db();
  const membership = await getMembership(supabase, params.leagueId, auth.userId);
  if (!membership) return jsonError('Accès refusé', 403);

  const session = await getLatestSession(supabase, params.leagueId);
  if (!session || session.status !== 'live') return jsonError("Pas de loterie en direct", 400);

  const current = session.draw_order?.find(e => e.pick === session.current_pick);
  if (!current || current.user_id !== auth.userId) return jsonError("Ce n'est pas ton tour", 403);

  const { data: pack } = await supabase
    .from('lottery_packs')
    .select('*')
    .eq('id', packId)
    .eq('session_id', session.id)
    .maybeSingle();
  if (!pack) return jsonError('Pack introuvable', 404);
  const row = pack as PackRow;

  if (row.taken_by) return jsonError('Ce pack a déjà été pris', 409);

  if (!row.opened) {
    // Conditionnel : seul le premier appel ouvre. L'index unique partiel empêche d'ouvrir deux packs.
    const { data: claimed, error } = await supabase
      .from('lottery_packs')
      .update({ opened: true, opened_by: auth.userId })
      .eq('id', packId)
      .eq('opened', false)
      .select('id');
    if (error) {
      if (error.code === '23505') return jsonError('Tu as déjà ouvert un pack : fais ton choix', 409);
      return jsonError(error.message, 500);
    }
    if (!claimed || claimed.length === 0) return jsonError('Ce pack vient d\'être ouvert', 409);
  } else if (row.opened_by !== auth.userId) {
    return jsonError('Ce pack a déjà été ouvert', 409);
  }

  const { data: players } = await supabase.from('players').select(PLAYER_COLUMNS).in('id', row.player_ids);
  return NextResponse.json({ ok: true, pack: buildOpenedPack(row, players ?? []) });
}

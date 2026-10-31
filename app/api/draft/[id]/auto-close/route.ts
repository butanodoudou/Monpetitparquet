import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { executeClosePack, CLOSING_STALE_MS } from '@/lib/execute-close-pack';

// Any authenticated league member can trigger this.
// It only acts if the current pack has expired (expires_at < now).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  const { data: membership } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: 'Non membre' }, { status: 403 });

  const now = new Date().toISOString();
  const { data: expiredPack } = await supabase
    .from('auction_packs')
    .select('id')
    .eq('league_id', leagueId)
    .eq('status', 'bidding')
    .lt('expires_at', now)
    .maybeSingle();

  // Reprise : pack bloqué en 'closing' depuis plus de 2 minutes (fonction plantée)
  const staleBefore = new Date(Date.now() - CLOSING_STALE_MS).toISOString();
  const { data: stuckPack } = expiredPack ? { data: null } : await supabase
    .from('auction_packs')
    .select('id')
    .eq('league_id', leagueId)
    .eq('status', 'closing')
    .or(`closing_started_at.is.null,closing_started_at.lt.${staleBefore}`)
    .maybeSingle();

  if (!expiredPack && !stuckPack) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const result = await executeClosePack(supabase, leagueId);
  if (!result.ok && result.error !== 'Aucun pack en cours') {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, closed: true, draftComplete: result.draftComplete });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const supabase = db();
  const leagueId = params.id;

  const { bids } = (await req.json()) as { bids: Record<string, number> };
  if (!bids || typeof bids !== 'object') {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

  const [{ data: league }, { data: member }] = await Promise.all([
    supabase.from('leagues').select('draft_status').eq('id', leagueId).single(),
    supabase.from('league_members').select('draft_credits').eq('league_id', leagueId).eq('user_id', auth.userId).single(),
  ]);

  if (!league || league.draft_status !== 'in_progress') {
    return NextResponse.json({ error: 'Draft non active' }, { status: 400 });
  }
  if (!member) return NextResponse.json({ error: 'Non membre' }, { status: 403 });

  const { data: pack } = await supabase
    .from('auction_packs')
    .select('id, player_ids, status')
    .eq('league_id', leagueId)
    .eq('status', 'bidding')
    .maybeSingle();

  if (!pack) return NextResponse.json({ error: 'Aucun pack en cours' }, { status: 400 });

  const packPlayerIds = pack.player_ids as number[];
  const credits = member.draft_credits ?? 100;

  let totalBid = 0;
  for (const playerId of packPlayerIds) {
    const amount = Number(bids[String(playerId)] ?? 0);
    if (!Number.isInteger(amount) || amount < 0) {
      return NextResponse.json({ error: 'Enchère invalide' }, { status: 400 });
    }
    totalBid += amount;
  }

  if (totalBid > credits) {
    return NextResponse.json({ error: `Budget insuffisant (${credits} crédits disponibles)` }, { status: 400 });
  }

  const bidRows = packPlayerIds.map(playerId => ({
    pack_id: pack.id,
    league_id: leagueId,
    user_id: auth.userId,
    player_id: playerId,
    amount: Number(bids[String(playerId)] ?? 0),
    submitted_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await supabase
    .from('auction_bids')
    .upsert(bidRows, { onConflict: 'pack_id,user_id,player_id' });

  if (upsertErr) return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 });

  return NextResponse.json({ ok: true, totalBid });
}

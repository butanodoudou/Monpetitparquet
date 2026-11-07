'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { getSupabase } from '@/lib/supabase';
import type { LotteryState } from '@/lib/lottery-types';
import { QUALITY_LABEL } from './shared';

interface Props {
  leagueId: string;
  userId: string | undefined;
  /** Affiche le nom de la ligue (page d'accueil, où plusieurs ligues se suivent). */
  leagueName?: string;
}

const chevron = <span className="text-muted text-xl" aria-hidden>&#8250;</span>;

/**
 * Bandeau compact vers la loterie, 2 variantes : tirage à lancer, tirage fait (avec la qualité de ton paquet).
 * Ne rend rien s'il n'y a pas de loterie (ou si elle est annulée). Tout le bandeau est un lien.
 */
export default function LotteryBanner({ leagueId, userId, leagueName }: Props) {
  const [state, setState] = useState<LotteryState | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const s = await apiFetch<LotteryState>(`/api/lottery/${leagueId}/state`);
        if (alive) setState(s);
      } catch { /* bandeau facultatif : on n'affiche rien en cas d'erreur */ }
    };
    load();
    const ch = getSupabase()
      .channel(`lottery-banner-${leagueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lottery_sessions', filter: `league_id=eq.${leagueId}` },
        () => { if (timer) clearTimeout(timer); timer = setTimeout(load, 200); })
      .subscribe();
    return () => { alive = false; if (timer) clearTimeout(timer); getSupabase().removeChannel(ch); };
  }, [leagueId]);

  const session = state?.session;
  if (!state || !session || session.status === 'cancelled') return null;

  const href = `/leagues/${leagueId}/lottery`;
  const prefix = leagueName ? `${leagueName} · ` : '';
  const mine = state.members.find(m => m.user_id === userId);

  if (session.status === 'scheduled') {
    return (
      <Link href={href} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 active:scale-[0.98] transition-transform">
        <span className="w-10 h-10 rounded-lg bg-brand-light text-brand grid place-items-center text-lg font-bold tabular-nums" aria-hidden>
          {mine?.tickets ?? '·'}
        </span>
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block font-semibold text-ink">Loterie du lundi</span>
          <span className="block text-xs text-ink2 truncate">
            {prefix}{mine ? `Tu as ${mine.tickets} ticket${mine.tickets > 1 ? 's' : ''} sur ${state.total_tickets}` : 'Le tirage est prêt'}
          </span>
        </span>
        {chevron}
      </Link>
    );
  }

  const myEntry = state.order.find(e => e.user_id === userId);
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 active:scale-[0.98] transition-transform">
      <span className="w-10 h-10 rounded-lg bg-brand-light text-brand grid place-items-center text-lg font-bold tabular-nums" aria-hidden>
        {myEntry?.pick ?? '·'}
      </span>
      <span className="flex-1 min-w-0 leading-tight">
        <span className="block font-semibold text-ink">Loterie terminée</span>
        <span className="block text-xs text-ink2 truncate">
          {prefix}
          {myEntry
            ? `Tu as tiré un ${QUALITY_LABEL[myEntry.quality].toLowerCase()}${state.my_pack && !state.my_pack.opened ? ', à ouvrir' : ''}`
            : "Voir l'ordre tiré"}
        </span>
      </span>
      {chevron}
    </Link>
  );
}

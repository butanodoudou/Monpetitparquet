'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { getSupabase } from '@/lib/supabase';
import type { LotteryState } from '@/lib/lottery-types';
import { tierLabel, tierText } from './shared';

interface Props {
  leagueId: string;
  userId: string | undefined;
  /** Affiche le nom de la ligue (page d'accueil, où plusieurs ligues se suivent). */
  leagueName?: string;
}

const chevron = <span className="text-slate-500 text-xl" aria-hidden>&#8250;</span>;

/**
 * Bandeau compact vers la loterie, 3 variantes : programmée, en direct, terminée.
 * Ne rend rien s'il n'y a pas de loterie (ou si elle est annulée). Tout le bandeau est un lien.
 */
export default function LotteryBanner({ leagueId, userId, leagueName }: Props) {
  const [state, setState] = useState<LotteryState | null>(null);
  const [secs, setSecs] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const s = await apiFetch<LotteryState>(`/api/lottery/${leagueId}/state`);
        if (!alive) return;
        setOffset(new Date(s.server_now).getTime() - Date.now());
        setState(s);
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

  const deadline = state?.session?.status === 'live' ? state.session.pick_deadline : null;
  useEffect(() => {
    if (!deadline) return;
    const t = new Date(deadline).getTime();
    const tick = () => setSecs(Math.max(0, Math.min(60, Math.ceil((t - (Date.now() + offset)) / 1000))));
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [deadline, offset]);

  const session = state?.session;
  if (!state || !session || session.status === 'cancelled') return null;

  const href = `/leagues/${leagueId}/lottery`;
  const prefix = leagueName ? `${leagueName} · ` : '';
  const mine = state.members.find(m => m.user_id === userId);

  if (session.status === 'scheduled') {
    return (
      <Link href={href} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 active:scale-[0.98] transition-transform">
        <span className="w-10 h-10 rounded-lg bg-amber-500/15 text-amber-400 grid place-items-center text-sm font-black" aria-hidden>LUN</span>
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block font-semibold text-slate-100">Loterie du lundi</span>
          <span className="block text-xs text-slate-400 truncate">
            {prefix}{mine ? `Tu as ${mine.tickets} ticket${mine.tickets > 1 ? 's' : ''} sur ${state.total_tickets}` : 'Le tirage est prêt'}
          </span>
        </span>
        {chevron}
      </Link>
    );
  }

  if (session.status === 'live') {
    const myTurn = state.current_user_id === userId;
    const current = state.members.find(m => m.user_id === state.current_user_id);
    return (
      <Link href={href} className="flex items-center gap-3 rounded-2xl border border-amber-500/60 bg-gradient-to-r from-amber-500/20 to-slate-900 px-4 py-3 active:scale-[0.98] transition-transform">
        <span className="w-10 h-10 rounded-lg bg-amber-500 text-slate-950 grid place-items-center text-xl font-black tabular-nums" aria-hidden>{secs}</span>
        <span className="flex-1 min-w-0 leading-tight">
          <span className="flex items-center gap-1.5 font-semibold text-slate-100">
            <i className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden />Loterie en direct
          </span>
          <span className="block text-xs text-amber-200 truncate">
            {prefix}{myTurn ? "C'est ton tour, ouvre un pack" : current ? `Tour de ${current.username}` : 'Rejoins le tirage'}
          </span>
        </span>
        <span className="text-amber-400 text-xl" aria-hidden>&#8250;</span>
      </Link>
    );
  }

  // done
  const myEvent = state.events.find(e => e.user_id === userId);
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 active:scale-[0.98] transition-transform">
      <span className="w-10 h-10 rounded-lg bg-purple-500/15 text-purple-400 grid place-items-center text-sm font-black" aria-hidden>FIN</span>
      <span className="flex-1 min-w-0 leading-tight">
        <span className="block font-semibold text-slate-100">Loterie terminée</span>
        <span className="block text-xs text-slate-400 truncate">
          {prefix}
          {myEvent?.chosen
            ? <>Tu as pris <span className={tierText(myEvent.chosen.tier)}>{myEvent.chosen.name}</span> ({tierLabel(myEvent.chosen.tier)})</>
            : 'Voir le récap'}
        </span>
      </span>
      {chevron}
    </Link>
  );
}

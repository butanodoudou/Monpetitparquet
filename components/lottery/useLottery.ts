'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { getSupabase } from '@/lib/supabase';
import type { LotteryState } from '@/lib/lottery-types';

/**
 * État de la loterie d'une ligue : fetch de /state, puis refetch à chaque changement de lottery_sessions
 * (Realtime, lecture anon) avec un sondage lent en filet de sécurité si le live est coupé.
 * `now()` renvoie l'heure serveur estimée, pour caler les timers sur pick_deadline.
 */
export function useLottery(leagueId: string) {
  const [state, setState] = useState<LotteryState | null>(null);
  const [error, setError] = useState('');
  const offsetRef = useRef(0);
  const seqRef = useRef(0);

  const refetch = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const s = await apiFetch<LotteryState>(`/api/lottery/${leagueId}/state`);
      if (seq !== seqRef.current) return; // réponse périmée
      offsetRef.current = new Date(s.server_now).getTime() - Date.now();
      setState(s);
      setError('');
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError(e instanceof Error ? e.message : 'Erreur inattendue');
    }
  }, [leagueId]);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ch = getSupabase()
      .channel(`lottery-${leagueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lottery_sessions', filter: `league_id=eq.${leagueId}` },
        () => {
          // Regroupe les rafales d'événements en un seul refetch
          if (timer) clearTimeout(timer);
          timer = setTimeout(refetch, 150);
        })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      getSupabase().removeChannel(ch);
    };
  }, [leagueId, refetch]);

  // Filet de sécurité : sondage lent tant que la loterie est en direct ou programmée
  const status = state?.session?.status;
  useEffect(() => {
    if (status !== 'live' && status !== 'scheduled') return;
    const iv = setInterval(refetch, status === 'live' ? 10000 : 30000);
    return () => clearInterval(iv);
  }, [status, refetch]);

  const now = useCallback(() => Date.now() + offsetRef.current, []);
  return { state, error, refetch, now };
}

/** Millisecondes restantes avant `deadline` (heure serveur), rafraîchies toutes les 250 ms. */
export function useRemainingMs(deadline: string | null | undefined, now: () => number): number {
  const target = deadline ? new Date(deadline).getTime() : null;
  const [ms, setMs] = useState(() => (target === null ? 0 : Math.max(0, target - now())));
  useEffect(() => {
    if (target === null) { setMs(0); return; }
    const tick = () => setMs(Math.max(0, target - now()));
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [target, now]);
  return ms;
}

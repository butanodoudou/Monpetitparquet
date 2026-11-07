'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

interface MissionsResponse {
  week: number;
  missions: { id: string; label: string; done: boolean }[];
  claimed: boolean;
  league: { id: string; name: string } | null;
}

export interface MissionsCardProps {
  /** Change cette valeur pour recharger les missions (par exemple après avoir posé ton cinq). */
  refreshKey?: number | string;
  className?: string;
}

const check = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5l3.2 3L13 4.5" />
  </svg>
);

/** Bloc Missions de la journée en cours, sur l'ensemble des ligues du joueur. Se charge tout seul. */
export default function MissionsCard({ refreshKey, className = '' }: MissionsCardProps) {
  const [data, setData] = useState<MissionsResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    apiFetch<MissionsResponse>('/api/missions')
      .then(d => { if (alive) { setData(d); setError(''); } })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Erreur inattendue'); });
    return () => { alive = false; };
  }, [refreshKey]);

  const doneCount = data?.missions.filter(m => m.done).length ?? 0;

  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`} aria-busy={!data && !error}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Missions de la journée</h2>
        {data && <span className="text-sm text-ink2 tabular-nums">{doneCount} sur {data.missions.length}</span>}
      </div>

      {error && <p className="mt-2 text-sm text-siren" role="alert">{error}</p>}
      {!data && !error && (
        <div className="mt-3 space-y-2 animate-pulse" aria-hidden>
          <div className="h-4 w-56 bg-raised rounded" /><div className="h-4 w-40 bg-raised rounded" /><div className="h-4 w-52 bg-raised rounded" />
        </div>
      )}

      {data && (
        <>
          <ul className="mt-3 space-y-2.5">
            {data.missions.map(m => (
              <li key={m.id} className="flex items-start gap-3">
                <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full grid place-items-center ${m.done ? 'bg-ink text-on-accent' : 'border border-line-strong text-transparent'}`}>
                  {check}
                </span>
                <span className={`text-[15px] leading-snug ${m.done ? 'text-ink' : 'text-ink2'}`}>
                  {m.label}
                  <span className="sr-only">{m.done ? ' : réussie' : ' : pas encore réussie'}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink2 leading-snug">
            {data.claimed
              ? <>Tu as reçu ton paquet de mission. <Link href="/packs" className="font-semibold text-brand underline">Voir mes paquets</Link></>
              : 'Réussis les trois dans la même ligue pour gagner un paquet. Il est donné à la fin de la journée.'}
          </p>
          {data.league && <p className="mt-1 text-xs text-muted">Ligue suivie : {data.league.name}</p>}
        </>
      )}
    </section>
  );
}

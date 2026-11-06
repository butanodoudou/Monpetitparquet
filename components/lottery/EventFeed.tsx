'use client';
import type { LotteryState } from '@/lib/lottery-types';
import { relTime, tierLabel, tierText } from './shared';

/** Fil d'événements, le plus récent en haut : « X a pris Y (Tier) et relâché Z ». */
export default function EventFeed({ state, nowMs }: { state: LotteryState; nowMs: number }) {
  const events = state.events.slice().sort((a, b) => b.pick - a.pick);
  const first = state.order.find(o => o.pick === 1);
  const firstName = state.members.find(m => m.user_id === first?.user_id)?.username;
  return (
    <ul className="space-y-2 text-sm" aria-live="polite">
      {events.map(e => (
        <li key={e.pick} className="flex gap-3 text-ink2 leading-snug">
          <span className="text-xs text-muted w-14 shrink-0 pt-0.5">{relTime(e.taken_at, nowMs)}</span>
          <span>
            <b className="font-semibold text-ink">{e.username}</b> a pris{' '}
            {e.chosen
              ? <span className={`font-semibold ${tierText(e.chosen.tier)}`}>{e.chosen.name} ({tierLabel(e.chosen.tier)})</span>
              : 'un joueur'}
            {e.released ? <> et relâché {e.released.name}</> : null}
          </span>
        </li>
      ))}
      {state.session?.started_at && (
        <li className="flex gap-3 text-ink2 leading-snug">
          <span className="text-xs text-muted w-14 shrink-0 pt-0.5">{relTime(state.session.started_at, nowMs)}</span>
          <span>Ordre tiré.{firstName ? ` ${firstName} passe en premier.` : ''}</span>
        </li>
      )}
    </ul>
  );
}

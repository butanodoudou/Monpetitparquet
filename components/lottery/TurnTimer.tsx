'use client';
import { LOTTERY_PICK_SECONDS } from '@/lib/lottery';
import { NUM_STYLE } from './shared';

interface Props {
  remainingMs: number;
  pick: number;
  total: number;
  myTurn: boolean;
  currentName: string;
  isBot: boolean;
  revealing: boolean;
}

const R = 35;
const C = 2 * Math.PI * R;

/** Anneau SVG calé sur pick_deadline. Sous 10 s : rouge et pulsation. */
export default function TurnTimer({ remainingMs, pick, total, myTurn, currentName, isBot, revealing }: Props) {
  const secs = Math.ceil(remainingMs / 1000);
  const shown = Math.min(secs, LOTTERY_PICK_SECONDS);
  const ratio = Math.min(1, remainingMs / (LOTTERY_PICK_SECONDS * 1000));
  const low = secs < 10 && !revealing;
  return (
    <section className={`mx-4 mt-4 rounded-2xl bg-paper border p-4 flex items-center gap-4 ${myTurn ? 'border-brand/40' : 'border-line'}`}>
      <div className="relative w-20 h-20 shrink-0" role="timer" aria-label={`${shown} secondes restantes`}>
        <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={R} fill="none" stroke="#DDE2E9" strokeWidth="6" />
          <circle cx="40" cy="40" r={R} fill="none" stroke={low ? '#B3281A' : '#B07A1E'} strokeWidth="6"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - ratio)}
            style={{ transition: 'stroke-dashoffset .25s linear' }} />
        </svg>
        <div className={`absolute inset-0 grid place-items-center text-3xl font-bold ${low ? 'text-red-700 animate-pulse' : ''}`} style={NUM_STYLE}>
          {shown}
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-ink2">Pick {Math.min(pick, total)} sur {total}</p>
        <p className="text-lg font-bold leading-tight truncate">
          {revealing ? "Tirage de l'ordre…" : myTurn ? `C'est ton tour, ${currentName}` : `Tour de ${currentName}`}
        </p>
        <p className="text-sm text-ink2 leading-snug mt-0.5">
          {revealing
            ? 'Les premiers picks commencent dans un instant.'
            : myTurn
              ? 'Choisis un pack fermé. Sans réponse, le jeu choisit pour toi.'
              : isBot ? 'Un bot joue automatiquement.' : 'Il choisit un pack fermé.'}
        </p>
      </div>
    </section>
  );
}

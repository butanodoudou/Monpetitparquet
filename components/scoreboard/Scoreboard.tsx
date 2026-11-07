'use client';
import { useEffect, useState } from 'react';
import { ballPosition, formatCountdown, nextSyncAt, type WeekPhase } from '@/lib/week-phase';
import LedNumber from '@/components/scoreboard/LedNumber';
import './scoreboard.css';

interface Side { name: string; team: string; score: number }

interface Props {
  phase: WeekPhase;
  week: number;
  me: Side;
  opponent: Side;
  lockAt: string | null;
}

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', 'h');

const formatKickoff = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

/** Le ton du tableau suit le moment de la semaine. */
function headline(phase: WeekPhase, me: Side, opponent: Side, lockAt: string | null, now: number) {
  const remaining = lockAt ? formatCountdown(new Date(lockAt).getTime() - now) : null;
  switch (phase) {
    case 'pression':
      return { label: 'Verrouillage dans', value: remaining ?? '', siren: true };
    case 'montee':
      return { label: 'Ton cinq se verrouille dans', value: remaining ?? '', siren: false };
    case 'soiree':
      return { label: 'Points sous scellé', value: `Relevé à ${formatTime(nextSyncAt(now))}`, siren: false };
    case 'verdict':
      if (me.score === opponent.score) return { label: 'Fin du duel', value: 'Égalité parfaite', siren: false };
      return me.score > opponent.score
        ? { label: 'Fin du duel', value: `Tu bats ${opponent.name}`, siren: false }
        : { label: 'Fin du duel', value: `${opponent.name} t'a eu`, siren: false };
    default:
      return { label: 'Prochain coup d’envoi', value: lockAt ? formatKickoff(lockAt) : 'À venir', siren: false };
  }
}

export default function Scoreboard({ phase, week, me, opponent, lockAt }: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const off = phase === 'calme';
  const top = now === null ? null : headline(phase, me, opponent, lockAt, now);
  const ball = ballPosition(me.score, opponent.score);

  return (
    <section className={`board board-${phase}`} aria-label={`Journée ${week}, ton duel contre ${opponent.name}`}>
      <div className="board-in">
        <div className="board-head">
          <span>Journée {week}</span>
          {phase === 'soiree' && <span className="board-live">Match en cours</span>}
        </div>

        <div className="board-score">
          <div className="board-side">
            <div className="board-name">{me.name}</div>
            <div className="board-team">{me.team}</div>
            <LedNumber value={me.score} label={me.name} />
          </div>
          <div className="board-side board-side-right">
            <div className="board-name">{opponent.name}</div>
            <div className="board-team">{opponent.team}</div>
            <LedNumber value={opponent.score} label={opponent.name} />
          </div>
        </div>

        <div className="board-court" aria-hidden="true">
          <span className="board-court-line" />
          <span className="board-court-center" />
          <span className="board-court-arc board-court-arc-left" />
          <span className="board-court-arc board-court-arc-right" />
          {!off && <span className="board-court-ball" style={{ left: `${ball}%` }} />}
        </div>

        {top && (
          <div className={`board-clock ${top.siren ? 'board-clock-siren' : ''}`}>
            <span>{top.label}</span>
            <strong>{top.value}</strong>
          </div>
        )}
      </div>
      <div className="board-floor" aria-hidden="true" />
    </section>
  );
}

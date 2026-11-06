// Moment de la semaine d'une ligue, calculé depuis le vrai calendrier et jamais un jour fixe.

export type WeekPhase = 'calme' | 'montee' | 'pression' | 'soiree' | 'verdict';

const HOUR_MS = 3_600_000;
const MONTEE_MS = 24 * HOUR_MS;
const PRESSION_MS = 3 * HOUR_MS;
const VERDICT_MS = 48 * HOUR_MS;

interface PhaseInput {
  now: number;
  lockAt: number | null;
  isLocked: boolean;
  /** Dernière clôture d'un duel de la ligue. */
  lastSettledAt: number | null;
}

export function getWeekPhase({ now, lockAt, isLocked, lastSettledAt }: PhaseInput): WeekPhase {
  if (isLocked) return 'soiree';
  if (lockAt !== null && lockAt - now <= PRESSION_MS) return 'pression';
  if (lockAt !== null && lockAt - now <= MONTEE_MS) return 'montee';
  if (lastSettledAt !== null && now - lastSettledAt <= VERDICT_MS) return 'verdict';
  return 'calme';
}

/** Ces moments regardent le prochain duel. Le calme et le verdict regardent le dernier joué. */
export function showsPlayableWeek(phase: WeekPhase): boolean {
  return phase === 'montee' || phase === 'pression' || phase === 'soiree';
}

/** Prochain relevé des résultats : le cron tourne chaque jour à 23h UTC (voir vercel.json). */
export function nextSyncAt(now: number): number {
  const next = new Date(now);
  next.setUTCHours(23, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

/** « 2 h 18 », « 45 min » ou « 3 j 4 h ». */
export function formatCountdown(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)} j ${hours % 24} h`;
}

/** Position du ballon sur la ligne de terrain, de 0 (je perds nettement) à 100 (je mène nettement). */
export function ballPosition(myScore: number, theirScore: number): number {
  const FULL_COURT_GAP = 40;
  const gap = Math.max(-FULL_COURT_GAP, Math.min(FULL_COURT_GAP, myScore - theirScore));
  return 50 + (gap / FULL_COURT_GAP) * 42;
}

// Vérification des moments de la semaine : npx tsx scripts/check-week-phase.ts
// Sort avec un code 1 si un cas échoue.
import { ballPosition, formatCountdown, getWeekPhase, nextSyncAt, showsPlayableWeek } from '../lib/week-phase';

const H = 3_600_000;
const now = Date.UTC(2026, 10, 7, 12, 0);
let failed = 0;
let total = 0;

function check(name: string, actual: unknown, expected: unknown) {
  total++;
  if (actual === expected) return console.log(`  ok   ${name}`);
  failed++;
  console.log(`  ECHEC ${name} : obtenu ${String(actual)}, attendu ${String(expected)}`);
}

const phase = (lockIn: number | null, isLocked = false, settledAgo: number | null = null) =>
  getWeekPhase({
    now,
    lockAt: lockIn === null ? null : now + lockIn * H,
    isLocked,
    lastSettledAt: settledAgo === null ? null : now - settledAgo * H,
  });

check('verrou lointain', phase(72), 'calme');
check('aucun match connu', phase(null), 'calme');
check('24 h avant, montée', phase(24), 'montee');
check('juste avant la montée', phase(24.1), 'calme');
check('3 h avant, pression', phase(3), 'pression');
check('3 h 06 avant, encore la montée', phase(3.1), 'montee');
check('verrouillé, soirée', phase(-1, true), 'soiree');
check('verrouillé prime sur une clôture récente', phase(-1, true, 2), 'soiree');
check('clôture récente, verdict', phase(72, false, 6), 'verdict');
check('verdict dépassé', phase(72, false, 49), 'calme');
check('la montée prime sur le verdict', phase(10, false, 6), 'montee');

check('calme : dernier duel', showsPlayableWeek('calme'), false);
check('verdict : dernier duel', showsPlayableWeek('verdict'), false);
check('soirée : duel à jouer', showsPlayableWeek('soiree'), true);

check('relevé le soir même', new Date(nextSyncAt(now)).toISOString(), '2026-11-07T23:00:00.000Z');
check('relevé le lendemain', new Date(nextSyncAt(Date.UTC(2026, 10, 7, 23, 30))).toISOString(), '2026-11-08T23:00:00.000Z');
check('à 23h pile, relevé suivant', new Date(nextSyncAt(Date.UTC(2026, 10, 7, 23, 0))).toISOString(), '2026-11-08T23:00:00.000Z');

check('compte à rebours minutes', formatCountdown(45 * 60_000), '45 min');
check('compte à rebours heures', formatCountdown(138 * 60_000), '2 h 18');
check('compte à rebours jours', formatCountdown(76 * H), '3 j 4 h');
check('compte à rebours dépassé', formatCountdown(-5000), '0 min');

check('égalité au centre', ballPosition(80, 80), 50);
check('gros écart borné', ballPosition(200, 0), 92);
check('écart inverse', ballPosition(40, 80), 8);

console.log(`\n${total - failed}/${total} vérifications passées`);
if (failed > 0) process.exit(1);

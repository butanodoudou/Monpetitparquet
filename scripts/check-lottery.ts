// Vérification de la logique pure de la loterie : npx tsx scripts/check-lottery.ts
// Chaque manager reçoit 1 paquet, la loterie décide de sa qualité. Sort avec un code 1 si un cas échoue.

import {
  computeTickets, drawOrder, firstPickOdds, isFallbackStartOpen, qualitiesForOrder, rankMembers,
  silverCount, standingsFromDuels, withQualities,
} from '../lib/lottery';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  total++;
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures++;
  console.log(`  FAIL ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
}

/** PRNG déterministe (mulberry32) pour des tests reproductibles. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Tickets ───────────────────────────────────────────────────
console.log('Tickets');
check('N=1 : 10 tickets', computeTickets(1, 1) === 10);
check('N=0 : pas de division par zéro', computeTickets(1, 0) === 10);
check('N=2 : premier 1, dernier 10', computeTickets(1, 2) === 1 && computeTickets(2, 2) === 10);
check('N=6 : 1,3,5,6,8,10 (maquette)', [1, 2, 3, 4, 5, 6].map(r => computeTickets(r, 6)).join(',') === '1,3,5,6,8,10',
  [1, 2, 3, 4, 5, 6].map(r => computeTickets(r, 6)));
check('N=8 : bornes 1 et 10', computeTickets(1, 8) === 1 && computeTickets(8, 8) === 10);
check('rang hors bornes ramené dans [1,N]', computeTickets(0, 6) === 1 && computeTickets(99, 6) === 10);

let r = rankMembers([{ user_id: 'a', wins: 3, points: 100 }]);
check('classement N=1 : 10 tickets, rang 1', r.length === 1 && r[0].tickets === 10 && r[0].rank === 1);

r = rankMembers([{ user_id: 'a', wins: 2, points: 50 }, { user_id: 'b', wins: 5, points: 10 }]);
check('N=2 : victoires avant points', r.find(x => x.user_id === 'b')!.tickets === 1 && r.find(x => x.user_id === 'a')!.tickets === 10, r);

r = rankMembers([{ user_id: 'a', wins: 2, points: 50 }, { user_id: 'b', wins: 2, points: 80 }]);
check('égalité de victoires : départage aux points', r.find(x => x.user_id === 'b')!.rank === 1);

r = rankMembers([
  { user_id: 'a', wins: 3, points: 100 }, { user_id: 'b', wins: 2, points: 80 },
  { user_id: 'c', wins: 2, points: 80 }, { user_id: 'd', wins: 0, points: 10 },
]);
const tk = (u: string) => r.find(x => x.user_id === u)!;
check('égalité parfaite : mêmes rang et tickets', tk('b').rank === 2 && tk('c').rank === 2 && tk('b').tickets === tk('c').tickets, r);
check('égalité : le suivant saute un rang (1,2,2,4)', tk('d').rank === 4 && tk('d').tickets === 10, r);

r = rankMembers([{ user_id: 'a', wins: 0, points: 0 }, { user_id: 'b', wins: 0, points: 0 }, { user_id: 'c', wins: 0, points: 0 }]);
check('tout le monde à égalité : même nombre de tickets', r.every(x => x.rank === 1 && x.tickets === 1), r);

// ─── Classement depuis les duels réglés ────────────────────────
console.log('Classement depuis les duels réglés');
const st = standingsFromDuels(['a', 'b', 'c'], [
  { home_user_id: 'a', away_user_id: 'b', winner_user_id: 'a', home_score: 120.5, away_score: 100 },
  { home_user_id: 'b', away_user_id: 'c', winner_user_id: null, home_score: 90, away_score: 90 },
  { home_user_id: 'c', away_user_id: 'a', winner_user_id: 'c', home_score: 110, away_score: 105.2 },
]);
const s = (u: string) => st.find(x => x.user_id === u)!;
check('victoires comptées, une égalité ne donne rien', s('a').wins === 1 && s('b').wins === 0 && s('c').wins === 1, st);
check('points cumulés des deux camps', s('a').points === 225.7 && s('b').points === 190 && s('c').points === 200, st);
check('membre sans duel : zéro', standingsFromDuels(['z'], [])[0].wins === 0);
// Le dernier du classement a le plus de tickets
const ranked = rankMembers(st);
check('le dernier du classement a le plus de tickets', ranked.find(x => x.user_id === 'b')!.tickets === 10, ranked);

// ─── Tirage ────────────────────────────────────────────────────
console.log('Tirage de l\'ordre');
let o = drawOrder([{ user_id: 'a', tickets: 10 }], seeded(1));
check('N=1 : un seul pick', o.length === 1 && o[0].pick === 1 && o[0].user_id === 'a');

o = drawOrder([{ user_id: 'a', tickets: 1 }, { user_id: 'b', tickets: 10 }], seeded(2));
check('N=2 : ordre complet sans doublon', o.length === 2 && o[0].user_id !== o[1].user_id && o[0].pick === 1 && o[1].pick === 2);

const entries6 = [10, 8, 6, 5, 3, 1].map((t, i) => ({ user_id: 'u' + i, tickets: t }));
let allValid = true;
for (let sd = 0; sd < 200; sd++) {
  const d = drawOrder(entries6, seeded(sd));
  const ids = d.map(x => x.user_id).sort().join();
  if (d.length !== 6 || ids !== entries6.map(e => e.user_id).sort().join() || d.some((x, i) => x.pick !== i + 1)) allValid = false;
}
check('6 managers : chaque tirage est une permutation complète', allValid);

// Fréquence du premier pick proportionnelle aux tickets (tolérance large)
const rng = seeded(42);
const wins: Record<string, number> = {};
const RUNS = 20000;
for (let i = 0; i < RUNS; i++) {
  const first = drawOrder(entries6, rng)[0].user_id;
  wins[first] = (wins[first] ?? 0) + 1;
}
const totalTickets = 33;
const okFreq = entries6.every(e => Math.abs((wins[e.user_id] ?? 0) / RUNS - e.tickets / totalTickets) < 0.02);
check('fréquence du 1er pick proportionnelle aux tickets', okFreq, wins);

o = drawOrder([{ user_id: 'a', tickets: 4 }, { user_id: 'b', tickets: 4 }, { user_id: 'c', tickets: 4 }], () => 0.9999999);
check('rng à la borne haute : ne plante pas, ordre complet', o.length === 3);

const odds = firstPickOdds(entries6);
check('chances de passer 1er : somme ~100 %', Math.abs(Object.values(odds).reduce((sum, v) => sum + v, 0) - 100) < 0.5, odds);
check('chances : 10/33 = 30,3 %', odds['u0'] === 30.3, odds['u0']);

// ─── Qualité du paquet selon l'ordre ───────────────────────────
console.log('Qualités des paquets');
const q = (n: number) => qualitiesForOrder(n).join(',');
check('n=1 : Or', q(1) === 'or', q(1));
check('n=2 : Or, Argent', q(2) === 'or,argent', q(2));
check('n=3 : Or, Argent, Standard (floor(3/3)=1)', q(3) === 'or,argent,standard', q(3));
check('n=5 : un seul Argent', q(5) === 'or,argent,standard,standard,standard', q(5));
check('n=6 : deux Argent', q(6) === 'or,argent,argent,standard,standard,standard', q(6));
check('n=8 : deux Argent', q(8) === 'or,argent,argent,standard,standard,standard,standard,standard', q(8));
check('n=9 : trois Argent', qualitiesForOrder(9).filter(x => x === 'argent').length === 3);
check('n=0 : rien', qualitiesForOrder(0).length === 0);
let sizesOk = true;
for (let n = 1; n <= 30; n++) {
  const qs = qualitiesForOrder(n);
  const ors = qs.filter(x => x === 'or').length;
  const silvers = qs.filter(x => x === 'argent').length;
  if (qs.length !== n || ors !== 1 || silvers !== Math.min(silverCount(n), n - 1)) sizesOk = false;
}
check('de 1 à 30 managers : un Or, max(1, floor(n/3)) Argent, le reste Standard', sizesOk);

const drawn = withQualities(drawOrder(entries6, seeded(7)));
check('withQualities : le 1er tiré a Or, le 2e et le 3e... selon n=6', drawn[0].quality === 'or' && drawn[1].quality === 'argent' && drawn[2].quality === 'argent' && drawn[3].quality === 'standard', drawn);
check('withQualities : chaque manager a exactement une qualité', new Set(drawn.map(d => d.user_id)).size === 6 && drawn.every(d => !!d.quality));

// Le dernier du classement (10 tickets) obtient plus souvent Or que le premier (1 ticket)
const goldCount: Record<string, number> = {};
const rng2 = seeded(99);
for (let i = 0; i < RUNS; i++) {
  const first = withQualities(drawOrder(entries6, rng2)).find(e => e.quality === 'or')!.user_id;
  goldCount[first] = (goldCount[first] ?? 0) + 1;
}
check('le dernier du classement a le plus de chances d\'avoir Or', (goldCount['u0'] ?? 0) > (goldCount['u5'] ?? 0) * 5, goldCount);

// ─── Lancement ─────────────────────────────────────────────────
console.log('Lancement du tirage');
const created = new Date('2026-11-02T08:00:00Z');
check('avant 12:00 UTC : repli fermé', !isFallbackStartOpen(created, new Date('2026-11-02T11:59:59Z')));
check('à partir de 12:00 UTC : repli ouvert', isFallbackStartOpen(created, new Date('2026-11-02T12:00:00Z')));
check('les jours suivants : repli ouvert', isFallbackStartOpen(created, new Date('2026-11-03T07:00:00Z')));

console.log(`\n${total - failures}/${total} vérifications passées`);
if (failures > 0) { console.log(`${failures} échec(s)`); process.exit(1); }

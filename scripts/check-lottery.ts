// Vérification de la logique pure de la loterie : npx tsx scripts/check-lottery.ts
// Sort avec un code 1 si un cas échoue.

import {
  buildPacks, chooseAutoPick, computeTickets, drawOrder, firstPickOdds,
  isFallbackStartOpen, rankMembers, releaseRule, validatePick,
  type PoolPlayer, type RosterPlayer,
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

// ─── Tirage ────────────────────────────────────────────────────
console.log('Tirage de l\'ordre');
let o = drawOrder([{ user_id: 'a', tickets: 10 }], seeded(1));
check('N=1 : un seul pick', o.length === 1 && o[0].pick === 1 && o[0].user_id === 'a');

o = drawOrder([{ user_id: 'a', tickets: 1 }, { user_id: 'b', tickets: 10 }], seeded(2));
check('N=2 : ordre complet sans doublon', o.length === 2 && o[0].user_id !== o[1].user_id && o[0].pick === 1 && o[1].pick === 2);

const entries6 = [10, 8, 6, 5, 3, 1].map((t, i) => ({ user_id: 'u' + i, tickets: t }));
let allValid = true;
for (let s = 0; s < 200; s++) {
  const d = drawOrder(entries6, seeded(s));
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
check('chances de passer 1er : somme ~100 %', Math.abs(Object.values(odds).reduce((s, v) => s + v, 0) - 100) < 0.5, odds);
check('chances : 10/33 = 30,3 %', odds['u0'] === 30.3, odds['u0']);

// ─── Packs ─────────────────────────────────────────────────────
console.log('Packs');
function makePool(elite: number, star: number, basique: number): PoolPlayer[] {
  const pool: PoolPlayer[] = [];
  let id = 1;
  for (let i = 0; i < elite; i++) pool.push({ id: id++, tier: 'elite' });
  for (let i = 0; i < star; i++) pool.push({ id: id++, tier: 'star' });
  for (let i = 0; i < basique; i++) pool.push({ id: id++, tier: 'basique' });
  return pool;
}
function noDuplicates(packs: PoolPlayer[][]) {
  const ids = packs.reduce<number[]>((acc, p) => acc.concat(p.map(x => x.id)), []);
  return ids.length === new Set(ids).size;
}

let b = buildPacks(makePool(10, 20, 60), 6, seeded(3));
check('pool large : 6 packs de 5, non dégradés', b.ok && b.packSize === 5 && !b.degraded && b.packs.length === 6);
if (b.ok) {
  check('composition 1 elite / 2 star / 2 basique par pack', b.packs.every(p =>
    p.filter(x => x.tier === 'elite').length === 1 &&
    p.filter(x => x.tier === 'star').length === 2 &&
    p.filter(x => x.tier === 'basique').length === 2));
  check('aucun joueur dans deux packs', noDuplicates(b.packs));
}

b = buildPacks(makePool(1, 3, 3), 1, seeded(4));
check('N=1, pool juste suffisant : 1 pack de 5', b.ok && b.packSize === 5 && b.packs.length === 1);

b = buildPacks(makePool(4, 8, 8), 6, seeded(5));
check('pool insuffisant pour 5 : packs de 3 dégradés', b.ok && b.packSize === 3 && b.degraded && b.packs.every(p => p.length === 3), b);
if (b.ok) check('packs de 3 sans doublon', noDuplicates(b.packs));

b = buildPacks(makePool(0, 4, 10), 4, seeded(6));
check('plus d\'elite : repli sur le tier le plus proche, packs pleins', b.ok && b.packs.every(p => p.length === 3), b);

b = buildPacks(makePool(1, 1, 3), 2, seeded(7));
check('pool entre N et 3N : packs plus petits, pas de pack vide', b.ok && b.packs.every(p => p.length >= 1) && noDuplicates(b.packs), b);

b = buildPacks([], 6, seeded(8));
check('pool vide : refus (session annulée)', !b.ok && b.reason === 'empty');

b = buildPacks(makePool(0, 0, 3), 6, seeded(9));
check('moins de joueurs que de packs : refus', !b.ok && b.reason === 'insufficient');

b = buildPacks([{ id: 1, tier: 'elite' }, { id: 1, tier: 'elite' }, { id: 2, tier: 'star' }], 2, seeded(10));
check('doublons dans le pool : dédoublonnés', b.ok && noDuplicates(b.packs), b);

// ─── Relâche et postes ─────────────────────────────────────────
console.log('Relâche et postes');
const P = (id: number, position: string, avg: number): RosterPlayer => ({ player_id: id, position, season_avg_fantasy: avg });
// 3 arrières (PG, SG, SG), 2 ailiers (SF, SF), 3 intérieurs (PF, C, C)
const full: RosterPlayer[] = [
  P(1, 'PG', 20), P(2, 'SG', 15), P(3, 'SG', 12),
  P(4, 'SF', 18), P(5, 'SF', 10),
  P(6, 'PF', 25), P(7, 'C', 14), P(8, 'C', 9),
];

check('roster plein : relâche obligatoire', releaseRule(full, 'PG').releaseRequired);
check('roster plein, carte arrière : candidats = les 3 arrières', releaseRule(full, 'SG').candidates.sort().join() === '1,2,3');
check('relâche du bon poste acceptée', validatePick(full, 'PG', 3).ok);
check('relâche à un mauvais poste refusée', !validatePick(full, 'PG', 6).ok, validatePick(full, 'PG', 6));
check('roster plein sans relâche refusé', !validatePick(full, 'C', null).ok);
check('relâche d\'un joueur absent du roster refusée', !validatePick(full, 'C', 999).ok);
check('poste inconnu refusé', !validatePick(full, 'XX', 1).ok && !validatePick(full, null, 1).ok);
check('PF et C sont le même groupe (intérieurs)', validatePick(full, 'PF', 7).ok);
check('SF relâche un ailier, pas un arrière', validatePick(full, 'SF', 5).ok && !validatePick(full, 'SF', 1).ok);

const seven = full.filter(p => p.player_id !== 8); // il manque un intérieur
check('roster à 7, poste libre : pas de relâche', !releaseRule(seven, 'C').releaseRequired && validatePick(seven, 'C', null).ok);
check('roster à 7, poste libre : relâche interdite', !validatePick(seven, 'C', 7).ok);
check('roster à 7, poste complet : swap du même poste obligatoire', releaseRule(seven, 'PG').releaseRequired && validatePick(seven, 'PG', 2).ok && !validatePick(seven, 'PG', null).ok);

const empty: RosterPlayer[] = [];
check('roster vide : tout poste accepté sans relâche', validatePick(empty, 'PG', null).ok && validatePick(empty, 'C', null).ok);

const atypical: RosterPlayer[] = [ // 4 arrières + 2 ailiers + 2 intérieurs (hors règle)
  P(1, 'PG', 20), P(2, 'SG', 15), P(3, 'SG', 12), P(4, 'PG', 11),
  P(5, 'SF', 18), P(6, 'SF', 10), P(7, 'PF', 25), P(8, 'C', 14),
];
const ar = releaseRule(atypical, 'C');
check('roster atypique plein, poste libre : relâche d\'un groupe en surnombre', ar.releaseRequired && ar.candidates.sort().join() === '1,2,3,4', ar);

// Auto-pick
let auto = chooseAutoPick(full, [
  { id: 101, position: 'PG', season_avg_fantasy: 30 },
  { id: 102, position: 'C', season_avg_fantasy: 22 },
  { id: 103, position: 'SF', season_avg_fantasy: 28 },
]);
check('auto : meilleure moyenne, relâche le plus faible du poste', auto?.playerId === 101 && auto?.releaseId === 3, auto);

auto = chooseAutoPick(seven, [
  { id: 201, position: 'PG', season_avg_fantasy: 30 },
  { id: 202, position: 'C', season_avg_fantasy: 12 },
]);
check('auto : roster à 7, privilégie la meilleure carte même avec swap', auto?.playerId === 201 && auto?.releaseId === 3, auto);

auto = chooseAutoPick(full, [{ id: 301, position: null, season_avg_fantasy: 99 }, { id: 302, position: 'SG', season_avg_fantasy: 5 }]);
check('auto : ignore les cartes sans poste valide', auto?.playerId === 302, auto);

auto = chooseAutoPick(full, [{ id: 401, position: null, season_avg_fantasy: 10 }]);
check('auto : aucune carte prenable -> null', auto === null);

auto = chooseAutoPick(empty, [{ id: 501, position: 'C', season_avg_fantasy: 10 }]);
check('auto : roster vide, pas de relâche', auto?.playerId === 501 && auto?.releaseId === null);

// ─── Lancement ─────────────────────────────────────────────────
console.log('Lancement du direct');
const created = new Date('2026-11-02T08:00:00Z');
check('avant 12:00 UTC : repli fermé', !isFallbackStartOpen(created, new Date('2026-11-02T11:59:59Z')));
check('à partir de 12:00 UTC : repli ouvert', isFallbackStartOpen(created, new Date('2026-11-02T12:00:00Z')));
check('les jours suivants : repli ouvert', isFallbackStartOpen(created, new Date('2026-11-03T07:00:00Z')));

console.log(`\n${total - failures}/${total} vérifications passées`);
if (failures > 0) { console.log(`${failures} échec(s)`); process.exit(1); }

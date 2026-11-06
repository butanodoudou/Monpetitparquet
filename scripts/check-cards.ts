// Vérification des règles du jeu de cartes : npx tsx scripts/check-cards.ts
// Sort avec un code 1 si un cas échoue.
import {
  PACK_ODDS, PACK_PRICE, RARITIES, RARITY_CONFIG, CARDS_PER_PACK, STARTER_PACKS, cardMultiplier, defaultLineup, drawPack, drawRarity,
  drawStarterPacks, groupOf, lineupError, nextRarity, positionMultiplier, upgradeError, type LineupCard, type PoolPlayer, type Rarity,
} from '../lib/cards';

let failed = 0;
let total = 0;

function check(name: string, ok: boolean, detail = '') {
  total++;
  if (ok) return console.log(`  ok   ${name}`);
  failed++;
  console.log(`  ECHEC ${name} ${detail}`);
}

const near = (a: number, b: number, margin = 1e-9) => Math.abs(a - b) <= margin;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pool: PoolPlayer[] = Array.from({ length: 177 }, (_, i) => ({ id: i + 1, position: i % 8 === 0 ? 'C' : i % 2 ? 'PG' : 'SF' }));

console.log('Multiplicateurs');
check('Hifi Bronze à 30 points en marque 27', near(30 * cardMultiplier('bronze', 'arriere', 'arriere'), 27));
check('rotation Platine à 12 points en marque 14,4', near(12 * cardMultiplier('platine', 'sf', 'sf'), 14.4));
check('un poste d’écart : -20 %', positionMultiplier('arriere', 'sf') === 0.8);
check('deux postes d’écart : -35 %', positionMultiplier('grand', 'arriere') === 0.65);
check('écart symétrique', positionMultiplier('arriere', 'grand') === 0.65);
check('Platine à un poste d’écart : 0,96', near(cardMultiplier('platine', 'arriere', 'sf'), 0.96));
check('pivot à la mène en Bronze : 0,585', near(cardMultiplier('bronze', 'grand', 'arriere'), 0.585));
check('poste inconnu = ailier', groupOf('F') === 'sf' && groupOf(null) === 'sf');
check('PF = grand', groupOf('PF') === 'grand');

console.log('Tirages');
for (const quality of ['standard', 'argent', 'or'] as const) {
  const sum = RARITIES.reduce((s, r) => s + PACK_ODDS[quality][r], 0);
  check(`chances ${quality} : total 100 %`, near(sum, 1));
}

const rng = seeded(42);
const counts: Record<Rarity, number> = { bronze: 0, silver: 0, gold: 0, platine: 0 };
const N = 200_000;
for (let i = 0; i < N; i++) counts[drawRarity(rng)]++;
for (const r of RARITIES) {
  check(`fréquence ${r} proche de la table`, near(counts[r] / N, PACK_ODDS.standard[r], 0.005), `${counts[r] / N}`);
}

const pack = drawPack(pool, seeded(1));
check('un paquet contient 5 cartes', pack.length === CARDS_PER_PACK);
check('tirage le plus haut : Platine', drawRarity(() => 0.9999999) === 'platine');

let goldOk = true;
let groupsOk = true;
let sizeOk = true;
for (let seed = 0; seed < 3000; seed++) {
  const packs = drawStarterPacks(pool, seeded(seed));
  const cards = packs.flat();
  if (packs.length !== STARTER_PACKS || cards.length !== 25) sizeOk = false;
  if (!cards.some(c => c.rarity === 'gold' || c.rarity === 'platine')) goldOk = false;
  const groups = new Set(cards.map(c => groupOf(pool[c.player_id - 1].position)));
  if (groups.size !== 3) groupsOk = false;
}
check('toujours 5 paquets et 25 cartes', sizeOk);
check('toujours au moins un Gold ou mieux', goldOk);
check('toujours un joueur de chaque groupe', groupsOk);

const rarePool: PoolPlayer[] = [{ id: 1, position: 'C' }, ...Array.from({ length: 300 }, (_, i) => ({ id: i + 2, position: 'PG' }))];
let rareOk = true;
for (let seed = 0; seed < 500; seed++) {
  const cards = drawStarterPacks(rarePool, seeded(seed)).flat();
  if (!cards.some(c => c.player_id === 1) || !cards.some(c => c.rarity === 'gold' || c.rarity === 'platine')) rareOk = false;
}
check('la garantie de poste tient avec un seul pivot en réserve', rareOk);

check('réservoir vide refusé', (() => { try { drawPack([], seeded(1)); return false; } catch { return true; } })());

console.log('Composition');
const card = (id: string, player_id: number, rarity: Rarity, group: LineupCard['group'], season_avg_fantasy: number): LineupCard =>
  ({ id, player_id, rarity, group, season_avg_fantasy });
const cards = [
  card('a', 1, 'gold', 'arriere', 25), card('a2', 1, 'bronze', 'arriere', 25), card('b', 2, 'silver', 'arriere', 20),
  card('c', 3, 'silver', 'sf', 18), card('d', 4, 'platine', 'grand', 22), card('e', 5, 'bronze', 'grand', 15), card('f', 6, 'bronze', 'sf', 5),
];
const owned = new Map(cards.map(c => [c.id, c]));
check('cinq valide accepté', lineupError(['a', 'b', 'c', 'd', 'e'], owned) === null);
check('quatre cartes refusées', lineupError(['a', 'b', 'c', 'd'], owned) !== null);
check('carte en double refusée', lineupError(['a', 'a', 'c', 'd', 'e'], owned) !== null);
check('deux cartes du même joueur refusées', lineupError(['a', 'a2', 'c', 'd', 'e'], owned)?.includes('joueur') === true);
check('carte d’un autre refusée', lineupError(['a', 'b', 'c', 'd', 'zzz'], owned) !== null);

const auto = defaultLineup(cards);
check('cinq par défaut complet', auto.length === 5);
check('cinq par défaut valide', lineupError(auto, owned) === null);
check('cinq par défaut : meilleure version du joueur', auto.includes('a') && !auto.includes('a2'));
check('petite collection : cinq incomplet sans erreur', defaultLineup(cards.slice(0, 2)).length === 1);

console.log('Économie');
const value = RARITIES.reduce((s, r) => s + PACK_ODDS.standard[r] * RARITY_CONFIG[r].sellValue, 0) * CARDS_PER_PACK;
check('revendre un paquet rapporte moins que son prix', value < PACK_PRICE, `${value}`);
check('environ 62 pièces par paquet revendu', near(value, 61.75, 0.01), `${value}`);
for (const q of ['argent', 'or'] as const) {
  const v = RARITIES.reduce((s, r) => s + PACK_ODDS[q][r] * RARITY_CONFIG[r].sellValue, 0) * CARDS_PER_PACK;
  check(`un paquet ${q} revendu reste sous le prix d’achat`, v < PACK_PRICE, `${v}`);
}
check('Bronze monte en Silver', nextRarity('bronze') === 'silver');
check('Platine ne monte plus', nextRarity('platine') === null);
check('amélioration Bronze valide', upgradeError('bronze', ['bronze', 'bronze', 'bronze']) === null);
check('amélioration Gold : 5 cartes', upgradeError('gold', ['gold', 'gold', 'gold']) !== null);
check('sacrifice d’une autre rareté refusé', upgradeError('silver', ['silver', 'silver', 'bronze']) !== null);
check('Platine refusé', upgradeError('platine', []) !== null);

console.log(`\n${total - failed}/${total} vérifications passées`);
if (failed > 0) process.exit(1);

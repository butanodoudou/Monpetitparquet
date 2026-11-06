// Vérification du calcul des points par cartes : npx tsx scripts/check-card-scoring.ts
// Fonctions pures uniquement : aucune base de données. Sort avec un code 1 si un cas échoue.
import { cardsAt, resolveLineup, scoreStarters, type PerfLine, type ScoringCard } from '../lib/card-scoring';
import { lineupCutoffMs } from '../lib/week-scoring';
import type { PositionGroup } from '../lib/fantasy';
import type { Rarity } from '../lib/cards';

let failed = 0;
let total = 0;
function check(name: string, ok: boolean, detail = '') {
  total++;
  if (ok) return console.log(`  ok   ${name}`);
  failed++;
  console.log(`  ECHEC ${name} ${detail}`);
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const T0 = Date.parse('2026-11-01T00:00:00Z');
const LOCK = Date.parse('2026-11-10T18:00:00Z');
const AFTER = Date.parse('2026-11-12T00:00:00Z');

let seq = 0;
function card(user: string, player: number, rarity: Rarity, group: PositionGroup, extra: Partial<ScoringCard> = {}): ScoringCard {
  return {
    id: `c${++seq}`, user_id: user, player_id: player, rarity, group, season_avg_fantasy: 10 + player,
    team_id: player, nationality: 'FR', obtainedMs: T0, consumedMs: null, ...extra,
  };
}
// Cinq complet d'un manager : arrière, arrière, ailier, grand, grand, chaque joueur de son poste
function fiveOf(user: string, firstPlayer: number, rarity: Rarity): ScoringCard[] {
  const groups: PositionGroup[] = ['arriere', 'arriere', 'sf', 'grand', 'grand'];
  return groups.map((g, i) => card(user, firstPlayer + i, rarity, g));
}
const perfs = (rows: PerfLine[]) => {
  const m = new Map<number, PerfLine[]>();
  for (const r of rows) m.set(r.player_id, [...(m.get(r.player_id) ?? []), r]);
  return m;
};
const noWinners = new Set<number>();

console.log('Rareté');
{
  const bronze = fiveOf('a', 100, 'bronze');
  const platine = fiveOf('b', 100, 'platine'); // mêmes joueurs, autre rareté
  const p = perfs([100, 101, 102, 103, 104].map(id => ({ player_id: id, fantasy_score: 20, blocks: 0, steals: 0 })));
  const sa = scoreStarters(bronze, p, noWinners);
  const sb = scoreStarters(platine, p, noWinners);
  check('bronze : 100 pts de base x 0,9', near(sa.base, 90), String(sa.base));
  check('platine : 100 pts de base x 1,2', near(sb.base, 120), String(sb.base));
}

console.log('Deux managers avec le même joueur');
{
  // a et b alignent les mêmes joueurs 100..104 ; seul a a de la défense chez ses titulaires... les perfs sont communes,
  // donc la défense brute vaut pour les deux : 12 contres+interceptions chacun, jamais doublée ni perdue.
  const a = fiveOf('a', 100, 'silver');
  const b = fiveOf('b', 100, 'gold');
  const p = perfs([
    { player_id: 100, fantasy_score: 30, blocks: 2, steals: 4 },
    { player_id: 101, fantasy_score: 10, blocks: 0, steals: 0 },
    { player_id: 102, fantasy_score: 10, blocks: 1, steals: 1 },
    { player_id: 103, fantasy_score: 10, blocks: 2, steals: 0 },
    { player_id: 104, fantasy_score: 10, blocks: 1, steals: 1 },
  ]);
  const sa = scoreStarters(a, p, noWinners);
  const sb = scoreStarters(b, p, noWinners);
  check('le même joueur compte pour les deux managers', sa.base > 0 && sb.base > 0);
  check('silver : 70 pts', near(sa.base, 70), String(sa.base));
  check('gold : 70 x 1,1', near(sb.base, 77), String(sb.base));
  check('défense identique pour les deux (12 brut)', near(sa.defMult, sb.defMult) && sa.defMult < 1);
  // Chimie : cinq clubs différents, même nationalité => 10 paires x 1 pt, plafonné à 8
  check('chimie calculée par manager (nationalité, plafond 8)', near(sa.chem, 8) && near(sb.chem, 8), `${sa.chem}/${sb.chem}`);
}

console.log('Hors poste');
{
  // Un grand placé à l'arrière : deux postes d'écart, x0,65 ; bronze x0,9
  const cards = fiveOf('a', 100, 'silver');
  cards[0] = card('a', 200, 'bronze', 'grand'); // place 0 = arrière
  const p = perfs([{ player_id: 200, fantasy_score: 20, blocks: 0, steals: 0 }]);
  const s = scoreStarters(cards, p, noWinners);
  check('multiplicateur rareté x poste', near(s.starters[0].multiplier, 0.9 * 0.65), String(s.starters[0].multiplier));
  check('points du titulaire', near(s.base, 20 * 0.9 * 0.65), String(s.base));
  // Un ailier à l'arrière : un poste d'écart, x0,8
  const wing = fiveOf('a', 100, 'silver');
  wing[0] = card('a', 201, 'silver', 'sf');
  const s2 = scoreStarters(wing, perfs([{ player_id: 201, fantasy_score: 20, blocks: 0, steals: 0 }]), noWinners);
  check('un poste d’écart : x0,8', near(s2.base, 16), String(s2.base));
}

console.log('Bonus week-end');
{
  const cards = fiveOf('a', 100, 'silver'); // team_id différents = 5 équipes
  const win = new Set<number>([100, 101, 102]);
  check('3 équipes gagnantes : x1,10', near(scoreStarters(cards, perfs([]), win).weekendMult, 1.1));
  check('2 équipes gagnantes : x1', near(scoreStarters(cards, perfs([]), new Set([100, 101])).weekendMult, 1));
}

console.log('Carte vendue après coup');
{
  const sold = card('a', 100, 'gold', 'arriere', { consumedMs: AFTER });
  const kept = fiveOf('a', 101, 'silver');
  const all = [sold, ...kept];
  check('au verrou, la carte vendue plus tard est encore possédée', cardsAt(all, LOCK).some(c => c.id === sold.id));
  check('après la vente, elle ne l’est plus', !cardsAt(all, AFTER + 1).some(c => c.id === sold.id));
  const saved = [sold.id, kept[0].id, kept[2].id, kept[3].id, kept[4].id];
  const past = resolveLineup(saved, cardsAt(all, LOCK));
  check('cinq enregistré toujours valide pour la journée passée', past.length === 5 && past[0].id === sold.id);
  const future = resolveLineup(saved, cardsAt(all, AFTER + 1));
  check('pour une journée future le cinq vendu est écarté (cinq par défaut)', !future.some(c => c.id === sold.id));
  // Carte d'un paquet ouvert après le verrou : absente d'une journée passée
  const late = card('a', 300, 'platine', 'sf', { obtainedMs: AFTER });
  check('carte obtenue après le verrou absente de la journée passée', !cardsAt([late], LOCK).length);
}

console.log('Collection de moins de 5 cartes');
{
  const three = [card('a', 100, 'silver', 'arriere'), card('a', 101, 'gold', 'sf'), card('a', 102, 'bronze', 'grand')];
  const lineup = resolveLineup(null, three);
  check('le cinq par défaut contient les 3 cartes', lineup.length === 3);
  const p = perfs(three.map(c => ({ player_id: c.player_id, fantasy_score: 10, blocks: 0, steals: 0 })));
  const s = scoreStarters(lineup, p, noWinners);
  check('le score se calcule sans erreur', Number.isFinite(s.base) && s.starters.length === 3 && s.base > 0, String(s.base));
  const none = scoreStarters(resolveLineup(null, []), p, noWinners);
  check('collection vide : 0 point', none.base === 0 && none.starters.length === 0);
  // Même joueur en double : un seul des deux exemplaires est aligné
  const dup = [card('a', 100, 'silver', 'arriere'), card('a', 100, 'gold', 'arriere')];
  check('un même joueur n’est aligné qu’une fois par défaut', resolveLineup(null, dup).length === 1);
}

console.log('Verrou');
{
  const ms = [
    { status: 'finished', match_date: '2026-11-10T18:00:00Z' },
    { status: 'postponed', match_date: '2026-11-09T18:00:00Z' },
    { status: 'scheduled', match_date: '2026-11-11T18:00:00Z' },
  ];
  const now = Date.parse('2026-12-01T00:00:00Z');
  check('verrou = premier match non reporté', lineupCutoffMs(ms, now) === Date.parse('2026-11-10T18:00:00Z'));
  check('journée sans match : maintenant', lineupCutoffMs([], now) === now);
  check('journée future : jamais après maintenant', lineupCutoffMs(ms, Date.parse('2026-11-01T00:00:00Z')) === Date.parse('2026-11-01T00:00:00Z'));
}

console.log(`\n${total - failed}/${total} cas réussis`);
process.exit(failed ? 1 : 0);

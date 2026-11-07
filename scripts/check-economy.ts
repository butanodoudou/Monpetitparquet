// Vérification de l'économie : gains de paquets, revente, amélioration, cartes verrouillées, missions.
// npx tsx scripts/check-economy.ts. Aucune base réelle : les fonctions SQL (grant_pack) sont simulées en
// mémoire pour tester le côté TypeScript. Le SQL lui-même n'est PAS exécuté ici.
import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_SEASON } from '../lib/sports-api';
import { PACK_PRICE, RARITY_CONFIG, UPGRADE_COST, upgradeError, type Rarity } from '../lib/cards';
import {
  economyError, lockedCardIds, lockedError, needsSellConfirmation, sellTotal, sellValues, upgradePlan,
  upgradeSelectionError,
} from '../lib/economy';
import { MISSION_STARTER_POINTS, allMissionsDone, bestLeagueIndex, evaluateMissions } from '../lib/missions';
import { grantPack, grantSettlementRewards, worseQualities } from '../lib/rewards';
import type { ScoringCard, UserWeekStats } from '../lib/card-scoring';

let failed = 0;
let total = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  total++;
  if (ok) return console.log(`  ok   ${name}`);
  failed++;
  console.log(`  ECHEC ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
}

// ─── Base simulée ───────────────────────────────────────────────

type Row = Record<string, any>;

class FakeDb {
  tables: Record<string, Row[]> = {
    weekly_matchups: [], weekly_lineups: [], users: [], card_packs: [], player_cards: [],
    players: [1, 2, 3, 4, 5, 6, 7, 8].map(id => ({ id, position: 'PG', is_active: true, season_avg_fantasy: 10 })),
  };
  nextId = 1;

  from(table: string) { return new FakeQuery(this.tables[table] ?? []); }

  /** Reproduit grant_pack (migration 2026-11-08) : insertion unique, remplacement d'un paquet fermé moins bon. */
  async rpc(name: string, a: Row) {
    if (name !== 'grant_pack') throw new Error('rpc inconnue ' + name);
    const packs = this.tables.card_packs;
    const insertCards = (packId: string) => {
      for (const c of a.p_cards) {
        this.tables.player_cards.push({ id: 'c' + this.nextId++, user_id: a.p_user, player_id: c.player_id, rarity: c.rarity, pack_id: packId });
      }
    };
    const existing = a.p_reward_key === null ? undefined : packs.find(p =>
      p.user_id === a.p_user && p.season === a.p_season && p.source === a.p_source && p.reward_key === a.p_reward_key);
    if (!existing) {
      const id = 'p' + this.nextId++;
      packs.push({ id, user_id: a.p_user, season: a.p_season, source: a.p_source, quality: a.p_quality, reward_key: a.p_reward_key, opened_at: a.p_open ? 'now' : null });
      insertCards(id);
      return { data: { ok: true, status: 'created', pack_id: id }, error: null };
    }
    if (existing.opened_at !== null || a.p_replace_qualities.indexOf(existing.quality) === -1) {
      return { data: { ok: true, status: 'kept', pack_id: existing.id }, error: null };
    }
    this.tables.player_cards = this.tables.player_cards.filter(c => c.pack_id !== existing.id);
    insertCards(existing.id);
    existing.quality = a.p_quality;
    return { data: { ok: true, status: 'replaced', pack_id: existing.id }, error: null };
  }
}

class FakeQuery {
  private filters: ((r: Row) => boolean)[] = [];
  constructor(private rows: Row[]) {}
  select(_cols?: string) { return this; }
  eq(c: string, v: any) { this.filters.push(r => r[c] === v); return this; }
  gt(c: string, v: any) { this.filters.push(r => r[c] > v); return this; }
  lte(c: string, v: any) { this.filters.push(r => r[c] <= v); return this; }
  in(c: string, vs: any[]) { this.filters.push(r => vs.indexOf(r[c]) !== -1); return this; }
  not(c: string, _op: string, v: any) { this.filters.push(r => r[c] !== v && r[c] !== undefined); return this; }
  private result() { return this.rows.filter(r => this.filters.every(f => f(r))); }
  maybeSingle() { return Promise.resolve({ data: this.result()[0] ?? null, error: null }); }
  then(resolve: (v: { data: Row[]; error: null }) => any) { return Promise.resolve({ data: this.result(), error: null }).then(resolve); }
}

const asClient = (db: FakeDb) => db as unknown as SupabaseClient;
const poolOf = [1, 2, 3, 4, 5, 6, 7, 8].map(id => ({ id, position: 'PG' }));
const packsOf = (db: FakeDb, user: string, source: string) =>
  db.tables.card_packs.filter(p => p.user_id === user && p.source === source);

async function main() {
  // ─── Revente ────────────────────────────────────────────────
  console.log('Revente et calcul des pièces');
  check('prix de revente : 5, 10, 30, 100', sellValues().bronze === 5 && sellValues().silver === 10 && sellValues().gold === 30 && sellValues().platine === 100, sellValues());
  check('prix issus de RARITY_CONFIG', (['bronze', 'silver', 'gold', 'platine'] as Rarity[]).every(r => sellValues()[r] === RARITY_CONFIG[r].sellValue));
  check('3 Bronze + 1 Gold = 45', sellTotal(['bronze', 'bronze', 'bronze', 'gold']) === 45);
  check('aucune carte = 0', sellTotal([]) === 0);
  check('Platine = 100', sellTotal(['platine']) === 100);
  check('confirmation pour Gold et Platine seulement',
    needsSellConfirmation('gold') && needsSellConfirmation('platine') && !needsSellConfirmation('bronze') && !needsSellConfirmation('silver'));
  check('un paquet racheté ne rapporte pas plus qu\'il ne coûte (5 Bronze + 3 Silver reste sous le prix)', 5 * 5 + 3 * 10 < PACK_PRICE);

  // ─── Amélioration ───────────────────────────────────────────
  console.log('Amélioration');
  check('Bronze -> Silver : 3 cartes', upgradePlan('bronze')?.to === 'silver' && upgradePlan('bronze')?.cost === 3);
  check('Silver -> Gold : 3 cartes', upgradePlan('silver')?.to === 'gold' && upgradePlan('silver')?.cost === 3);
  check('Gold -> Platine : 5 cartes', upgradePlan('gold')?.to === 'platine' && upgradePlan('gold')?.cost === 5);
  check('Platine ne monte plus', upgradePlan('platine') === null);
  check('coûts alignés sur UPGRADE_COST', upgradePlan('gold')!.cost === UPGRADE_COST.gold);
  check('upgradeError : mauvais nombre refusé', upgradeError('bronze', ['bronze', 'bronze']) !== null);
  check('upgradeError : autre rareté refusée', upgradeError('bronze', ['bronze', 'bronze', 'silver']) !== null);
  check('upgradeError : 3 Bronze acceptés', upgradeError('bronze', ['bronze', 'bronze', 'bronze']) === null);
  check('la carte améliorée ne peut pas être son propre sacrifice', upgradeSelectionError('a', ['a', 'b', 'c']) !== null);
  check('un sacrifice en double est refusé', upgradeSelectionError('a', ['b', 'b', 'c']) !== null);
  check('sélection valide acceptée', upgradeSelectionError('a', ['b', 'c', 'd']) === null);

  // ─── Cartes verrouillées ────────────────────────────────────
  console.log('Cartes verrouillées');
  const LOCK = Date.parse('2026-11-10T18:00:00Z');
  const card = (id: string, player: number, rarity: Rarity, extra: Partial<ScoringCard> = {}): ScoringCard => ({
    id, user_id: 'u', player_id: player, rarity, group: 'arriere', season_avg_fantasy: 10 + player,
    team_id: 1, nationality: 'FR', obtainedMs: LOCK - 86400000, consumedMs: null, ...extra,
  });
  const cards = [1, 2, 3, 4, 5, 6, 7].map(i => card('c' + i, i, 'silver'));
  const locked = lockedCardIds([['c1', 'c2', 'c3', 'c4', 'c5']], cards, LOCK);
  check('cinq enregistré : ses 5 cartes sont verrouillées', locked.size === 5 && locked.has('c1') && !locked.has('c6'), Array.from(locked));
  const lockedTwo = lockedCardIds([['c1', 'c2', 'c3', 'c4', 'c5'], ['c3', 'c4', 'c5', 'c6', 'c7']], cards, LOCK);
  check('deux ligues : une carte alignée dans l\'une des deux est verrouillée', lockedTwo.size === 7, Array.from(lockedTwo));
  const lockedDefault = lockedCardIds([null], cards, LOCK);
  check('sans cinq posé, le cinq par défaut est verrouillé (repli)', lockedDefault.size === 5, Array.from(lockedDefault));
  check('aucune ligue : rien de verrouillé', lockedCardIds([], cards, LOCK).size === 0);
  const lateCard = card('late', 9, 'platine', { obtainedMs: LOCK + 1000 });
  check('une carte reçue après le verrou n\'est pas verrouillée', !lockedCardIds([null], cards.concat(lateCard), LOCK).has('late'));
  check('vente refusée si une carte est alignée', lockedError(['c6', 'c1'], locked) !== null);
  check('vente permise hors des cartes alignées', lockedError(['c6', 'c7'], locked) === null);
  check('code SQL carte_verrouillée -> 423', economyError('carte_verrouillee').status === 423);
  check('code SQL solde_insuffisant -> 402 avec message propre', economyError('solde_insuffisant').status === 402);
  check('code inconnu -> 500', economyError('truc').status === 500);

  // ─── Gains de paquets ───────────────────────────────────────
  console.log('Gains de paquets');
  check('qualités moins bonnes : or -> argent, standard', worseQualities('or').join() === 'standard,argent');
  check('qualités moins bonnes : standard -> aucune', worseQualities('standard').length === 0);

  let db = new FakeDb();
  const base = { userId: 'u1', source: 'lundi' as const, rewardKey: '12', pool: poolOf };
  let g = await grantPack(asClient(db), { ...base, quality: 'standard' });
  check('premier gain : paquet créé avec 5 cartes', g.status === 'created' && db.tables.player_cards.length === 5);
  g = await grantPack(asClient(db), { ...base, quality: 'standard' });
  check('même journée, même qualité : rien de nouveau (idempotent)', g.status === 'kept' && packsOf(db, 'u1', 'lundi').length === 1 && db.tables.player_cards.length === 5);
  g = await grantPack(asClient(db), { ...base, quality: 'or' });
  check('meilleure qualité, paquet fermé : remplacé', g.status === 'replaced' && packsOf(db, 'u1', 'lundi')[0].quality === 'or' && db.tables.player_cards.length === 5);
  g = await grantPack(asClient(db), { ...base, quality: 'argent' });
  check('moins bonne qualité : le meilleur résultat reste', g.status === 'kept' && packsOf(db, 'u1', 'lundi')[0].quality === 'or');
  g = await grantPack(asClient(db), { ...base, quality: 'or' });
  check('qualité égale : conservé', g.status === 'kept');

  db = new FakeDb();
  await grantPack(asClient(db), { ...base, quality: 'standard' });
  packsOf(db, 'u1', 'lundi')[0].opened_at = 'now';
  g = await grantPack(asClient(db), { ...base, quality: 'or' });
  check('paquet déjà ouvert : rien ne change', g.status === 'kept' && packsOf(db, 'u1', 'lundi')[0].quality === 'standard');

  db = new FakeDb();
  await grantPack(asClient(db), { ...base, quality: 'standard' });
  await grantPack(asClient(db), { ...base, rewardKey: '13', quality: 'standard' });
  await grantPack(asClient(db), { ...base, userId: 'u2', quality: 'standard' });
  check('journées et comptes différents : paquets distincts', packsOf(db, 'u1', 'lundi').length === 2 && packsOf(db, 'u2', 'lundi').length === 1);
  await grantPack(asClient(db), { ...base, source: 'victoire', quality: 'standard' });
  check('autre source la même journée : paquet distinct', packsOf(db, 'u1', 'victoire').length === 1 && db.tables.card_packs.length === 4);

  db = new FakeDb();
  const bot = await grantPack(asClient(db), { ...base, userId: 'bot', quality: 'standard', autoOpen: true });
  check('autoOpen : paquet ouvert d\'office', bot.status === 'created' && packsOf(db, 'bot', 'lundi')[0].opened_at !== null);

  let emptyFailed = false;
  try { await grantPack(asClient(db), { ...base, pool: [], quality: 'standard' }); } catch { emptyFailed = true; }
  check('réservoir vide : erreur claire, aucun paquet', emptyFailed);

  // ─── Gains au règlement ─────────────────────────────────────
  console.log('Gains au règlement (victoire et missions)');
  const stat = (points: number[]): UserWeekStats => ({
    base: 0, chem: 0, weekendMult: 1, defMult: 1,
    starters: points.map((p, i) => ({ cardId: 'x' + i, slot: 'arriere', points: p, multiplier: 1 })),
  });
  const duel = (league: string, week: number, home: string, away: string, winner: string | null) => ({
    league_id: league, season: CURRENT_SEASON, week, home_user_id: home, away_user_id: away,
    winner_user_id: winner, settled_at: '2026-11-11',
  });

  db = new FakeDb();
  db.tables.users.push({ id: 'h1', email: 'a@x.fr' }, { id: 'h2', email: 'b@x.fr' }, { id: 'bot1', email: 'bot@system.internal' });
  db.tables.weekly_matchups.push(duel('L1', 5, 'h1', 'h2', 'h1'), duel('L2', 5, 'h1', 'bot1', 'h1'), duel('L3', 5, 'h2', 'bot1', null));
  db.tables.weekly_lineups.push({ league_id: 'L1', user_id: 'h1', week: 5, starter_card_ids: ['a'] });
  const statsL1 = new Map<string, UserWeekStats>([['h1', stat([12, 31.5, 8, 5, 20])], ['h2', stat([10, 10, 10, 10, 10])]]);
  await grantSettlementRewards(asClient(db), 'L1', 5, statsL1);
  check('vainqueur d\'un duel : 1 paquet de victoire', packsOf(db, 'h1', 'victoire').length === 1);
  check('le perdant n\'a pas de paquet de victoire', packsOf(db, 'h2', 'victoire').length === 0);
  check('trois missions réussies : 1 paquet de mission', packsOf(db, 'h1', 'mission').length === 1);
  check('clé de gain = la journée', packsOf(db, 'h1', 'victoire')[0].reward_key === '5' && packsOf(db, 'h1', 'mission')[0].reward_key === '5');

  await grantSettlementRewards(asClient(db), 'L2', 5, new Map([['h1', stat([40, 0, 0, 0, 0])]]));
  check('même compte gagnant dans une 2e ligue : toujours 1 victoire et 1 mission par journée',
    packsOf(db, 'h1', 'victoire').length === 1 && packsOf(db, 'h1', 'mission').length === 1);

  await grantSettlementRewards(asClient(db), 'L3', 5, new Map());
  check('match nul : aucun paquet de victoire', packsOf(db, 'h2', 'victoire').length === 0);
  check('les bots ne reçoivent rien', packsOf(db, 'bot1', 'victoire').length === 0 && packsOf(db, 'bot1', 'mission').length === 0);

  // Une mission manquante : pas de paquet de mission
  db = new FakeDb();
  db.tables.users.push({ id: 'h1', email: 'a@x.fr' }, { id: 'h2', email: 'b@x.fr' });
  db.tables.weekly_matchups.push(duel('L1', 6, 'h1', 'h2', 'h1'));
  db.tables.weekly_lineups.push({ league_id: 'L1', user_id: 'h1', week: 6, starter_card_ids: ['a'] });
  await grantSettlementRewards(asClient(db), 'L1', 6, new Map([['h1', stat([29.9, 20, 10, 5, 5])]]));
  check('aucun titulaire à 30 points : victoire oui, mission non', packsOf(db, 'h1', 'victoire').length === 1 && packsOf(db, 'h1', 'mission').length === 0);

  db = new FakeDb();
  db.tables.users.push({ id: 'h1', email: 'a@x.fr' }, { id: 'h2', email: 'b@x.fr' });
  db.tables.weekly_matchups.push(duel('L1', 7, 'h1', 'h2', 'h2'));
  db.tables.weekly_lineups.push({ league_id: 'L1', user_id: 'h1', week: 7, starter_card_ids: ['a'] });
  await grantSettlementRewards(asClient(db), 'L1', 7, new Map([['h1', stat([45, 0, 0, 0, 0])]]));
  check('duel perdu : pas de mission, pas de victoire', packsOf(db, 'h1', 'mission').length === 0 && packsOf(db, 'h1', 'victoire').length === 0);

  // Un échec de gain ne remonte jamais
  let threw = false;
  const broken = { from() { throw new Error('base indisponible'); }, rpc() { throw new Error('base indisponible'); } };
  const origError = console.error;
  console.error = () => {};
  try { await grantSettlementRewards(broken as unknown as SupabaseClient, 'L1', 7, new Map()); } catch { threw = true; }
  console.error = origError;
  check('une panne pendant les gains ne lève pas d\'erreur (le règlement continue)', !threw);

  // ─── Missions ───────────────────────────────────────────────
  console.log('Missions');
  const m1 = evaluateMissions({ lineupPlaced: true, won: true, starterPoints: [10, MISSION_STARTER_POINTS] });
  check('seuil de 30 points inclus', m1.every(m => m.done) && allMissionsDone(m1));
  const m2 = evaluateMissions({ lineupPlaced: true, won: true, starterPoints: [29.9, 12] });
  check('29,9 points ne suffit pas', !allMissionsDone(m2) && m2.filter(m => m.done).length === 2);
  check('trois missions, libellés en français', m1.length === 3 && m1.every(m => m.label.length > 5));
  check('rien de réussi', evaluateMissions({ lineupPlaced: false, won: false, starterPoints: [] }).every(m => !m.done));
  check('tutoiement dans les libellés', m1[0].label.indexOf('ton') !== -1 && m1[1].label.indexOf('ton') !== -1);
  check('ligue la plus avancée choisie', bestLeagueIndex([m2, m1, m2]) === 1);
  check('aucune ligue : -1', bestLeagueIndex([]) === -1);

  // ─── Prix ────────────────────────────────────────────────────
  console.log('Achat');
  check('paquet à 150 pièces', PACK_PRICE === 150);

  console.log(`\n${total - failed}/${total} vérifications passées`);
  if (failed > 0) { console.log(`${failed} échec(s)`); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });

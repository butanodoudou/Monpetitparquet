// Règles du jeu de cartes : aucune dépendance à la base, tout se teste avec scripts/check-cards.ts.
// Les règles complètes sont dans .claude/specs/cartes.md.

import { POSITION_GROUP_MAP, type PositionGroup } from '@/lib/fantasy';

export type Rarity = 'bronze' | 'silver' | 'gold' | 'platine';
export type PackQuality = 'standard' | 'argent' | 'or';
export type PackSource = 'starter' | 'lundi' | 'victoire' | 'mission' | 'achat';

export const RARITIES: Rarity[] = ['bronze', 'silver', 'gold', 'platine'];

export const RARITY_CONFIG: Record<Rarity, { label: string; multiplier: number; sellValue: number; level: number }> = {
  bronze: { label: 'Bronze', multiplier: 0.9, sellValue: 5, level: 1 },
  silver: { label: 'Silver', multiplier: 1, sellValue: 10, level: 2 },
  gold: { label: 'Gold', multiplier: 1.1, sellValue: 30, level: 3 },
  platine: { label: 'Platine', multiplier: 1.2, sellValue: 100, level: 4 },
};

/** Chance de chaque rareté par carte, selon la qualité du paquet. */
export const PACK_ODDS: Record<PackQuality, Record<Rarity, number>> = {
  standard: { bronze: 0.55, silver: 0.3, gold: 0.12, platine: 0.03 },
  argent: { bronze: 0.35, silver: 0.4, gold: 0.2, platine: 0.05 },
  or: { bronze: 0.15, silver: 0.4, gold: 0.35, platine: 0.1 },
};

export const CARDS_PER_PACK = 5;
export const STARTER_PACKS = 5;
export const PACK_PRICE = 150;

/** Cartes de même rareté à sacrifier pour monter d'un cran. Platine ne monte plus. */
export const UPGRADE_COST: Record<Exclude<Rarity, 'platine'>, number> = { bronze: 3, silver: 3, gold: 5 };

export const nextRarity = (r: Rarity): Rarity | null => RARITIES[RARITIES.indexOf(r) + 1] ?? null;

// ─── Postes ─────────────────────────────────────────────────────

const GROUP_ORDER: PositionGroup[] = ['arriere', 'sf', 'grand'];

/** Les 5 places du cinq, dans l'ordre de starter_card_ids. */
export const LINEUP_SLOTS: PositionGroup[] = ['arriere', 'arriere', 'sf', 'grand', 'grand'];

/** Multiplicateur selon le nombre de postes d'écart. */
export const POSITION_MULTIPLIERS = [1, 0.8, 0.65] as const;

/** Groupe de poste d'un joueur. Un poste inconnu compte comme ailier. */
export function groupOf(position: string | null | undefined): PositionGroup {
  return POSITION_GROUP_MAP[position ?? ''] ?? 'sf';
}

export function positionMultiplier(natural: PositionGroup, slot: PositionGroup): number {
  return POSITION_MULTIPLIERS[Math.abs(GROUP_ORDER.indexOf(natural) - GROUP_ORDER.indexOf(slot))];
}

/** Multiplicateur total d'une carte à une place : la rareté et le poste se multiplient. */
export function cardMultiplier(rarity: Rarity, natural: PositionGroup, slot: PositionGroup): number {
  return RARITY_CONFIG[rarity].multiplier * positionMultiplier(natural, slot);
}

// ─── Composition ────────────────────────────────────────────────

export interface LineupCard {
  id: string;
  player_id: number;
  rarity: Rarity;
  group: PositionGroup;
  season_avg_fantasy: number;
}

/** Message d'erreur si le cinq est invalide, sinon null. `cardIds` suit l'ordre de LINEUP_SLOTS. */
export function lineupError(cardIds: string[], owned: Map<string, LineupCard>): string | null {
  if (cardIds.length !== LINEUP_SLOTS.length || new Set(cardIds).size !== cardIds.length) {
    return 'Il faut 5 cartes différentes';
  }
  const players = new Set<number>();
  for (const id of cardIds) {
    const card = owned.get(id);
    if (!card) return 'Cette carte ne t’appartient pas';
    if (players.has(card.player_id)) return 'Un même joueur ne peut être aligné qu’une fois';
    players.add(card.player_id);
  }
  return null;
}

/**
 * Cinq par défaut quand le manager n'a rien posé : la meilleure carte à chaque place, en tenant
 * compte de la rareté et du poste. Renvoie moins de 5 cartes si la collection est trop petite.
 */
export function defaultLineup(cards: LineupCard[]): string[] {
  const used = new Set<string>();
  const players = new Set<number>();
  const lineup: string[] = [];

  for (const slot of LINEUP_SLOTS) {
    const best = cards
      .filter(c => !used.has(c.id) && !players.has(c.player_id))
      .map(c => ({ card: c, value: c.season_avg_fantasy * cardMultiplier(c.rarity, c.group, slot) }))
      .sort((a, b) => b.value - a.value)[0];
    if (!best) continue;
    used.add(best.card.id);
    players.add(best.card.player_id);
    lineup.push(best.card.id);
  }
  return lineup;
}

// ─── Tirages ────────────────────────────────────────────────────

export interface PoolPlayer { id: number; position: string | null }
export interface DrawnCard { player_id: number; rarity: Rarity }

/** Source de hasard injectable, pour rendre les tests reproductibles. */
export type Rng = () => number;

export function drawRarity(rng: Rng, quality: PackQuality = 'standard'): Rarity {
  const odds = PACK_ODDS[quality];
  let roll = rng();
  for (const rarity of RARITIES) {
    roll -= odds[rarity];
    if (roll < 0) return rarity;
  }
  return 'bronze';
}

export function drawPack(pool: PoolPlayer[], rng: Rng, quality: PackQuality = 'standard'): DrawnCard[] {
  if (pool.length === 0) throw new Error('Aucun joueur à tirer');
  return Array.from({ length: CARDS_PER_PACK }, () => ({
    player_id: pool[Math.floor(rng() * pool.length)].id,
    rarity: drawRarity(rng, quality),
  }));
}

/**
 * Les 5 paquets de départ. Garanties sur l'ensemble : au moins une carte Gold ou mieux,
 * et au moins un joueur de chaque groupe de poste présent dans le réservoir.
 */
export function drawStarterPacks(pool: PoolPlayer[], rng: Rng): DrawnCard[][] {
  const packs = Array.from({ length: STARTER_PACKS }, () => drawPack(pool, rng));
  const all = packs.flat();

  if (!all.some(c => c.rarity === 'gold' || c.rarity === 'platine')) {
    all[Math.floor(rng() * all.length)].rarity = 'gold';
  }

  const groupById = new Map(pool.map(p => [p.id, groupOf(p.position)]));
  const protectedCards = new Set<DrawnCard>(all.filter(c => c.rarity === 'gold' || c.rarity === 'platine'));

  for (const group of GROUP_ORDER) {
    if (all.some(c => groupById.get(c.player_id) === group)) continue;
    const candidates = pool.filter(p => groupOf(p.position) === group);
    if (candidates.length === 0) continue;
    const counts = new Map<PositionGroup, number>();
    for (const c of all) {
      const g = groupById.get(c.player_id)!;
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    // On remplace une carte d'un groupe bien représenté, sans toucher à la garantie Gold
    const target = all.find(c => !protectedCards.has(c) && (counts.get(groupById.get(c.player_id)!) ?? 0) > 1);
    if (target) target.player_id = candidates[Math.floor(rng() * candidates.length)].id;
  }
  return packs;
}

// ─── Économie ───────────────────────────────────────────────────

/** Message d'erreur si l'amélioration est impossible, sinon null. */
export function upgradeError(target: Rarity, sacrifices: Rarity[]): string | null {
  if (target === 'platine') return 'Une carte Platine ne peut plus monter';
  const needed = UPGRADE_COST[target];
  if (sacrifices.length !== needed) return `Il faut sacrifier ${needed} cartes`;
  if (sacrifices.some(r => r !== target)) return 'Les cartes sacrifiées doivent avoir la même rareté';
  return null;
}

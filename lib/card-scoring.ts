// Calcul des points d'une journée à partir des cartes : fonctions pures, sans accès à la base.
// Testé par scripts/check-card-scoring.ts. Le barème et les modificateurs restent dans lib/fantasy.ts.

import {
  computeChemistryBonus,
  computeDefensiveMultiplier,
  computeWeekendMultiplier,
  type PositionGroup,
} from '@/lib/fantasy';
import { LINEUP_SLOTS, cardMultiplier, defaultLineup, lineupError, type LineupCard, type Rarity } from '@/lib/cards';

/** Une carte telle que le calcul des scores la voit. */
export interface ScoringCard extends LineupCard {
  user_id: string;
  rarity: Rarity;
  team_id: number | null;
  nationality: string | null;
  /** Instant où la carte est entrée dans la collection (ouverture du paquet), en ms. */
  obtainedMs: number;
  /** Instant où elle a été vendue ou sacrifiée, en ms, ou null. */
  consumedMs: number | null;
}

export interface PerfLine { player_id: number; fantasy_score: number | null; blocks: number | null; steals: number | null }

export interface StarterDetail { cardId: string; slot: PositionGroup; points: number; multiplier: number }

export interface UserWeekStats {
  base: number;
  chem: number;
  weekendMult: number;
  defMult: number; // multiplicateur défensif que CE manager applique à son adversaire
  starters: StarterDetail[];
}

export const EMPTY_STATS: UserWeekStats = { base: 0, chem: 0, weekendMult: 1, defMult: 1, starters: [] };

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Cartes qu'un manager possédait à l'instant `atMs` : déjà ouvertes, pas encore vendues.
 * Une carte vendue après l'instant reste donc comptée pour les journées déjà jouées.
 */
export function cardsAt(cards: ScoringCard[], atMs: number): ScoringCard[] {
  return cards.filter(c => c.obtainedMs <= atMs && (c.consumedMs === null || c.consumedMs > atMs));
}

/**
 * Cinq d'un manager : sa dernière composition enregistrée si elle est encore valide
 * avec les cartes disponibles, sinon le cinq par défaut. Renvoie les cartes dans l'ordre des places.
 */
export function resolveLineup(saved: string[] | null | undefined, available: ScoringCard[]): ScoringCard[] {
  const byId = new Map(available.map(c => [c.id, c]));
  const ids = saved && lineupError(saved, byId) === null ? saved : defaultLineup(available);
  return ids.map(id => byId.get(id)!).filter(Boolean);
}

/**
 * Stats d'un manager pour la journée. Chaque titulaire marque `fantasy_score x multiplicateur(rareté, poste, place)`
 * (arrondi seulement à la fin du duel). La chimie, le bonus week-end et le malus défensif
 * se calculent sur ses titulaires à lui : un même joueur aligné par deux managers compte pour chacun.
 */
export function scoreStarters(
  starters: ScoringCard[],
  perfsByPlayer: Map<number, PerfLine[]>,
  winningTeamIds: Set<number>
): UserWeekStats {
  let base = 0;
  let defRaw = 0;
  const details: StarterDetail[] = [];

  starters.forEach((card, i) => {
    const slot = LINEUP_SLOTS[i];
    const multiplier = cardMultiplier(card.rarity, card.group, slot);
    let raw = 0;
    for (const perf of perfsByPlayer.get(card.player_id) ?? []) {
      raw += perf.fantasy_score ?? 0;
      defRaw += (perf.blocks ?? 0) + (perf.steals ?? 0);
    }
    base += raw * multiplier;
    details.push({ cardId: card.id, slot, points: round1(raw * multiplier), multiplier });
  });

  const metas = starters.map(c => ({ team_id: c.team_id, nationality: c.nationality }));
  return {
    base,
    chem: computeChemistryBonus(metas),
    weekendMult: computeWeekendMultiplier(metas, winningTeamIds),
    defMult: computeDefensiveMultiplier(defRaw),
    starters: details,
  };
}

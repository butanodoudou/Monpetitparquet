// ─── Barème fantasy ───────────────────────────────────────────
// Révisé le 2026-10-08 : le barème précédent ne pénalisait aucun tir manqué,
// donc une soirée à 2/9 au tir avec du volume sortait un très gros score.
// Les tentatives sont désormais mappées et l'adresse compte.
// Voir .claude/decisions.md pour le détail et les alternatives écartées.

export const SCORING = {
  point:             1,
  assist:            1.5,
  offensiveRebound:  1.5,  // plus rare et plus créateur de valeur qu'un rebond défensif
  defensiveRebound:  1,
  steal:             2,
  block:             2,
  turnover:         -1.5,
  missedFieldGoal:  -0.5,
  missedFreeThrow:  -0.5,
  threePointerMade:  0.5,  // bonus en plus des 3 points déjà comptés
} as const;

export interface FantasyStatLine {
  points: number;
  assists: number;
  rebounds: number;            // total — sert de repli si le split off/def manque
  offensiveRebounds: number;
  defensiveRebounds: number;
  steals: number;
  blocks: number;
  turnovers: number;
  threePointersMade: number;
  fieldGoalsMade: number;
  fieldGoalAttempts: number;
  freeThrowsMade: number;
  freeThrowAttempts: number;
}

export function computeFantasyScore(stat: FantasyStatLine): number {
  // Les tentatives à 3 pts sont déjà incluses dans fieldGoalAttempts côté Sofascore,
  // donc un seul calcul de tirs manqués couvre les 2 pts et les 3 pts.
  const missedFieldGoals = Math.max(0, stat.fieldGoalAttempts - stat.fieldGoalsMade);
  const missedFreeThrows = Math.max(0, stat.freeThrowAttempts - stat.freeThrowsMade);

  // Repli : si Sofascore ne donne pas le split offensif/défensif mais donne un total,
  // on valorise l'ensemble au tarif défensif (le moins généreux) plutôt que de perdre
  // les rebonds du joueur.
  const splitKnown = stat.offensiveRebounds > 0 || stat.defensiveRebounds > 0;
  const reboundScore = splitKnown
    ? stat.offensiveRebounds * SCORING.offensiveRebound +
      stat.defensiveRebounds * SCORING.defensiveRebound
    : stat.rebounds * SCORING.defensiveRebound;

  const score =
    stat.points             * SCORING.point +
    stat.assists            * SCORING.assist +
    reboundScore +
    stat.steals             * SCORING.steal +
    stat.blocks             * SCORING.block +
    stat.turnovers          * SCORING.turnover +
    missedFieldGoals        * SCORING.missedFieldGoal +
    missedFreeThrows        * SCORING.missedFreeThrow +
    stat.threePointersMade  * SCORING.threePointerMade;

  // Plus de bonus double-double / triple-double : effet de seuil brutal (9 vs 10 rebonds
  // valait 5 points) et le triple-double est quasi inexistant en LNB Élite (matchs de 40 min).

  return Math.round(score * 10) / 10;
}

export function buildSnakeOrder(userIds: string[], picksPerTeam: number): string[] {
  const order: string[] = [];
  for (let r = 0; r < picksPerTeam; r++) {
    const round = r % 2 === 0 ? userIds : [...userIds].reverse();
    order.push(...round);
  }
  return order;
}

// ─── Mystery Draft ────────────────────────────────────────────

export type PlayerTier = 'elite' | 'gold' | 'silver' | 'bronze';

export const PACK_PRICES: Record<PlayerTier, number> = {
  elite: 30,
  gold: 18,
  silver: 10,
  bronze: 5,
};

export const DRAFT_BUDGET = 500_000;
export const ROSTER_SIZE = 8;
export const PACK_LIFETIME_HOURS = 12;

// Probability of drawing each tier when opening a given pack type
export const PACK_WEIGHTS: Record<PlayerTier, Record<PlayerTier, number>> = {
  elite:  { elite: 0.60, gold: 0.30, silver: 0.10, bronze: 0.00 },
  gold:   { elite: 0.05, gold: 0.60, silver: 0.30, bronze: 0.05 },
  silver: { elite: 0.00, gold: 0.10, silver: 0.60, bronze: 0.30 },
  bronze: { elite: 0.00, gold: 0.00, silver: 0.20, bronze: 0.80 },
};

export const TIER_PERCENTILES: Record<PlayerTier, number> = {
  elite: 0.05,
  gold: 0.20,
  silver: 0.50,
  bronze: 1.00,
};

export const TIER_CONFIG: Record<PlayerTier, { label: string; color: string; glow: string; bg: string }> = {
  elite:  { label: 'Élite',  color: 'text-ame', glow: 'shadow-purple-500/60', bg: 'from-purple-900/80 to-slate-900' },
  gold:   { label: 'Gold',   color: 'text-brand', glow: 'shadow-yellow-500/60', bg: 'from-yellow-900/60 to-slate-900' },
  silver: { label: 'Silver', color: 'text-ink2',  glow: 'shadow-slate-400/60',  bg: 'from-slate-600/60 to-slate-900' },
  bronze: { label: 'Bronze', color: 'text-orange-700', glow: 'shadow-orange-700/40', bg: 'from-orange-900/40 to-slate-900' },
};

export function assignTier(fantasy: number, p5: number, p20: number, p50: number): PlayerTier {
  if (fantasy >= p5) return 'elite';
  if (fantasy >= p20) return 'gold';
  if (fantasy >= p50) return 'silver';
  return 'bronze';
}

/** Rareté de chaque joueur selon sa moyenne parmi tous ceux qui ont joué. */
export function tiersByPlayer(players: { id: number; season_avg_fantasy: number }[]): Map<number, PlayerTier> {
  const played = players.filter(p => p.season_avg_fantasy > 0);
  const sorted = played.map(p => p.season_avg_fantasy).sort((a, b) => b - a);
  const cut = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
  const [p5, p20, p50] = [cut(TIER_PERCENTILES.elite), cut(TIER_PERCENTILES.gold), cut(TIER_PERCENTILES.silver)];
  return new Map(played.map(p => [p.id, assignTier(p.season_avg_fantasy, p5, p20, p50)]));
}

export function weightedRandom(weights: Record<PlayerTier, number>): PlayerTier {
  const rand = Math.random();
  let cumulative = 0;
  for (const [tier, weight] of Object.entries(weights) as [PlayerTier, number][]) {
    cumulative += weight;
    if (rand <= cumulative) return tier as PlayerTier;
  }
  return 'bronze';
}

export function computeTierThresholds(avgFantasies: number[]): { p5: number; p20: number; p50: number } {
  const sorted = [...avgFantasies].sort((a, b) => b - a);
  const len = sorted.length;
  return {
    p5:  sorted[Math.max(0, Math.floor(len * 0.05))] ?? 0,
    p20: sorted[Math.max(0, Math.floor(len * 0.20))] ?? 0,
    p50: sorted[Math.max(0, Math.floor(len * 0.50))] ?? 0,
  };
}

// ─── Match scoring modifiers ───────────────────────────────────

/** Paramètres des modificateurs de score (affichés tels quels sur la page Règles). */
export const MODIFIERS = {
  chemistryClubPair: 2,          // par paire de titulaires du même club
  chemistryNationalityPair: 1,   // par paire de titulaires de même nationalité
  chemistryCap: 8,
  weekendMultiplier: 1.10,
  weekendMinWinningTeams: 3,
  defenseMaxReduction: 0.20,     // ×0,80 au maximum
  defenseFullAtRaw: 30,          // contres + interceptions pour atteindre le maximum
} as const;

/** Bonus pts from same-club / same-nationality pairs among starters. Cap: 8 pts (recalibré pour le barème 2026-10). */
export function computeChemistryBonus(
  starters: { team_id: number | null; nationality: string | null }[]
): number {
  let bonus = 0;
  for (let i = 0; i < starters.length; i++) {
    for (let j = i + 1; j < starters.length; j++) {
      const a = starters[i];
      const b = starters[j];
      if (a.team_id !== null && a.team_id === b.team_id) bonus += MODIFIERS.chemistryClubPair;
      if (a.nationality && b.nationality && a.nationality === b.nationality) bonus += MODIFIERS.chemistryNationalityPair;
    }
  }
  return Math.min(Math.round(bonus * 10) / 10, MODIFIERS.chemistryCap);
}

/**
 * ×1.10 if starters have ≥3 distinct winning real-team ids this weekend.
 * Teams with multiple starters count as one.
 */
export function computeWeekendMultiplier(
  starters: { team_id: number | null }[],
  winningTeamIds: Set<number>
): number {
  const distinctWinners = new Set(
    starters.map(s => s.team_id).filter((id): id is number => id !== null && winningTeamIds.has(id))
  );
  return distinctWinners.size >= MODIFIERS.weekendMinWinningTeams ? MODIFIERS.weekendMultiplier : 1.00;
}

/**
 * Multiplier applied to the opponent's score.
 * defensiveRaw = sum of (blocks + steals) for starters over the week.
 * Ranges smoothly from ×1.00 (no defense) to ×0.80 (defensiveRaw ≥ 30).
 */
export function computeDefensiveMultiplier(defensiveRaw: number): number {
  const clamped = Math.min(defensiveRaw / MODIFIERS.defenseFullAtRaw, 1);
  return Math.round((1.0 - MODIFIERS.defenseMaxReduction * clamped) * 1000) / 1000;
}

// ─── Position groups ────────────────────────────────────────────

export type PositionGroup = 'arriere' | 'sf' | 'grand';

export const POSITION_GROUP_MAP: Record<string, PositionGroup> = {
  PG: 'arriere', SG: 'arriere',
  SF: 'sf',
  PF: 'grand', C: 'grand',
};

export const ROSTER_SLOTS: Record<PositionGroup, number> = { arriere: 3, sf: 2, grand: 3 };
export const STARTER_SLOTS: Record<PositionGroup, number> = { arriere: 2, sf: 1, grand: 2 };

export const GROUP_LABELS: Record<PositionGroup, string> = {
  arriere: 'Arrières',
  sf: 'Ailiers',
  grand: 'Grands',
};

export function getPositionGroup(position: string): PositionGroup | null {
  return POSITION_GROUP_MAP[position] ?? null;
}

export function getRemainingRosterSlots(players: { position: string }[]): Record<PositionGroup, number> {
  const counts: Record<PositionGroup, number> = { arriere: 0, sf: 0, grand: 0 };
  for (const p of players) {
    const g = POSITION_GROUP_MAP[p.position];
    if (g) counts[g]++;
  }
  return {
    arriere: ROSTER_SLOTS.arriere - counts.arriere,
    sf: ROSTER_SLOTS.sf - counts.sf,
    grand: ROSTER_SLOTS.grand - counts.grand,
  };
}

export function computeDefaultStarters(
  roster: { player_id: number; position: string; season_avg_fantasy: number }[]
): number[] {
  const grouped: Record<PositionGroup, typeof roster> = { arriere: [], sf: [], grand: [] };
  for (const p of roster) {
    const g = POSITION_GROUP_MAP[p.position];
    if (g) grouped[g].push(p);
  }
  const starters: number[] = [];
  for (const [group, slots] of Object.entries(STARTER_SLOTS) as [PositionGroup, number][]) {
    const sorted = [...(grouped[group] ?? [])].sort((a, b) => b.season_avg_fantasy - a.season_avg_fantasy);
    starters.push(...sorted.slice(0, slots).map(p => p.player_id));
  }
  return starters;
}

// ─── Auction Draft ─────────────────────────────────────────────

export type AuctionTier = 'elite' | 'star' | 'basique';

export const TIER_MIN_BIDS: Record<AuctionTier, number> = {
  elite: 30_000,
  star: 10_000,
  basique: 0,
};

export const AUCTION_PACK_COMPOSITION: AuctionTier[] = [
  'elite', 'star', 'star', 'basique', 'basique'
];

export const AUCTION_TIER_CONFIG: Record<AuctionTier, { label: string; color: string; bg: string }> = {
  elite:   { label: 'Élite',   color: 'text-ame', bg: 'bg-ame/10 border-ame/30' },
  star:    { label: 'Star',    color: 'text-brand', bg: 'bg-brand/10 border-brand/30' },
  basique: { label: 'Basique', color: 'text-ink2',  bg: 'bg-raised border-line' },
};

export function assignAuctionTier(fantasy: number, p5: number, p25: number): AuctionTier {
  if (fantasy >= p5) return 'elite';
  if (fantasy >= p25) return 'star';
  return 'basique';
}

export function computeAuctionTierThresholds(avgFantasies: number[]): { p5: number; p25: number } {
  const sorted = [...avgFantasies].sort((a, b) => b - a);
  const len = sorted.length;
  return {
    p5:  sorted[Math.max(0, Math.floor(len * 0.05))] ?? 0,
    p25: sorted[Math.max(0, Math.floor(len * 0.25))] ?? 0,
  };
}

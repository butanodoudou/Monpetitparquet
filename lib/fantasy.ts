export function computeFantasyScore(
  points: number,
  assists: number,
  rebounds: number,
  steals: number,
  blocks: number,
  turnovers: number,
  threePts: number
): number {
  let score =
    points * 1 +
    assists * 2 +
    rebounds * 1.5 +
    steals * 3 +
    blocks * 3 -
    turnovers * 2 +
    threePts * 0.5;

  const doubleDigs = [points >= 10, assists >= 10, rebounds >= 10].filter(Boolean).length;
  if (doubleDigs >= 3) score += 10;
  else if (doubleDigs >= 2) score += 5;

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

// ─── Mystery Draft ────────────────────────────────────────

export type PlayerTier = 'elite' | 'gold' | 'silver' | 'bronze';

export const PACK_PRICES: Record<PlayerTier, number> = {
  elite: 30,
  gold: 18,
  silver: 10,
  bronze: 5,
};

export const DRAFT_BUDGET = 100;

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
  elite:  { label: 'Élite',  color: 'text-purple-400', glow: 'shadow-purple-500/60', bg: 'from-purple-900/80 to-slate-900' },
  gold:   { label: 'Gold',   color: 'text-yellow-400', glow: 'shadow-yellow-500/60', bg: 'from-yellow-900/60 to-slate-900' },
  silver: { label: 'Silver', color: 'text-slate-300',  glow: 'shadow-slate-400/60',  bg: 'from-slate-600/60 to-slate-900' },
  bronze: { label: 'Bronze', color: 'text-orange-400', glow: 'shadow-orange-700/40', bg: 'from-orange-900/40 to-slate-900' },
};

export function assignTier(fantasy: number, p5: number, p20: number, p50: number): PlayerTier {
  if (fantasy >= p5) return 'elite';
  if (fantasy >= p20) return 'gold';
  if (fantasy >= p50) return 'silver';
  return 'bronze';
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

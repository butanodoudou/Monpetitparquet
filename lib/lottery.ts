// ─── Loterie du lundi : logique pure ───────────────────────────
// Chaque manager reçoit 1 paquet ; la loterie décide de sa qualité. Le dernier du classement a le plus
// de chances d'avoir le meilleur. Aucune dépendance à Supabase ni à React : testable avec scripts/check-lottery.ts.

import type { PackQuality } from './cards';

/** Décalage entre deux lignes lors de la révélation de l'ordre (ms). */
export const LOTTERY_ORDER_STEP_MS = 450;
/** Heure UTC à partir de laquelle n'importe quel membre peut lancer le tirage. */
export const LOTTERY_FALLBACK_START_HOUR_UTC = 12;
export const LOTTERY_MIN_TICKETS = 1;
export const LOTTERY_MAX_TICKETS = 10;

/** Générateur aléatoire injectable (pour les tests). Renvoie un nombre dans [0, 1). */
export type Rng = () => number;

/** Durée de la révélation de l'ordre pour N managers, marge d'animation comprise. */
export function orderRevealDurationMs(n: number): number {
  return n * LOTTERY_ORDER_STEP_MS + 1500;
}

// ─── Tickets ───────────────────────────────────────────────────

/**
 * tickets = round(1 + 9 * (rang - 1) / (N - 1)). Rang 1 = premier = 1 ticket, dernier = 10.
 * N <= 1 : 10 tickets (cas dégénéré, évite la division par zéro).
 */
export function computeTickets(rank: number, n: number): number {
  if (n <= 1) return LOTTERY_MAX_TICKETS;
  const r = Math.min(Math.max(rank, 1), n);
  const span = LOTTERY_MAX_TICKETS - LOTTERY_MIN_TICKETS;
  return Math.round(LOTTERY_MIN_TICKETS + (span * (r - 1)) / (n - 1));
}

export interface StandingInput {
  user_id: string;
  wins: number;
  points: number;
}

export interface RankedMember {
  user_id: string;
  rank: number;
  tickets: number;
}

/**
 * Classement : victoires de duels, puis points cumulés de la saison.
 * Classement "à la compétition" : une égalité parfaite donne le même rang
 * (1, 2, 2, 4) et donc les mêmes tickets.
 */
export function rankMembers(stats: StandingInput[]): RankedMember[] {
  const n = stats.length;
  const pts = (s: StandingInput) => Math.round(s.points * 10) / 10;
  return stats.map(s => {
    const better = stats.filter(o =>
      o.wins > s.wins || (o.wins === s.wins && pts(o) > pts(s))
    ).length;
    const rank = better + 1;
    return { user_id: s.user_id, rank, tickets: computeTickets(rank, n) };
  });
}

export interface SettledDuel {
  home_user_id: string;
  away_user_id: string;
  winner_user_id: string | null;
  home_score: number | null;
  away_score: number | null;
}

/** Victoires et points de chaque membre à partir des duels réglés. Une égalité ne donne pas de victoire. */
export function standingsFromDuels(memberIds: string[], duels: SettledDuel[]): StandingInput[] {
  const wins: Record<string, number> = {};
  const points: Record<string, number> = {};
  for (const d of duels) {
    points[d.home_user_id] = (points[d.home_user_id] ?? 0) + (d.home_score ?? 0);
    points[d.away_user_id] = (points[d.away_user_id] ?? 0) + (d.away_score ?? 0);
    if (d.winner_user_id) wins[d.winner_user_id] = (wins[d.winner_user_id] ?? 0) + 1;
  }
  return memberIds.map(id => ({ user_id: id, wins: wins[id] ?? 0, points: Math.round((points[id] ?? 0) * 10) / 10 }));
}

// ─── Tirage de l'ordre ─────────────────────────────────────────

export interface DrawEntry {
  user_id: string;
  tickets: number;
  pick: number;
}

/** Tirage pondéré sans remise : chaque tirage retire le gagnant du lot. */
export function drawOrder(
  entries: { user_id: string; tickets: number }[],
  rng: Rng = Math.random,
): DrawEntry[] {
  const remaining = entries.map(e => ({ ...e, w: e.tickets > 0 ? e.tickets : LOTTERY_MIN_TICKETS }));
  const result: DrawEntry[] = [];
  while (remaining.length > 0) {
    const total = remaining.reduce((s, e) => s + e.w, 0);
    const r = rng() * total;
    let acc = 0;
    let idx = remaining.length - 1; // repli si l'arrondi flottant ne désigne personne
    for (let i = 0; i < remaining.length; i++) {
      acc += remaining[i].w;
      if (r < acc) { idx = i; break; }
    }
    const [picked] = remaining.splice(idx, 1);
    result.push({ user_id: picked.user_id, tickets: picked.tickets, pick: result.length + 1 });
  }
  return result;
}

/** Chance (en %, 1 décimale) de passer en premier = tickets / total des tickets. */
export function firstPickOdds(entries: { user_id: string; tickets: number }[]): Record<string, number> {
  const total = entries.reduce((s, e) => s + e.tickets, 0);
  const out: Record<string, number> = {};
  for (const e of entries) {
    out[e.user_id] = total > 0 ? Math.round((e.tickets / total) * 1000) / 10 : 0;
  }
  return out;
}

// ─── Qualité des paquets ───────────────────────────────────────

/** Nombre de managers qui reçoivent un paquet Argent : max(1, floor(n / 3)). */
export const silverCount = (n: number): number => Math.max(1, Math.floor(n / 3));

/**
 * Qualité du paquet selon l'ordre tiré, pour n managers : le 1er reçoit Or, les `max(1, floor(n / 3))`
 * suivants Argent, les autres Standard. Un seul manager reçoit donc Or, même avec n = 1.
 * Renvoie un tableau indexé par pick - 1.
 */
export function qualitiesForOrder(n: number): PackQuality[] {
  const silver = silverCount(n);
  return Array.from({ length: Math.max(0, n) }, (_, i) =>
    i === 0 ? 'or' : i <= silver ? 'argent' : 'standard');
}

export interface QualifiedEntry extends DrawEntry {
  quality: PackQuality;
}

/** Ordre tiré, chaque manager avec la qualité de son paquet. */
export function withQualities(order: DrawEntry[]): QualifiedEntry[] {
  const qualities = qualitiesForOrder(order.length);
  return order
    .slice()
    .sort((a, b) => a.pick - b.pick)
    .map((e, i) => ({ ...e, quality: qualities[i] }));
}

// ─── Lancement du tirage ───────────────────────────────────────

/** Repli : à partir de 12:00 UTC du jour de création de la session, tout membre peut lancer. */
export function isFallbackStartOpen(sessionCreatedAt: Date, now: Date): boolean {
  const open = Date.UTC(
    sessionCreatedAt.getUTCFullYear(),
    sessionCreatedAt.getUTCMonth(),
    sessionCreatedAt.getUTCDate(),
    LOTTERY_FALLBACK_START_HOUR_UTC,
  );
  return now.getTime() >= open;
}

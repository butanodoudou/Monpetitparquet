// ─── Loterie du lundi : logique pure ───────────────────────────
// Aucune dépendance à Supabase ni à React : testable avec scripts/check-lottery.ts.
// Le barème et les postes viennent de lib/fantasy.ts, rien n'est redéfini ici.
// Spec : .claude/specs/loterie.md

import {
  AUCTION_PACK_COMPOSITION,
  POSITION_GROUP_MAP,
  ROSTER_SIZE,
  ROSTER_SLOTS,
  type AuctionTier,
  type PositionGroup,
} from './fantasy';

export const LOTTERY_PICK_SECONDS = 60;
/** Décalage entre deux lignes lors de la révélation de l'ordre (ms). */
export const LOTTERY_ORDER_STEP_MS = 450;
/** Heure UTC à partir de laquelle n'importe quel membre peut lancer le direct. */
export const LOTTERY_FALLBACK_START_HOUR_UTC = 12;
export const LOTTERY_MIN_TICKETS = 1;
export const LOTTERY_MAX_TICKETS = 10;

/** Composition d'un pack réduit (pool de free agents insuffisant). */
export const LOTTERY_SMALL_PACK_COMPOSITION: AuctionTier[] = ['elite', 'star', 'basique'];

/** Ordre de repli quand un tier est épuisé : on prend le tier le plus proche. */
const TIER_FALLBACK: Record<AuctionTier, AuctionTier[]> = {
  elite: ['star', 'basique'],
  star: ['basique', 'elite'],
  basique: ['star', 'elite'],
};

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

// ─── Composition des packs ─────────────────────────────────────

export interface PoolPlayer {
  id: number;
  tier: AuctionTier;
}

export type BuildPacksResult =
  | { ok: true; packSize: number; degraded: boolean; packs: PoolPlayer[][] }
  | { ok: false; reason: 'empty' | 'insufficient' };

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/**
 * Compose nPacks packs sans remise entre eux.
 * 1. Pack complet 1 elite / 2 star / 2 basique si chaque tier suffit pour tous les packs.
 * 2. Sinon packs de 3 (1 / 1 / 1), en complétant avec le tier le plus proche si besoin.
 * 3. Sinon, tout le pool réparti à parts égales (au moins 1 joueur par pack).
 * Moins de joueurs que de packs, ou pool vide : pas de loterie (la session sera annulée).
 */
export function buildPacks(pool: PoolPlayer[], nPacks: number, rng: Rng = Math.random): BuildPacksResult {
  if (nPacks < 1 || pool.length === 0) return { ok: false, reason: 'empty' };

  // Dédoublonnage défensif : un joueur ne peut apparaître qu'une fois dans toute la loterie.
  const seen: Record<number, true> = {};
  const unique = pool.filter(p => (seen[p.id] ? false : (seen[p.id] = true)));

  const byTier: Record<AuctionTier, PoolPlayer[]> = { elite: [], star: [], basique: [] };
  for (const p of shuffle(unique, rng)) byTier[p.tier].push(p);

  const need = (comp: AuctionTier[]) => {
    const c: Record<AuctionTier, number> = { elite: 0, star: 0, basique: 0 };
    for (const t of comp) c[t]++;
    return c;
  };
  const strictlyFits = (comp: AuctionTier[]) => {
    const c = need(comp);
    return (Object.keys(c) as AuctionTier[]).every(t => byTier[t].length >= c[t] * nPacks);
  };

  let composition: AuctionTier[];
  let degraded = false;
  if (strictlyFits(AUCTION_PACK_COMPOSITION)) {
    composition = AUCTION_PACK_COMPOSITION;
  } else if (unique.length >= nPacks * LOTTERY_SMALL_PACK_COMPOSITION.length) {
    composition = LOTTERY_SMALL_PACK_COMPOSITION;
    degraded = true;
  } else if (unique.length >= nPacks) {
    const size = Math.floor(unique.length / nPacks);
    composition = [];
    for (let i = 0; i < size; i++) composition.push(LOTTERY_SMALL_PACK_COMPOSITION[i % LOTTERY_SMALL_PACK_COMPOSITION.length]);
    degraded = true;
  } else {
    return { ok: false, reason: 'insufficient' };
  }

  const take = (tier: AuctionTier): PoolPlayer | null => {
    const order: AuctionTier[] = [tier, ...TIER_FALLBACK[tier]];
    for (const t of order) {
      const p = byTier[t].shift();
      if (p) return p;
    }
    return null;
  };

  const packs: PoolPlayer[][] = [];
  for (let i = 0; i < nPacks; i++) {
    const cards: PoolPlayer[] = [];
    for (const tier of composition) {
      const p = take(tier);
      if (p) cards.push(p);
    }
    packs.push(cards);
  }
  return { ok: true, packSize: composition.length, degraded, packs };
}

// ─── Relâche et postes ─────────────────────────────────────────

export interface RosterPlayer {
  player_id: number;
  position: string | null;
  season_avg_fantasy: number;
}

export function groupOf(position: string | null | undefined): PositionGroup | null {
  return position ? POSITION_GROUP_MAP[position] ?? null : null;
}

function groupCounts(roster: RosterPlayer[]): Record<PositionGroup, number> {
  const c: Record<PositionGroup, number> = { arriere: 0, sf: 0, grand: 0 };
  for (const p of roster) {
    const g = groupOf(p.position);
    if (g) c[g]++;
  }
  return c;
}

export interface ReleaseRule {
  /** false si la carte ne peut pas être prise (poste inconnu, ou aucun joueur relâchable). */
  selectable: boolean;
  /** true si prendre cette carte impose de relâcher un joueur. */
  releaseRequired: boolean;
  /** Joueurs du roster qu'on a le droit de relâcher pour cette carte. */
  candidates: number[];
}

/**
 * Règle de relâche pour une carte donnée.
 * - Poste du joueur entrant déjà complet (ROSTER_SLOTS) : relâche obligatoire, même groupe de poste.
 *   Ce cas existe aussi quand le roster a moins de ROSTER_SIZE joueurs : sans cela, un pack
 *   sans le poste manquant bloquerait le manager.
 * - Roster plein mais poste entrant libre (roster atypique) : relâche d'un groupe en surnombre.
 * - Sinon : pas de relâche.
 */
export function releaseRule(
  roster: RosterPlayer[],
  incomingPosition: string | null,
  rosterSize: number = ROSTER_SIZE,
): ReleaseRule {
  const g = groupOf(incomingPosition);
  if (!g) return { selectable: false, releaseRequired: false, candidates: [] };

  const counts = groupCounts(roster);
  const groupFull = counts[g] >= ROSTER_SLOTS[g];
  const rosterFull = roster.length >= rosterSize;

  if (!groupFull && !rosterFull) return { selectable: true, releaseRequired: false, candidates: [] };

  let candidates: RosterPlayer[];
  if (groupFull) {
    candidates = roster.filter(p => groupOf(p.position) === g);
  } else {
    candidates = roster.filter(p => {
      const pg = groupOf(p.position);
      return pg !== null && counts[pg] > ROSTER_SLOTS[pg];
    });
    if (candidates.length === 0) candidates = roster.slice();
  }
  return {
    selectable: candidates.length > 0,
    releaseRequired: true,
    candidates: candidates.map(p => p.player_id),
  };
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/** Validation serveur d'un pick : relâche obligatoire ou interdite, bon groupe de poste. */
export function validatePick(
  roster: RosterPlayer[],
  incomingPosition: string | null,
  releasePlayerId: number | null,
  rosterSize: number = ROSTER_SIZE,
): ValidationResult {
  const rule = releaseRule(roster, incomingPosition, rosterSize);
  if (!rule.selectable) {
    return { ok: false, error: 'Ce joueur ne peut pas rejoindre ton équipe (poste complet ou inconnu)' };
  }
  if (!rule.releaseRequired) {
    if (releasePlayerId !== null) return { ok: false, error: "Ton équipe n'est pas complète à ce poste : pas de relâche" };
    return { ok: true };
  }
  if (releasePlayerId === null) {
    return { ok: false, error: 'Tu dois relâcher un joueur pour faire de la place' };
  }
  if (!roster.some(p => p.player_id === releasePlayerId)) {
    return { ok: false, error: "Le joueur à relâcher ne fait pas partie de ton équipe" };
  }
  if (rule.candidates.indexOf(releasePlayerId) === -1) {
    return { ok: false, error: 'Tu dois relâcher un joueur du même poste (3 arrières, 2 ailiers, 3 intérieurs)' };
  }
  return { ok: true };
}

export interface AutoPickCard {
  id: number;
  position: string | null;
  season_avg_fantasy: number;
}

/**
 * Choix automatique : la carte à la meilleure moyenne compatible avec les postes,
 * en relâchant le joueur le plus faible parmi ceux autorisés. null si aucune carte n'est prenable.
 */
export function chooseAutoPick(
  roster: RosterPlayer[],
  cards: AutoPickCard[],
  rosterSize: number = ROSTER_SIZE,
): { playerId: number; releaseId: number | null } | null {
  const sorted = cards.slice().sort((a, b) =>
    b.season_avg_fantasy - a.season_avg_fantasy || a.id - b.id
  );
  for (const card of sorted) {
    const rule = releaseRule(roster, card.position, rosterSize);
    if (!rule.selectable) continue;
    if (!rule.releaseRequired) return { playerId: card.id, releaseId: null };
    const weakest = roster
      .filter(p => rule.candidates.indexOf(p.player_id) !== -1)
      .sort((a, b) => a.season_avg_fantasy - b.season_avg_fantasy || a.player_id - b.player_id)[0];
    if (weakest) return { playerId: card.id, releaseId: weakest.player_id };
  }
  return null;
}

// ─── Lancement du direct ───────────────────────────────────────

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

import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase';
import { CURRENT_SEASON } from '@/lib/sports-api';
import { buildScheduleRows, SEASON_WEEKS } from '@/lib/schedule';
import { EMPTY_STATS, cardsAt, resolveLineup, scoreStarters, type PerfLine, type ScoringCard, type UserWeekStats } from '@/lib/card-scoring';
import { loadSeasonCardRows, toCardView, toScoringCard } from '@/lib/collection';
import type { CardView } from '@/lib/card-view';

// Repli de clôture : si aucune journée ultérieure n'est connue en base (matchs à venir non
// encore synchronisés), une journée terminée n'est clôturée qu'après ce délai suivant son dernier match.
const SETTLE_DELAY_MS = 36 * 3600 * 1000;

const round1 = (n: number) => Math.round(n * 10) / 10;

// ─── Journée courante / à jouer ─────────────────────────────────

interface MatchLite { week: number | null; status: string | null; match_date: string }

async function loadSeasonMatches(supabase: SupabaseClient): Promise<MatchLite[]> {
  const { data } = await supabase
    .from('matches')
    .select('week, status, match_date')
    .eq('season', CURRENT_SEASON)
    .gt('week', 0);
  return (data ?? []) as MatchLite[];
}

/**
 * Dernière journée (saison en cours) ayant au moins un match terminé, ou null.
 * Un match joué en avance (J13 jouée pendant la J7) ne compte pas : on s'arrête à la première
 * journée qui a encore des matchs à jouer.
 */
export async function getLastScoredWeek(supabase: SupabaseClient): Promise<number | null> {
  const matches = await loadSeasonMatches(supabase);
  let firstOpen = Infinity;
  for (const m of matches) {
    if (m.week !== null && (m.status === 'scheduled' || m.status === 'live') && m.week < firstOpen) firstOpen = m.week;
  }
  let max: number | null = null;
  for (const m of matches) {
    if (m.status === 'finished' && m.week !== null && m.week <= firstOpen && (max === null || m.week > max)) max = m.week;
  }
  return max;
}

/**
 * Prochaine journée à jouer : la plus petite journée avec au moins un match non terminé,
 * à défaut dernière journée terminée + 1 (1 si rien n'est terminé).
 * Verrouillée dès que le premier match de cette journée a commencé.
 */
export async function getPlayableWeek(
  supabase: SupabaseClient
): Promise<{ week: number; lockAt: string | null; isLocked: boolean }> {
  const matches = await loadSeasonMatches(supabase);

  let week: number | null = null;
  let lastFinished = 0;
  // Un match reporté ou annulé ne retient pas sa journée : sinon elle resterait « à jouer »
  // indéfiniment, avec une compo verrouillée en permanence (date d'origine dépassée).
  for (const m of matches) {
    if (m.week === null) continue;
    if (m.status === 'scheduled' || m.status === 'live') {
      if (week === null || m.week < week) week = m.week;
    } else if (m.status === 'finished' && m.week > lastFinished) {
      lastFinished = m.week;
    }
  }
  if (week === null) week = lastFinished + 1;

  let lockAtMs: number | null = null;
  for (const m of matches) {
    if (m.week !== week) continue;
    if (m.status === 'postponed' || m.status === 'cancelled') continue;
    const t = new Date(m.match_date).getTime();
    if (lockAtMs === null || t < lockAtMs) lockAtMs = t;
  }

  return {
    week,
    lockAt: lockAtMs === null ? null : new Date(lockAtMs).toISOString(),
    isLocked: lockAtMs !== null && Date.now() >= lockAtMs,
  };
}

/**
 * Crée le calendrier d'une ligue à partir de la prochaine journée jouable : une ligue lancée en cours
 * de saison ne doit pas régler des duels sur des matchs joués avant son draft.
 */
export async function createLeagueSchedule(
  supabase: SupabaseClient,
  leagueId: string,
  userIds: string[]
): Promise<{ weeks: number; matchups: number; error: string | null }> {
  const { week, isLocked } = await getPlayableWeek(supabase);
  const firstWeek = isLocked ? week + 1 : week;
  const rows = buildScheduleRows(leagueId, CURRENT_SEASON, userIds, firstWeek);
  if (rows.length === 0) return { weeks: 0, matchups: 0, error: null };
  const { error } = await supabase.from('weekly_matchups').insert(rows);
  return { weeks: SEASON_WEEKS - firstWeek + 1, matchups: rows.length, error: error?.message ?? null };
}

// ─── Contexte de ligue : cartes et compositions ─────────────────

export interface LeagueContext {
  memberIds: string[];
  /** Toutes les cartes de la saison de chaque manager, vendues comprises. */
  cardsByUser: Map<string, ScoringCard[]>;
  /** Vue de chaque carte, pour l'affichage des duels. */
  viewById: Map<string, CardView>;
}

export async function loadLeagueContext(supabase: SupabaseClient, leagueId: string): Promise<LeagueContext> {
  const { data: members } = await supabase.from('league_members').select('user_id').eq('league_id', leagueId);
  const memberIds = (members ?? []).map(m => m.user_id as string);

  const rows = await loadSeasonCardRows(supabase, memberIds);
  const cardsByUser = new Map<string, ScoringCard[]>(memberIds.map(id => [id, []]));
  const viewById = new Map<string, CardView>();
  for (const row of rows) {
    const card = toScoringCard(row);
    if (!card) continue;
    cardsByUser.get(card.user_id)?.push(card);
    viewById.set(card.id, toCardView(row));
  }
  return { memberIds, cardsByUser, viewById };
}

/**
 * Instant où le cinq d'une journée est figé : le début de son premier match (hors reportés et annulés),
 * ou maintenant tant qu'elle n'est pas verrouillée.
 */
export function lineupCutoffMs(weekMatches: { status: string | null; match_date: string }[], nowMs = Date.now()): number {
  let lockMs: number | null = null;
  for (const m of weekMatches) {
    if (m.status === 'postponed' || m.status === 'cancelled') continue;
    const t = new Date(m.match_date).getTime();
    if (lockMs === null || t < lockMs) lockMs = t;
  }
  return lockMs === null ? nowMs : Math.min(lockMs, nowMs);
}

/**
 * Titulaires de chaque manager pour la journée `week`, dans l'ordre des places : sa composition de
 * cette journée, sinon la dernière composition enregistrée, sinon le cinq par défaut.
 * Les cartes comptées sont celles qu'il avait au verrou (`atMs`) : une carte vendue après coup compte
 * encore pour une journée passée, mais plus pour une journée future. Une composition devenue invalide est ignorée.
 */
export async function resolveStarters(
  supabase: SupabaseClient,
  leagueId: string,
  week: number,
  ctx: LeagueContext,
  atMs: number
): Promise<Map<string, ScoringCard[]>> {
  const { data: lineups } = await supabase
    .from('weekly_lineups')
    .select('user_id, week, starter_card_ids')
    .eq('league_id', leagueId)
    .lte('week', week)
    .not('starter_card_ids', 'is', null);

  const bestByUser = new Map<string, { week: number; ids: string[] }>();
  for (const l of lineups ?? []) {
    const cur = bestByUser.get(l.user_id);
    if (!cur || l.week > cur.week) bestByUser.set(l.user_id, { week: l.week, ids: l.starter_card_ids ?? [] });
  }

  const result = new Map<string, ScoringCard[]>();
  for (const userId of ctx.memberIds) {
    const available = cardsAt(ctx.cardsByUser.get(userId) ?? [], atMs);
    result.set(userId, resolveLineup(bestByUser.get(userId)?.ids, available));
  }
  return result;
}

// ─── Calcul des scores d'une journée (source unique) ────────────

export type { UserWeekStats } from '@/lib/card-scoring';

export interface MatchupScore {
  homeScore: number;
  awayScore: number;
  winnerUserId: string | null; // null = égalité
}

/** Score final des deux camps : (base + chimie) x weekend, puis x multiplicateur défensif adverse. */
export function scoreMatchup(
  homeId: string, away: string,
  home: UserWeekStats, awayStats: UserWeekStats
): MatchupScore {
  const homeAfterWeekend = round1((home.base + home.chem) * home.weekendMult);
  const awayAfterWeekend = round1((awayStats.base + awayStats.chem) * awayStats.weekendMult);
  const homeScore = round1(homeAfterWeekend * awayStats.defMult);
  const awayScore = round1(awayAfterWeekend * home.defMult);
  return {
    homeScore,
    awayScore,
    winnerUserId: homeScore > awayScore ? homeId : awayScore > homeScore ? away : null,
  };
}

export function statsOf(map: Map<string, UserWeekStats>, userId: string): UserWeekStats {
  return map.get(userId) ?? EMPTY_STATS;
}

/** Stats (base, chimie, weekend, défense) de chaque manager pour une journée, matchs terminés de la saison courante. */
export async function computeWeekStats(
  supabase: SupabaseClient,
  leagueId: string,
  week: number,
  ctx: LeagueContext
): Promise<Map<string, UserWeekStats>> {
  const { data: allWeekMatches } = await supabase
    .from('matches')
    .select('id, status, home_team_id, away_team_id, home_score, away_score, match_date')
    .eq('season', CURRENT_SEASON)
    .eq('week', week);

  const starters = await resolveStarters(supabase, leagueId, week, ctx, lineupCutoffMs(allWeekMatches ?? []));

  const weekMatches = (allWeekMatches ?? []).filter(m => m.status === 'finished');
  const matchIds = weekMatches.map(m => m.id);

  // Équipes réelles victorieuses le samedi/dimanche (bonus weekend)
  const winningTeamIds = new Set<number>();
  for (const m of weekMatches) {
    const day = new Date(m.match_date).getDay();
    if (day !== 0 && day !== 6) continue;
    if (m.home_score !== null && m.away_score !== null) {
      if (m.home_score > m.away_score) winningTeamIds.add(m.home_team_id);
      else if (m.away_score > m.home_score) winningTeamIds.add(m.away_team_id);
    }
  }

  // Perfs de la journée, indexées par joueur : plusieurs managers peuvent aligner le même joueur.
  const playerIds = Array.from(new Set(Array.from(starters.values()).flatMap(list => list.map(c => c.player_id))));
  const perfsByPlayer = new Map<number, PerfLine[]>();
  if (matchIds.length > 0 && playerIds.length > 0) {
    const { data: performances } = await supabase
      .from('player_performances')
      .select('player_id, fantasy_score, blocks, steals')
      .in('match_id', matchIds)
      .in('player_id', playerIds);
    for (const perf of (performances ?? []) as PerfLine[]) {
      const list = perfsByPlayer.get(perf.player_id) ?? [];
      list.push(perf);
      perfsByPlayer.set(perf.player_id, list);
    }
  }

  const out = new Map<string, UserWeekStats>();
  for (const [userId, list] of Array.from(starters)) {
    out.set(userId, scoreStarters(list, perfsByPlayer, winningTeamIds));
  }
  return out;
}

// ─── Clôture des semaines ───────────────────────────────────────

/**
 * Calcule et persiste vainqueur + scores finaux des duels dont la journée est terminée.
 * Égalité : winner_user_id null avec settled_at renseigné. Idempotent. Retourne le nb de journées clôturées.
 */
export async function settleFinishedWeeks(leagueId: string): Promise<number> {
  const supabase = db();

  const { data: pending } = await supabase
    .from('weekly_matchups')
    .select('id, week, home_user_id, away_user_id')
    .eq('league_id', leagueId)
    .eq('season', CURRENT_SEASON)
    .is('settled_at', null);
  if (!pending?.length) return 0;

  const matches = await loadSeasonMatches(supabase);
  // finished : terminés ; cancelled : annulés (ne comptent pas) ; postponed : reportés (voir plus bas) ;
  // open : tout le reste (scheduled, live...) = journée incomplète.
  const byWeek = new Map<number, { finished: number; cancelled: number; postponed: number; open: number; lastMs: number; lastPlayedMs: number }>();
  let maxKnownWeek = 0; // plus grande journée connue en base (matchs à venir inclus)
  for (const m of matches) {
    if (m.week === null) continue;
    const e = byWeek.get(m.week) ?? { finished: 0, cancelled: 0, postponed: 0, open: 0, lastMs: 0, lastPlayedMs: 0 };
    if (m.status === 'finished') {
      e.finished++;
      e.lastPlayedMs = Math.max(e.lastPlayedMs, new Date(m.match_date).getTime());
    } else if (m.status === 'cancelled') {
      e.cancelled++;
    } else if (m.status === 'postponed') {
      e.postponed++;
    } else {
      e.open++;
    }
    if (m.week > maxKnownWeek) maxKnownWeek = m.week;
    e.lastMs = Math.max(e.lastMs, new Date(m.match_date).getTime());
    byWeek.set(m.week, e);
  }

  // Une journée située après une journée encore ouverte n'est pas close : ses autres matchs peuvent
  // être au-delà de la fenêtre `events/next/0` (cas d'un match de J13 joué en avance pendant la J7).
  let firstOpenWeek = Infinity;
  byWeek.forEach((e, w) => { if (e.open > 0 && w < firstOpenWeek) firstOpenWeek = w; });

  // Journée close dès que tous ses matchs en base sont terminés ou annulés (au moins un terminé).
  // Match reporté : il ne bloque la clôture que pendant le délai de repli (36 h après le dernier match
  // joué de la journée). Passé ce délai, la journée est réglée sans lui : ses points, joués plus tard,
  // ne compteront pour aucun duel (limite assumée en v0).
  // Garde-fou : tant qu'aucune journée ultérieure n'est connue en base (ni terminée, ni à venir),
  // on ne sait pas si des matchs de cette journée manquent encore -> repli 36 h après le dernier match.
  const settleable = (week: number): boolean => {
    const e = byWeek.get(week);
    if (!e || e.finished === 0 || e.open > 0 || week > firstOpenWeek) return false;
    if (e.postponed > 0 && Date.now() - e.lastPlayedMs < SETTLE_DELAY_MS) return false;
    return maxKnownWeek > week || Date.now() - e.lastMs >= SETTLE_DELAY_MS;
  };

  const weeks = Array.from(new Set(pending.map(p => p.week as number))).filter(settleable).sort((a, b) => a - b);
  if (!weeks.length) return 0;

  const ctx = await loadLeagueContext(supabase, leagueId);
  let settled = 0;

  for (const week of weeks) {
    const stats = await computeWeekStats(supabase, leagueId, week, ctx);
    for (const mu of pending.filter(p => p.week === week)) {
      const r = scoreMatchup(mu.home_user_id, mu.away_user_id, statsOf(stats, mu.home_user_id), statsOf(stats, mu.away_user_id));
      const { error } = await supabase
        .from('weekly_matchups')
        .update({
          home_score: r.homeScore,
          away_score: r.awayScore,
          winner_user_id: r.winnerUserId,
          settled_at: new Date().toISOString(),
        })
        .eq('id', mu.id)
        .is('settled_at', null);
      if (error) throw new Error(error.message);
    }
    settled++;
  }
  return settled;
}

// ─── Bilan V-N-D ────────────────────────────────────────────────

export async function loadRecords(
  supabase: SupabaseClient,
  leagueId: string
): Promise<Record<string, { wins: number; losses: number; draws: number; pointsFor: number }>> {
  const { data } = await supabase
    .from('weekly_matchups')
    .select('home_user_id, away_user_id, winner_user_id, home_score, away_score')
    .eq('league_id', leagueId)
    .eq('season', CURRENT_SEASON)
    .not('settled_at', 'is', null);

  const rec: Record<string, { wins: number; losses: number; draws: number; pointsFor: number }> = {};
  const ensure = (u: string) => { if (!rec[u]) rec[u] = { wins: 0, losses: 0, draws: 0, pointsFor: 0 }; };

  for (const m of data ?? []) {
    ensure(m.home_user_id);
    ensure(m.away_user_id);
    rec[m.home_user_id].pointsFor += m.home_score ?? 0;
    rec[m.away_user_id].pointsFor += m.away_score ?? 0;
    if (!m.winner_user_id) {
      rec[m.home_user_id].draws++;
      rec[m.away_user_id].draws++;
    } else if (m.winner_user_id === m.home_user_id) {
      rec[m.home_user_id].wins++;
      rec[m.away_user_id].losses++;
    } else {
      rec[m.away_user_id].wins++;
      rec[m.home_user_id].losses++;
    }
  }
  for (const u of Object.keys(rec)) rec[u].pointsFor = round1(rec[u].pointsFor);
  return rec;
}

export async function isLeagueMember(supabase: SupabaseClient, leagueId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

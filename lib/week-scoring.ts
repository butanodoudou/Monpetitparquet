import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase';
import { CURRENT_SEASON } from '@/lib/sports-api';
import {
  computeDefaultStarters,
  computeChemistryBonus,
  computeWeekendMultiplier,
  computeDefensiveMultiplier,
  STARTER_SLOTS,
  POSITION_GROUP_MAP,
  type PositionGroup,
} from '@/lib/fantasy';

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

/** Dernière journée (saison en cours) ayant au moins un match terminé, ou null. */
export async function getLastScoredWeek(supabase: SupabaseClient): Promise<number | null> {
  const matches = await loadSeasonMatches(supabase);
  let max: number | null = null;
  for (const m of matches) {
    if (m.status === 'finished' && m.week !== null && (max === null || m.week > max)) max = m.week;
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

// ─── Contexte de ligue : rosters et compositions ────────────────

interface RosterEntry { player_id: number; position: string; season_avg_fantasy: number }
interface PlayerMeta { team_id: number | null; nationality: string | null }

export interface LeagueContext {
  rosterByUser: Map<string, RosterEntry[]>;
  ownerByPlayer: Map<number, string>;
  playerMeta: Map<number, PlayerMeta>;
}

export async function loadLeagueContext(supabase: SupabaseClient, leagueId: string): Promise<LeagueContext> {
  const { data: teamPlayers } = await supabase
    .from('team_players')
    .select('user_id, player_id, player:players(position, season_avg_fantasy, team_id, nationality)')
    .eq('league_id', leagueId);

  const rosterByUser = new Map<string, RosterEntry[]>();
  const ownerByPlayer = new Map<number, string>();
  const playerMeta = new Map<number, PlayerMeta>();

  for (const tp of teamPlayers ?? []) {
    const player = tp.player as any;
    if (!rosterByUser.has(tp.user_id)) rosterByUser.set(tp.user_id, []);
    rosterByUser.get(tp.user_id)!.push({
      player_id: tp.player_id,
      position: player?.position ?? '',
      season_avg_fantasy: player?.season_avg_fantasy ?? 0,
    });
    ownerByPlayer.set(tp.player_id, tp.user_id);
    playerMeta.set(tp.player_id, { team_id: player?.team_id ?? null, nationality: player?.nationality ?? null });
  }
  return { rosterByUser, ownerByPlayer, playerMeta };
}

function isValidLineup(ids: number[], roster: RosterEntry[]): boolean {
  if (ids.length !== 5) return false;
  const byId = new Map(roster.map(r => [r.player_id, r]));
  const counts: Record<PositionGroup, number> = { arriere: 0, sf: 0, grand: 0 };
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) return false;
    const g = POSITION_GROUP_MAP[r.position];
    if (!g) return false;
    counts[g]++;
  }
  return (Object.keys(STARTER_SLOTS) as PositionGroup[]).every(g => counts[g] === STARTER_SLOTS[g]);
}

/**
 * Titulaires de chaque manager pour la journée `week` : sa composition de cette journée,
 * sinon la dernière composition enregistrée (journée antérieure), sinon la composition par défaut.
 * Une composition devenue invalide (joueur sorti du roster) est ignorée.
 */
export async function resolveStarters(
  supabase: SupabaseClient,
  leagueId: string,
  week: number,
  ctx: LeagueContext
): Promise<Map<string, number[]>> {
  const { data: lineups } = await supabase
    .from('weekly_lineups')
    .select('user_id, week, starter_player_ids')
    .eq('league_id', leagueId)
    .lte('week', week);

  const bestByUser = new Map<string, { week: number; ids: number[] }>();
  for (const l of lineups ?? []) {
    const cur = bestByUser.get(l.user_id);
    if (!cur || l.week > cur.week) bestByUser.set(l.user_id, { week: l.week, ids: l.starter_player_ids ?? [] });
  }

  const result = new Map<string, number[]>();
  for (const [userId, roster] of Array.from(ctx.rosterByUser)) {
    const saved = bestByUser.get(userId)?.ids;
    result.set(userId, saved && isValidLineup(saved, roster) ? saved : computeDefaultStarters(roster));
  }
  return result;
}

// ─── Calcul des scores d'une journée (source unique) ────────────

export interface UserWeekStats {
  base: number;
  chem: number;
  weekendMult: number;
  defMult: number; // multiplicateur défensif que CE manager applique à son adversaire
}

export interface MatchupScore {
  homeScore: number;
  awayScore: number;
  winnerUserId: string | null; // null = égalité
}

const EMPTY_STATS: UserWeekStats = { base: 0, chem: 0, weekendMult: 1, defMult: 1 };

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
  const starters = await resolveStarters(supabase, leagueId, week, ctx);

  const { data: weekMatches } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, home_score, away_score, match_date')
    .eq('season', CURRENT_SEASON)
    .eq('week', week)
    .eq('status', 'finished');

  const matchIds = (weekMatches ?? []).map(m => m.id);

  // Équipes réelles victorieuses le samedi/dimanche (bonus weekend)
  const winningTeamIds = new Set<number>();
  for (const m of weekMatches ?? []) {
    const day = new Date(m.match_date).getDay();
    if (day !== 0 && day !== 6) continue;
    if (m.home_score !== null && m.away_score !== null) {
      if (m.home_score > m.away_score) winningTeamIds.add(m.home_team_id);
      else if (m.away_score > m.home_score) winningTeamIds.add(m.away_team_id);
    }
  }

  const baseByUser: Record<string, number> = {};
  const defRawByUser: Record<string, number> = {};
  const playerIds = Array.from(ctx.ownerByPlayer.keys());

  if (matchIds.length > 0 && playerIds.length > 0) {
    const { data: performances } = await supabase
      .from('player_performances')
      .select('player_id, fantasy_score, blocks, steals')
      .in('match_id', matchIds)
      .in('player_id', playerIds);

    for (const perf of performances ?? []) {
      const owner = ctx.ownerByPlayer.get(perf.player_id);
      if (!owner || !starters.get(owner)?.includes(perf.player_id)) continue;
      baseByUser[owner] = (baseByUser[owner] ?? 0) + (perf.fantasy_score ?? 0);
      defRawByUser[owner] = (defRawByUser[owner] ?? 0) + (perf.blocks ?? 0) + (perf.steals ?? 0);
    }
  }

  const out = new Map<string, UserWeekStats>();
  for (const [userId, ids] of Array.from(starters)) {
    const metas = ids.map(id => ctx.playerMeta.get(id) ?? { team_id: null, nationality: null });
    out.set(userId, {
      base: baseByUser[userId] ?? 0,
      chem: computeChemistryBonus(metas),
      weekendMult: computeWeekendMultiplier(metas.map(m => ({ team_id: m.team_id })), winningTeamIds),
      defMult: computeDefensiveMultiplier(defRawByUser[userId] ?? 0),
    });
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

  // Journée close dès que tous ses matchs en base sont terminés ou annulés (au moins un terminé).
  // Match reporté : il ne bloque la clôture que pendant le délai de repli (36 h après le dernier match
  // joué de la journée). Passé ce délai, la journée est réglée sans lui : ses points, joués plus tard,
  // ne compteront pour aucun duel (limite assumée en v0).
  // Garde-fou : tant qu'aucune journée ultérieure n'est connue en base (ni terminée, ni à venir),
  // on ne sait pas si des matchs de cette journée manquent encore -> repli 36 h après le dernier match.
  const settleable = (week: number): boolean => {
    const e = byWeek.get(week);
    if (!e || e.finished === 0 || e.open > 0) return false;
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

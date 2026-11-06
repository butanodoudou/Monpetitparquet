// Sofascore unofficial API — LNB Élite (ex Pro A / Betclic Élite)
// Sofascore is behind Cloudflare: route requests through ScraperAPI in production.
// SCRAPER_API_KEY env var required on Vercel (free tier: 1000 req/month).

const SOFA_BASE = 'https://www.sofascore.com/api/v1';
export const TOURNAMENT_ID = 156;      // LNB Élite (ex Pro A / Betclic Élite)
export const SEASON_ID     = 102568;   // LNB Élite 26/27
// Libellé stocké en base (matches.season). À incrémenter avec SEASON_ID.
export const CURRENT_SEASON = '2026-2027';
// Saisons précédentes, pour mémoire : 79100 = 25/26, 64004 = 24/25, 53266 = 23/24

function buildUrl(path: string): string {
  const target = `${SOFA_BASE}${path}`;
  const key = process.env.SCRAPER_API_KEY;
  if (key) return `https://api.scraperapi.com/?api_key=${key}&url=${encodeURIComponent(target)}`;
  return target;
}

// Le proxy renvoie parfois une page HTML avec un statut 200 : un nouvel essai suffit en général.
const MAX_ATTEMPTS = 3;

async function sfFetch<T>(path: string): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(buildUrl(path), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      next: { revalidate: 0 },
    });

    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        lastError = new Error(`Sofascore ${path} → réponse non JSON`);
        continue;
      }
    }

    lastError = new Error(`Sofascore ${path} → HTTP ${res.status}`);
    // Une erreur 4xx ne changera pas au prochain essai : inutile de consommer du quota.
    if (res.status < 500 && res.status !== 429) break;
  }

  throw lastError;
}

export interface SofaTeam {
  id: number;
  name: string;
  shortName: string;
}

export interface SofaPlayer {
  id: number;
  name: string;
  position?: string;
  jerseyNumber?: number;
  nationality?: string;
  dateOfBirthTimestamp?: number;
  height?: number;
  teamId?: number;
}

export interface SofaEvent {
  id: number;
  roundInfo?: { round: number };
  homeTeam: SofaTeam;
  awayTeam: SofaTeam;
  homeScore?: { current: number };
  awayScore?: { current: number };
  startTimestamp: number;
  status: { type: string };
}

export interface SofaPlayerPerf {
  player: { id: number; name: string };
  teamId: number;
  statistics: {
    points?: number;
    assists?: number;
    rebounds?: number;
    offensiveRebounds?: number;
    defensiveRebounds?: number;
    steals?: number;
    blocks?: number;
    turnovers?: number;
    personalFouls?: number;
    threePointsMade?: number;
    threePointAttempts?: number;
    fieldGoalsMade?: number;
    fieldGoalAttempts?: number;
    freeThrowsMade?: number;
    freeThrowAttempts?: number;
    plusMinus?: number;
    secondsPlayed?: number;
  };
}

export async function fetchTeams(): Promise<SofaTeam[]> {
  const data = await sfFetch<{ teams: SofaTeam[] }>(
    `/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/teams`
  );
  return data.teams;
}

export async function fetchTeamPlayers(teamId: number): Promise<SofaPlayer[]> {
  const data = await sfFetch<{ players: Array<{ player: SofaPlayer }> }>(
    `/team/${teamId}/players`
  );
  return data.players.map(p => ({ ...p.player, teamId }));
}

export async function fetchRecentFinishedEvents(): Promise<SofaEvent[]> {
  const data = await sfFetch<{ events: SofaEvent[] }>(
    `/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/events/last/0`
  );
  const cutoff = Date.now() / 1000 - 48 * 3600;
  return data.events.filter(e => e.status.type === 'finished' && e.startTimestamp >= cutoff);
}

export async function fetchEventsByRound(round: number): Promise<SofaEvent[]> {
  const data = await sfFetch<{ events: SofaEvent[] }>(
    `/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/events/round/${round}`
  );
  return data.events.filter(e => e.status.type === 'finished');
}

// Ligne `matches` d'un match à venir (sans score : les colonnes de score ne sont pas écrasées à l'upsert)
export interface UpcomingMatchRow {
  id: number;
  home_team: string;
  home_team_id: number;
  away_team: string;
  away_team_id: number;
  match_date: string;
  week: number;
  status: 'scheduled' | 'live' | 'postponed' | 'cancelled';
  season: string;
}

// Statut Sofascore (`status.type`) → statut stocké en base. `finished` n'est jamais produit ici
// (un match terminé n'est écrit que par le flux des résultats). Inconnu : null → match ignoré.
function mapUpcomingStatus(type: string | undefined): UpcomingMatchRow['status'] | null {
  switch ((type ?? '').toLowerCase()) {
    case 'notstarted':
    case 'delayed':
      return 'scheduled';
    case 'inprogress':
    case 'interrupted':
      return 'live';
    case 'postponed':
      return 'postponed';
    case 'canceled':
    case 'cancelled':
    case 'abandoned':
      return 'cancelled';
    default:
      return null;
  }
}

/** Normalise un event Sofascore à venir vers le format de la table `matches`. */
export function normalizeUpcomingEvent(e: SofaEvent): UpcomingMatchRow | null {
  const status = mapUpcomingStatus(e.status?.type);
  if (!status || !e.homeTeam || !e.awayTeam || !e.startTimestamp) return null;
  return {
    id: e.id,
    home_team: e.homeTeam.name,
    home_team_id: e.homeTeam.id,
    away_team: e.awayTeam.name,
    away_team_id: e.awayTeam.id,
    match_date: new Date(e.startTimestamp * 1000).toISOString(),
    week: e.roundInfo?.round ?? 0,
    status,
    season: CURRENT_SEASON,
  };
}

/** Prochains matchs de la saison en cours : UN SEUL appel (page 0, pas de pagination) pour économiser le quota ScraperAPI. */
export async function fetchUpcomingMatches(): Promise<UpcomingMatchRow[]> {
  const data = await sfFetch<{ events?: SofaEvent[] }>(
    `/unique-tournament/${TOURNAMENT_ID}/season/${SEASON_ID}/events/next/0`
  );
  const rows: UpcomingMatchRow[] = [];
  for (const e of data.events ?? []) {
    const row = normalizeUpcomingEvent(e);
    if (row) rows.push(row);
  }
  return rows;
}

export async function fetchEventLineups(
  eventId: number,
  homeTeamId: number,
  awayTeamId: number,
): Promise<SofaPlayerPerf[]> {
  const data = await sfFetch<{
    home: { players: Array<{ player: { id: number; name: string }; statistics: SofaPlayerPerf['statistics'] }> };
    away: { players: Array<{ player: { id: number; name: string }; statistics: SofaPlayerPerf['statistics'] }> };
  }>(`/event/${eventId}/lineups`);

  return [
    ...data.home.players.map(p => ({ player: p.player, teamId: homeTeamId, statistics: p.statistics })),
    ...data.away.players.map(p => ({ player: p.player, teamId: awayTeamId, statistics: p.statistics })),
  ];
}

// Sofascore positions: G, GF, F, FC, C
export function normalizePosition(pos: string | null | undefined): string {
  if (!pos) return 'F';
  // Postes composés ("G-F", "F/C", "G, F"…) : on retient le premier poste cité
  const first = pos.toUpperCase().split(/[\s\-\/,]+/).filter(Boolean)[0] ?? '';
  switch (first) {
    case 'G':  case 'PG': return 'PG';
    case 'GF': case 'SG': return 'SG';
    case 'F':  case 'SF': return 'SF';
    case 'FC': case 'PF': return 'PF';
    case 'C':  return 'C';
    default:   return 'F'; // inconnu : ailier par défaut (comme pour un poste absent)
  }
}

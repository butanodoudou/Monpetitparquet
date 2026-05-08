// Sofascore unofficial API — Pro A / Betclic Élite
// Sofascore is behind Cloudflare: route requests through ScraperAPI in production.
// SCRAPER_API_KEY env var required on Vercel (free tier: 1000 req/month).

const SOFA_BASE = 'https://api.sofascore.com/api/v1';
export const TOURNAMENT_ID = 156;  // Pro A / Betclic Élite
export const SEASON_ID     = 79100; // 2025-2026

function buildUrl(path: string): string {
  const target = `${SOFA_BASE}${path}`;
  const key = process.env.SCRAPER_API_KEY;
  if (key) return `https://api.scraperapi.com/?api_key=${key}&url=${encodeURIComponent(target)}`;
  return target;
}

async function sfFetch<T>(path: string): Promise<T> {
  const res = await fetch(buildUrl(path), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Sofascore ${path} → HTTP ${res.status}`);
  return res.json();
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
    steals?: number;
    blocks?: number;
    turnovers?: number;
    threePointsMade?: number;
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
  switch (pos.toUpperCase()) {
    case 'G':  return 'PG';
    case 'GF': return 'SG';
    case 'F':  return 'SF';
    case 'FC': return 'PF';
    case 'C':  return 'C';
    default:   return pos.slice(0, 2).toUpperCase();
  }
}

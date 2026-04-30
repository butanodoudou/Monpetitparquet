// api-sports.io Basketball API
// Free tier: 100 requests/day – register at https://api-sports.io
// Betclic Élite = France Pro A, League ID 116, Season 2024

const HOST = 'https://v1.basketball.api-sports.io';
export const LEAGUE_ID = 2;
export const SEASON = '2024-2025';

async function call<T>(path: string, params: Record<string, string | number> = {}): Promise<T[]> {
  const url = new URL(`${HOST}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString(), {
    headers: { 'x-apisports-key': process.env.API_SPORTS_KEY! },
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error(`api-sports.io ${path} → HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`api-sports.io error: ${JSON.stringify(json.errors)}`);
  }
  return json.response as T[];
}

export interface ApiTeam {
  id: number;
  name: string;
  logo: string;
  national: boolean;
}

export interface ApiPlayer {
  id: number;
  firstname: string;
  lastname: string;
  birth: { date: string; country: string };
  nationality: string;
  height: { feets: string | null; inches: string | null; meters: string | null };
  weight: { pounds: string | null; kilograms: string | null };
  photo: string;
  leagues: Record<string, { season: number; jersey: number; active: boolean; position: string }>;
}

export interface ApiPlayerStats {
  player: { id: number; name: string };
  team: { id: number; name: string };
  game: { id: number };
  pos: string;
  min: string;
  points: number;
  fgm: number; fga: number; fgp: string;
  ftm: number; fta: number; ftp: string;
  tpm: number; tpa: number; tpp: string;  // 3-pointers
  offReb: number; defReb: number; totReb: number;
  assists: number; pFouls: number; steals: number;
  turnovers: number; blocks: number; plusMinus: string;
}

export interface ApiGame {
  id: number;
  date: string;
  time: string;
  timestamp: number;
  timezone: string;
  stage: string | null;
  week: string | null;
  status: { long: string; short: string; timer: string | null };
  league: { id: number; name: string; season: number };
  country: { id: number; name: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  scores: {
    home: { quarter_1: number | null; quarter_2: number | null; quarter_3: number | null; quarter_4: number | null; over_time: number | null; total: number | null };
    away: { quarter_1: number | null; quarter_2: number | null; quarter_3: number | null; quarter_4: number | null; over_time: number | null; total: number | null };
  };
}

export async function fetchTeams(): Promise<{ team: ApiTeam }[]> {
  return call('/teams', { league: LEAGUE_ID, season: SEASON });
}

export async function fetchPlayers(teamId: number, page = 1): Promise<{ player: ApiPlayer }[]> {
  return call('/players', { league: LEAGUE_ID, season: SEASON, team: teamId, page });
}

export async function fetchGames(): Promise<ApiGame[]> {
  return call('/games', { league: LEAGUE_ID, season: SEASON });
}

export async function fetchGamePlayerStats(gameId: number): Promise<ApiPlayerStats[]> {
  return call('/games/statistics/players', { id: gameId });
}

// Map api-sports position strings to our short codes
export function normalizePosition(pos: string | null | undefined): string {
  if (!pos) return 'F';
  const p = pos.toUpperCase().trim();
  if (p.includes('POINT') || p === 'PG' || p === 'G') return 'PG';
  if (p.includes('SHOOT') || p === 'SG') return 'SG';
  if (p.includes('SMALL') || p === 'SF') return 'SF';
  if (p.includes('POWER') || p === 'PF') return 'PF';
  if (p.includes('CENTER') || p === 'C') return 'C';
  if (p === 'F') return 'SF';
  return p.slice(0, 2);
}

// Map api-sports game status to our status
export function normalizeStatus(short: string): 'scheduled' | 'live' | 'finished' {
  if (short === 'FT' || short === 'AOT') return 'finished';
  if (short === 'LIVE' || short === 'Q1' || short === 'Q2' || short === 'Q3' || short === 'Q4' || short === 'OT' || short === 'HT') return 'live';
  return 'scheduled';
}

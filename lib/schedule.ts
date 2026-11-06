export function buildRoundRobin(userIds: string[]): Array<[string, string][]> {
  const ids = [...userIds];
  if (ids.length % 2 !== 0) ids.push('');

  const n = ids.length;
  const rounds: Array<[string, string][]> = [];

  for (let round = 0; round < n - 1; round++) {
    const matchups: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = ids[i];
      const away = ids[n - 1 - i];
      if (home !== '' && away !== '') {
        matchups.push([home, away]);
      }
    }
    rounds.push(matchups);

    // Rotate positions 1..n-1 clockwise (position 0 stays fixed)
    const last = ids[n - 1];
    for (let i = n - 1; i > 1; i--) {
      ids[i] = ids[i - 1];
    }
    ids[1] = last;
  }

  return rounds;
}

export const SEASON_WEEKS = 30;

/** Duels de `firstWeek` à la fin de la saison, en tournant sur les rondes du round robin. */
export function buildScheduleRows(leagueId: string, season: string, userIds: string[], firstWeek: number) {
  const baseRounds = buildRoundRobin(userIds);
  const rows: { league_id: string; season: string; week: number; home_user_id: string; away_user_id: string }[] = [];
  for (let week = firstWeek; week <= SEASON_WEEKS; week++) {
    for (const [homeUserId, awayUserId] of baseRounds[(week - firstWeek) % baseRounds.length]) {
      rows.push({ league_id: leagueId, season, week, home_user_id: homeUserId, away_user_id: awayUserId });
    }
  }
  return rows;
}

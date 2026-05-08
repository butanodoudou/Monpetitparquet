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

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

// Build snake draft order: round 0 → [1..N], round 1 → [N..1], etc.
export function buildSnakeOrder(userIds: string[], picksPerTeam: number): string[] {
  const order: string[] = [];
  for (let r = 0; r < picksPerTeam; r++) {
    const round = r % 2 === 0 ? userIds : [...userIds].reverse();
    order.push(...round);
  }
  return order;
}

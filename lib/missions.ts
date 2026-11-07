// Missions de la journée : règles pures, sans accès à la base. Testé par scripts/check-economy.ts.
// Trois missions évaluées au règlement ; les trois réussies dans une même ligue donnent 1 paquet « mission ».

/** Points qu'un titulaire doit marquer, multiplicateurs de carte et de poste compris. */
export const MISSION_STARTER_POINTS = 30;

export type MissionId = 'lineup' | 'win' | 'star';

export interface MissionState { id: MissionId; label: string; done: boolean }

/** Ce qu'on sait d'un manager dans une ligue pour une journée. */
export interface MissionInput {
  /** Un cinq a été enregistré pour cette journée (la route de composition refuse après le verrou). */
  lineupPlaced: boolean;
  /** Le duel est réglé et le manager l'a gagné. */
  won: boolean;
  /** Points de chaque titulaire après multiplicateurs. */
  starterPoints: number[];
}

export const MISSION_LABELS: Record<MissionId, string> = {
  lineup: 'Pose ton cinq avant le début de la journée',
  win: 'Gagne ton duel',
  star: `Aligne un titulaire à ${MISSION_STARTER_POINTS} points ou plus`,
};

export function evaluateMissions(input: MissionInput): MissionState[] {
  return [
    { id: 'lineup', label: MISSION_LABELS.lineup, done: input.lineupPlaced },
    { id: 'win', label: MISSION_LABELS.win, done: input.won },
    { id: 'star', label: MISSION_LABELS.star, done: input.starterPoints.some(p => p >= MISSION_STARTER_POINTS) },
  ];
}

export const allMissionsDone = (missions: MissionState[]): boolean =>
  missions.length > 0 && missions.every(m => m.done);

/**
 * Ligue à afficher quand le joueur en a plusieurs : celle où il a réussi le plus de missions
 * (les missions ne se cumulent pas entre ligues). À égalité, la première.
 */
export function bestLeagueIndex(results: MissionState[][]): number {
  let best = -1;
  let bestCount = -1;
  results.forEach((missions, i) => {
    const count = missions.filter(m => m.done).length;
    if (count > bestCount) { best = i; bestCount = count; }
  });
  return best;
}

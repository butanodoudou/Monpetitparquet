import Scoreboard from '@/components/scoreboard/Scoreboard';
import type { WeekPhase } from '@/lib/week-phase';

interface DuelSide { user_id: string; username: string; team_name: string; weekScore: number }

export interface DuelWeek {
  currentWeek: number;
  phase: WeekPhase;
  lockAt: string | null;
  matchups: { home: DuelSide; away: DuelSide }[];
}

/** Le tableau du duel du joueur. Rien s'il n'a pas de duel cette journée. */
export default function MyDuelBoard({ week, userId }: { week: DuelWeek; userId: string }) {
  const duel = week.matchups.find(m => m.home.user_id === userId || m.away.user_id === userId);
  if (!duel) return null;
  const [mine, theirs] = duel.home.user_id === userId ? [duel.home, duel.away] : [duel.away, duel.home];
  return (
    <Scoreboard
      phase={week.phase}
      week={week.currentWeek}
      lockAt={week.lockAt}
      me={{ name: mine.username, team: mine.team_name, score: mine.weekScore }}
      opponent={{ name: theirs.username, team: theirs.team_name, score: theirs.weekScore }}
    />
  );
}

import { Router } from 'express';
import Database from 'better-sqlite3';
import { authMiddleware, AuthRequest } from '../middleware/auth';

export default function teamsRouter(db: Database.Database): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/:leagueId/my-team', (req: AuthRequest, res) => {
    const { leagueId } = req.params;

    const players = db.prepare(`
      SELECT p.*,
        COALESCE((
          SELECT SUM(pp.fantasy_score)
          FROM player_performances pp
          JOIN matches m ON m.id = pp.match_id
          WHERE pp.player_id = p.id AND m.status = 'finished'
        ), 0) as total_fantasy,
        COALESCE((
          SELECT pp.fantasy_score
          FROM player_performances pp
          JOIN matches m ON m.id = pp.match_id
          WHERE pp.player_id = p.id
          ORDER BY m.week DESC LIMIT 1
        ), 0) as last_week_fantasy
      FROM team_players tp
      JOIN players p ON p.id = tp.player_id
      WHERE tp.league_id = ? AND tp.user_id = ?
      ORDER BY total_fantasy DESC
    `).all(leagueId, req.userId);

    const totalScore = players.reduce((sum: number, p: any) => sum + p.total_fantasy, 0);

    return res.json({ players, totalScore: Math.round(totalScore * 10) / 10 });
  });

  router.get('/:leagueId/standings', (req: AuthRequest, res) => {
    const { leagueId } = req.params;

    const member = db.prepare(
      'SELECT id FROM league_members WHERE league_id = ? AND user_id = ?'
    ).get(leagueId, req.userId);
    if (!member) return res.status(403).json({ error: 'Accès refusé' });

    const standings = db.prepare(`
      SELECT lm.user_id, lm.team_name, u.username, u.avatar_color,
        COALESCE((
          SELECT SUM(pp.fantasy_score)
          FROM team_players tp
          JOIN player_performances pp ON pp.player_id = tp.player_id
          JOIN matches m ON m.id = pp.match_id
          WHERE tp.league_id = lm.league_id AND tp.user_id = lm.user_id AND m.status = 'finished'
        ), 0) as total_score,
        (SELECT COUNT(*) FROM team_players WHERE league_id = lm.league_id AND user_id = lm.user_id) as player_count
      FROM league_members lm
      JOIN users u ON u.id = lm.user_id
      WHERE lm.league_id = ?
      ORDER BY total_score DESC
    `).all(leagueId);

    return res.json(standings);
  });

  router.get('/:leagueId/week/:week', (req: AuthRequest, res) => {
    const { leagueId, week } = req.params;

    const scores = db.prepare(`
      SELECT lm.user_id, lm.team_name, u.username, u.avatar_color,
        COALESCE(SUM(pp.fantasy_score), 0) as week_score
      FROM league_members lm
      JOIN users u ON u.id = lm.user_id
      LEFT JOIN team_players tp ON tp.league_id = lm.league_id AND tp.user_id = lm.user_id
      LEFT JOIN player_performances pp ON pp.player_id = tp.player_id
      LEFT JOIN matches m ON m.id = pp.match_id AND m.week = ? AND m.status = 'finished'
      WHERE lm.league_id = ?
      GROUP BY lm.user_id
      ORDER BY week_score DESC
    `).all(week, leagueId);

    return res.json(scores);
  });

  return router;
}

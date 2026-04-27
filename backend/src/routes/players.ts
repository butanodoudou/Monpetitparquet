import { Router } from 'express';
import Database from 'better-sqlite3';
import { authMiddleware } from '../middleware/auth';

export default function playersRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', authMiddleware, (_req, res) => {
    const players = db.prepare(`
      SELECT p.*,
        COALESCE(AVG(pp.fantasy_score), 0) as season_avg_fantasy
      FROM players p
      LEFT JOIN player_performances pp ON pp.player_id = p.id
      GROUP BY p.id
      ORDER BY season_avg_fantasy DESC
    `).all();
    return res.json(players);
  });

  router.get('/:id', authMiddleware, (req, res) => {
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id) as any;
    if (!player) return res.status(404).json({ error: 'Joueur introuvable' });

    const performances = db.prepare(`
      SELECT pp.*, m.home_team, m.away_team, m.week, m.match_date, m.home_score, m.away_score
      FROM player_performances pp
      JOIN matches m ON m.id = pp.match_id
      WHERE pp.player_id = ?
      ORDER BY m.week DESC
      LIMIT 10
    `).all(req.params.id);

    return res.json({ ...player, performances });
  });

  return router;
}

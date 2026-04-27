import { Router } from 'express';
import Database from 'better-sqlite3';
import { authMiddleware } from '../middleware/auth';

export default function matchesRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', authMiddleware, (_req, res) => {
    const matches = db.prepare('SELECT * FROM matches ORDER BY week ASC, match_date ASC').all();
    return res.json(matches);
  });

  router.get('/week/:week', authMiddleware, (req, res) => {
    const matches = db.prepare(
      'SELECT * FROM matches WHERE week = ? ORDER BY match_date ASC'
    ).all(req.params.week);
    return res.json(matches);
  });

  router.get('/:id', authMiddleware, (req, res) => {
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id) as any;
    if (!match) return res.status(404).json({ error: 'Match introuvable' });

    const performances = db.prepare(`
      SELECT pp.*, p.name, p.team, p.position, p.jersey_number
      FROM player_performances pp
      JOIN players p ON p.id = pp.player_id
      WHERE pp.match_id = ?
      ORDER BY pp.fantasy_score DESC
    `).all(req.params.id);

    return res.json({ ...match, performances });
  });

  return router;
}

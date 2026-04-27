import { Router } from 'express';
import Database from 'better-sqlite3';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { randomBytes } from 'crypto';

function generateInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export default function leaguesRouter(db: Database.Database): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', (req: AuthRequest, res) => {
    const leagues = db.prepare(`
      SELECT l.*, lm.team_name, lm.draft_position,
        (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count,
        u.username as commissioner_name
      FROM leagues l
      JOIN league_members lm ON lm.league_id = l.id AND lm.user_id = ?
      JOIN users u ON u.id = l.commissioner_id
      ORDER BY l.created_at DESC
    `).all(req.userId);
    return res.json(leagues);
  });

  router.post('/', (req: AuthRequest, res) => {
    const { name, teamName, maxTeams = 8, picksPerTeam = 5 } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom de ligue requis' });
    if (!teamName?.trim()) return res.status(400).json({ error: 'Nom d\'équipe requis' });

    const inviteCode = generateInviteCode();
    const result = db.prepare(
      'INSERT INTO leagues (name, invite_code, commissioner_id, max_teams, picks_per_team) VALUES (?, ?, ?, ?, ?)'
    ).run(name.trim(), inviteCode, req.userId, maxTeams, picksPerTeam);

    const leagueId = result.lastInsertRowid as number;
    db.prepare(
      'INSERT INTO league_members (league_id, user_id, team_name) VALUES (?, ?, ?)'
    ).run(leagueId, req.userId, teamName.trim());

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
    return res.json(league);
  });

  router.post('/join', (req: AuthRequest, res) => {
    const { inviteCode, teamName } = req.body;
    if (!inviteCode?.trim()) return res.status(400).json({ error: 'Code d\'invitation requis' });
    if (!teamName?.trim()) return res.status(400).json({ error: 'Nom d\'équipe requis' });

    const league = db.prepare('SELECT * FROM leagues WHERE invite_code = ?').get(inviteCode.trim().toUpperCase()) as any;
    if (!league) return res.status(404).json({ error: 'Code invalide' });

    if (league.draft_status !== 'pending') {
      return res.status(400).json({ error: 'La draft a déjà commencé' });
    }

    const memberCount = (db.prepare(
      'SELECT COUNT(*) as c FROM league_members WHERE league_id = ?'
    ).get(league.id) as any).c;

    if (memberCount >= league.max_teams) {
      return res.status(400).json({ error: 'Ligue complète' });
    }

    const existing = db.prepare(
      'SELECT id FROM league_members WHERE league_id = ? AND user_id = ?'
    ).get(league.id, req.userId);

    if (existing) return res.status(409).json({ error: 'Vous êtes déjà dans cette ligue' });

    db.prepare(
      'INSERT INTO league_members (league_id, user_id, team_name) VALUES (?, ?, ?)'
    ).run(league.id, req.userId, teamName.trim());

    return res.json({ leagueId: league.id, name: league.name });
  });

  router.get('/:id', (req: AuthRequest, res) => {
    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(req.params.id) as any;
    if (!league) return res.status(404).json({ error: 'Ligue introuvable' });

    const member = db.prepare(
      'SELECT id FROM league_members WHERE league_id = ? AND user_id = ?'
    ).get(league.id, req.userId);
    if (!member) return res.status(403).json({ error: 'Accès refusé' });

    const members = db.prepare(`
      SELECT lm.*, u.username, u.avatar_color,
        (SELECT COUNT(*) FROM team_players WHERE league_id = lm.league_id AND user_id = lm.user_id) as player_count,
        (
          SELECT COALESCE(SUM(pp.fantasy_score), 0)
          FROM team_players tp
          JOIN player_performances pp ON pp.player_id = tp.player_id
          JOIN matches m ON m.id = pp.match_id
          WHERE tp.league_id = lm.league_id AND tp.user_id = lm.user_id AND m.status = 'finished'
        ) as total_score
      FROM league_members lm
      JOIN users u ON u.id = lm.user_id
      WHERE lm.league_id = ?
      ORDER BY total_score DESC
    `).all(league.id);

    const draftPicks = db.prepare(`
      SELECT dp.*, u.username, p.name as player_name, p.position, p.team
      FROM draft_picks dp
      JOIN users u ON u.id = dp.user_id
      JOIN players p ON p.id = dp.player_id
      WHERE dp.league_id = ?
      ORDER BY dp.pick_number ASC
    `).all(league.id);

    return res.json({ ...league, members, draftPicks });
  });

  router.post('/:id/start-draft', (req: AuthRequest, res) => {
    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(req.params.id) as any;
    if (!league) return res.status(404).json({ error: 'Ligue introuvable' });
    if (league.commissioner_id !== req.userId) {
      return res.status(403).json({ error: 'Seul le commissaire peut démarrer la draft' });
    }
    if (league.draft_status !== 'pending') {
      return res.status(400).json({ error: 'Draft déjà démarrée ou terminée' });
    }

    const members = db.prepare(
      'SELECT user_id FROM league_members WHERE league_id = ? ORDER BY created_at ASC'
    ).all(league.id) as { user_id: number }[];

    if (members.length < 2) {
      return res.status(400).json({ error: 'Au moins 2 équipes nécessaires' });
    }

    // Assign random draft order
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const updatePosition = db.prepare(
      'UPDATE league_members SET draft_position = ? WHERE league_id = ? AND user_id = ?'
    );
    const assignPositions = db.transaction(() => {
      shuffled.forEach((m, i) => updatePosition.run(i + 1, league.id, m.user_id));
    });
    assignPositions();

    db.prepare("UPDATE leagues SET draft_status = 'in_progress', current_draft_pick = 1 WHERE id = ?").run(league.id);

    return res.json({ ok: true });
  });

  router.patch('/:id/team-name', (req: AuthRequest, res) => {
    const { teamName } = req.body;
    if (!teamName?.trim()) return res.status(400).json({ error: 'Nom requis' });
    db.prepare(
      'UPDATE league_members SET team_name = ? WHERE league_id = ? AND user_id = ?'
    ).run(teamName.trim(), req.params.id, req.userId);
    return res.json({ ok: true });
  });

  return router;
}

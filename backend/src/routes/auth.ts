import { Router } from 'express';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { signToken } from '../middleware/auth';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const COLORS = ['#F59E0B', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

export default function authRouter(db: Database.Database): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: "Pseudo trop court (min 3 caractères)" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Mot de passe trop court (min 6 caractères)" });
    }

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const result = db.prepare(
        'INSERT INTO users (username, email, password_hash, avatar_color) VALUES (?, ?, ?, ?)'
      ).run(username.trim(), email.trim().toLowerCase(), passwordHash, color);

      const userId = result.lastInsertRowid as number;
      const token = signToken(userId, username.trim());
      return res.json({ token, user: { id: userId, username: username.trim(), email, avatarColor: color } });
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Pseudo ou email déjà utilisé' });
      }
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  });

  router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as any;
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token = signToken(user.id, user.username);
    return res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, avatarColor: user.avatar_color }
    });
  });

  router.get('/me', authMiddleware, (req: AuthRequest, res) => {
    const user = db.prepare('SELECT id, username, email, avatar_color FROM users WHERE id = ?').get(req.userId) as any;
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    return res.json({ id: user.id, username: user.username, email: user.email, avatarColor: user.avatar_color });
  });

  return router;
}

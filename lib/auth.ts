import { createHmac, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const SECRET = process.env.JWT_SECRET!;

export function signToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, SECRET, { expiresIn: '365d' });
}

export function verifyToken(token: string): { userId: string; username: string } | null {
  try {
    return jwt.verify(token, SECRET) as { userId: string; username: string };
  } catch {
    return null;
  }
}

export function getAuth(req: NextRequest): { userId: string; username: string } | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return verifyToken(header.slice(7));
}

// ─── Lien personnel de connexion ────────────────────────────────
// Format : <userId>.<version>.<signature>. Rien n'est stocké : on peut le réafficher à tout moment,
// et incrémenter users.login_version annule le lien précédent.

function signLogin(userId: string, version: number): string {
  return createHmac('sha256', SECRET).update(`login-link:${userId}:${version}`).digest('base64url');
}

export function buildLoginToken(userId: string, version: number): string {
  return `${userId}.${version}.${signLogin(userId, version)}`;
}

/** Vérifie la signature. Il reste à comparer `version` à users.login_version. */
export function parseLoginToken(token: unknown): { userId: string; version: number } | null {
  if (typeof token !== 'string') return null;
  const m = token.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{1,9})\.([\w-]+)$/i);
  if (!m) return null;
  const version = parseInt(m[2], 10);
  const expected = Buffer.from(signLogin(m[1], version));
  const received = Buffer.from(m[3]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return { userId: m[1], version };
}

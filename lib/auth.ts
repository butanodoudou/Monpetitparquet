import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const SECRET = process.env.JWT_SECRET!;

export function signToken(userId: string, username: string): string {
  return jwt.sign({ userId, username }, SECRET, { expiresIn: '30d' });
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

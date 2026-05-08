'use client';
import { create } from 'zustand';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  avatarColor: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

function loadFromStorage<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}

const _token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
const _user = loadFromStorage<AuthUser>('user');
// Session incomplète (token sans user) → on purge pour forcer un nouveau login
if (_token && !_user && typeof window !== 'undefined') localStorage.removeItem('token');

export const useAuthStore = create<AuthState>(set => ({
  token: (_token && _user) ? _token : null,
  user: _user,
  setAuth: (token, user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }
    set({ token, user });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    set({ token: null, user: null });
  },
}));

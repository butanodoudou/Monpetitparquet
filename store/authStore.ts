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

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  setAuth: (token, user) => {
    if (typeof window !== 'undefined') localStorage.setItem('token', token);
    set({ token, user });
  },
  logout: () => {
    if (typeof window !== 'undefined') localStorage.removeItem('token');
    set({ token: null, user: null });
  },
}));

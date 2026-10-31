import { useAuthStore } from '@/store/authStore';

/** Erreur API avec le statut HTTP associé. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * fetch authentifié (côté navigateur uniquement).
 * - ajoute le token du store ;
 * - 401 : déconnexion + redirection vers /auth ;
 * - autre réponse non OK : lève une ApiError avec le message du serveur ;
 * - retourne le JSON (null si le corps est vide ou illisible).
 */
export async function apiFetch<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const { token, logout } = useAuthStore.getState();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    throw new ApiError('Erreur réseau, réessaie dans un instant', 0);
  }

  let data: any = null;
  try { data = await res.json(); } catch { /* corps vide ou non JSON */ }

  if (res.status === 401) {
    logout();
    if (typeof window !== 'undefined') window.location.replace('/auth');
    throw new ApiError('Session expirée', 401);
  }
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Erreur serveur (${res.status})`, res.status);
  }
  return data as T;
}

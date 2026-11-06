'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { Collection } from '@/lib/card-view';

/** Charge la collection du compte (cartes, pièces, paquets fermés). */
export function useCollection() {
  const token = useAuthStore(s => s.token);
  const [data, setData] = useState<Collection | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<Collection>('/api/collection');
      setData({ coins: res?.coins ?? 0, cards: res?.cards ?? [], packs: res?.packs ?? [] });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : 'Impossible de charger tes cartes');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { reload(); }, [reload]);

  return { data, error, loading, reload };
}

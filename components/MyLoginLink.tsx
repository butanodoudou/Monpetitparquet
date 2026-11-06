'use client';
import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { loginUrl } from '@/lib/login-link';
import LoginLinkBox from '@/components/LoginLinkBox';

/** Réaffiche le lien personnel, pour se reconnecter sur un autre appareil. */
export default function MyLoginLink() {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const show = async () => {
    setLoading(true);
    setError('');
    try {
      const { loginToken } = await apiFetch<{ loginToken: string }>('/api/auth/my-link');
      setLink(loginUrl(loginToken));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div>
        <div className="font-semibold text-ink text-sm">Mon lien personnel</div>
        <p className="text-xs text-ink2 mt-1">Il te reconnecte sur un autre appareil. Ne le partage pas : il donne accès à ton compte.</p>
      </div>
      {link
        ? <LoginLinkBox link={link} shareText="Mon lien Mon Petit Parquet, à garder pour moi" />
        : <button type="button" onClick={show} disabled={loading} className="btn-secondary">{loading ? '…' : 'Afficher mon lien'}</button>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

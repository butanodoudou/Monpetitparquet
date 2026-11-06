'use client';
import { useState } from 'react';

/** Affiche un lien personnel avec copie, et partage natif si le téléphone le permet. */
export default function LoginLinkBox({ link, shareText }: { link: string; shareText: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: 'Mon Petit Parquet', text: shareText, url: link });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) await copy();
    }
  };

  return (
    <div className="space-y-2">
      <input className="input-field text-xs" readOnly value={link} aria-label="Lien personnel" onFocus={e => e.target.select()} />
      {failed && <p className="text-xs text-red-700">Copie impossible : sélectionne le lien à la main.</p>}
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="btn-secondary">{copied ? 'Copié ✓' : 'Copier'}</button>
        {canShare && <button type="button" onClick={share} className="btn-secondary">Partager</button>}
      </div>
    </div>
  );
}

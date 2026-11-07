'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PACK_PRICE } from '@/lib/cards';
import { apiFetch } from '@/lib/api-client';
import type { PackView } from '@/lib/card-view';
import { coinsLabel } from './shared';

export interface BuyPackCardProps {
  /** Solde actuel (Collection.coins de GET /api/collection). */
  coins: number;
  /** Appelé après l'achat avec le nouveau solde et le paquet fermé : mets à jour le solde et la liste des paquets. */
  onBought: (result: { coins: number; pack: PackView }) => void;
  className?: string;
}

/** Achat d'un paquet standard. Le paquet acheté s'ouvre dans la page Paquets. */
export default function BuyPackCard({ coins, onBought, className = '' }: BuyPackCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bought, setBought] = useState(false);
  const missing = Math.max(0, PACK_PRICE - coins);

  const buy = async () => {
    if (busy || missing > 0) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ coins: number; pack: PackView }>('/api/packs/buy', { method: 'POST' });
      setBought(true);
      onBought(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Acheter un paquet</h2>
          <p className="mt-0.5 text-sm text-ink2 leading-snug">5 cartes tirées au hasard, comme un paquet Standard.</p>
        </div>
        <p className="shrink-0 text-right leading-tight">
          <span className="block font-display text-xl font-semibold tabular-nums">{PACK_PRICE}</span>
          <span className="block text-xs text-muted">pièces</span>
        </p>
      </div>
      <button type="button" onClick={buy} disabled={busy || missing > 0}
        className="mt-3 w-full h-12 rounded-xl bg-ink text-on-accent font-bold active:scale-[.98] transition disabled:opacity-40">
        {busy ? 'Achat en cours…' : missing > 0 ? `Il te manque ${coinsLabel(missing)}` : `Acheter pour ${coinsLabel(PACK_PRICE)}`}
      </button>
      <p className="mt-2 text-xs text-muted">Tu as {coinsLabel(coins)}.</p>
      {error && <p className="mt-2 text-sm text-siren" role="alert">{error}</p>}
      {bought && !error && (
        <p className="mt-2 text-sm text-ink2" role="status">
          Paquet acheté. <Link href="/packs" className="font-semibold text-brand underline">Ouvre-le dans Paquets</Link>.
        </p>
      )}
    </section>
  );
}

'use client';
import { useMemo, useState } from 'react';
import { RARITY_CONFIG } from '@/lib/cards';
import { upgradePlan } from '@/lib/economy';
import { apiFetch } from '@/lib/api-client';
import type { CardView } from '@/lib/card-view';
import { CardPickRow, RarityPill, Sheet, rarityEffect } from './shared';

export interface UpgradeSheetProps {
  /** Carte à améliorer (elle disparaît de la collection : une nouvelle carte, plus rare, la remplace). */
  card: CardView;
  /** Collection du joueur (CardView[] de GET /api/collection). Les candidats au sacrifice en sont tirés. */
  cards: CardView[];
  /** Cartes alignées dans une journée verrouillée, si l'écran les connaît. Le serveur refuse de toute façon. */
  lockedIds?: string[];
  onClose: () => void;
  /** Appelé après l'amélioration avec la nouvelle carte : recharge la collection ici. */
  onUpgraded: (card: CardView) => void;
}

/** Feuille d'amélioration : choisir les sacrifices, voir le résultat avant de confirmer. */
export default function UpgradeSheet({ card, cards, lockedIds = [], onClose, onUpgraded }: UpgradeSheetProps) {
  const plan = upgradePlan(card.rarity);
  const locked = useMemo(() => new Set(lockedIds), [lockedIds]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CardView | null>(null);

  const candidates = cards.filter(c => c.id !== card.id && c.rarity === card.rarity);
  const cost = plan?.cost ?? 0;
  const ready = plan !== null && selected.length === cost;

  const toggle = (id: string) =>
    setSelected(cur => {
      if (cur.indexOf(id) !== -1) return cur.filter(x => x !== id);
      return cur.length >= cost ? cur : cur.concat(id);
    });

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ card: CardView }>(`/api/cards/${card.id}/upgrade`, {
        method: 'POST', body: JSON.stringify({ sacrificeCardIds: selected }),
      });
      setResult(res.card);
      onUpgraded(res.card);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  };

  // ── Résultat ────────────────────────────────────────────────
  if (result) {
    return (
      <Sheet title="Carte améliorée" onClose={onClose}
        footer={<button type="button" onClick={onClose} className="w-full h-12 rounded-xl bg-ink text-on-accent font-bold">Terminé</button>}>
        <div className="rounded-2xl border border-brass/50 bg-brand-light p-4 text-center" role="status">
          <p className="font-display text-2xl font-semibold">{result.player.name}</p>
          <p className="mt-1 text-sm text-ink2">{result.player.team}</p>
          <p className="mt-3 flex items-center justify-center gap-2">
            <RarityPill rarity={card.rarity} /><span aria-hidden>→</span><RarityPill rarity={result.rarity} />
          </p>
          <p className="mt-3 text-sm text-ink2 leading-snug">{rarityEffect(result.rarity)}. Les duels déjà joués ne changent pas.</p>
        </div>
      </Sheet>
    );
  }

  // ── Carte déjà au maximum ───────────────────────────────────
  if (!plan) {
    return (
      <Sheet title="Améliorer une carte" onClose={onClose}
        footer={<button type="button" onClick={onClose} className="w-full h-12 rounded-xl bg-ink text-on-accent font-bold">Fermer</button>}>
        <p className="text-sm text-ink2 leading-snug">{card.player.name} est déjà Platine : c’est la rareté maximale.</p>
      </Sheet>
    );
  }

  return (
    <Sheet title="Améliorer une carte" onClose={onClose}
      footer={
        <div>
          {error && <p className="mb-2 text-sm text-siren" role="alert">{error}</p>}
          <button type="button" onClick={submit} disabled={!ready || busy}
            className="w-full h-12 rounded-xl bg-ink text-on-accent font-bold active:scale-[.98] transition disabled:opacity-40">
            {busy ? 'Amélioration…'
              : ready ? `Passer ${card.player.name} en ${RARITY_CONFIG[plan.to].label}`
              : `Choisis encore ${cost - selected.length} carte${cost - selected.length > 1 ? 's' : ''}`}
          </button>
        </div>
      }>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="font-display text-xl font-semibold">{card.player.name}</p>
        <p className="text-sm text-ink2">{card.player.team}</p>
        <p className="mt-3 flex items-center gap-2">
          <RarityPill rarity={card.rarity} /><span aria-hidden>→</span><RarityPill rarity={plan.to} />
        </p>
        <p className="mt-2 text-sm text-ink2 leading-snug">
          {rarityEffect(card.rarity)}, puis {rarityEffect(plan.to).toLowerCase()}.
        </p>
      </div>

      <p className="mt-4 text-sm text-ink2 leading-snug">
        Sacrifie {cost} cartes {RARITY_CONFIG[card.rarity].label}, de n’importe quels joueurs. Elles sont retirées
        de ta collection. {selected.length} sur {cost} choisies.
      </p>

      {candidates.length < cost ? (
        <p className="mt-4 rounded-xl border border-line bg-surface p-3 text-sm text-ink2" role="status">
          Il te manque des cartes {RARITY_CONFIG[card.rarity].label} : tu en as {candidates.length} en plus de celle-ci, il en faut {cost}.
        </p>
      ) : (
        <ul className="mt-3 rounded-2xl border border-line bg-surface divide-y divide-line overflow-hidden">
          {candidates.map(c => {
            const isChecked = selected.indexOf(c.id) !== -1;
            const isLocked = locked.has(c.id);
            return (
              <CardPickRow key={c.id} card={c} checked={isChecked}
                disabled={isLocked || (!isChecked && selected.length >= cost)}
                hint={isLocked ? 'verrouillée' : undefined}
                onToggle={() => toggle(c.id)} />
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

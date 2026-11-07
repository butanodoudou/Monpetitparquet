'use client';
import { useMemo, useState } from 'react';
import { RARITIES, RARITY_CONFIG, type Rarity } from '@/lib/cards';
import { needsSellConfirmation, sellTotal } from '@/lib/economy';
import { apiFetch } from '@/lib/api-client';
import type { CardView } from '@/lib/card-view';
import { CardPickRow, RarityPill, Sheet, coinsLabel } from './shared';

export interface SellSheetProps {
  /** Cartes de la collection du joueur (CardView[] de GET /api/collection). */
  cards: CardView[];
  /** Cartes cochées à l'ouverture, par exemple celle depuis laquelle on a ouvert la feuille. */
  initialSelectedIds?: string[];
  /** Cartes alignées dans une journée verrouillée, si l'écran les connaît. Le serveur refuse de toute façon. */
  lockedIds?: string[];
  onClose: () => void;
  /** Appelé après une vente réussie avec le nouveau solde : recharge la collection ici. */
  onSold: (coins: number) => void;
}

/** Feuille de vente : sélection, aperçu du gain, confirmation pour Gold et Platine. */
export default function SellSheet({ cards, initialSelectedIds = [], lockedIds = [], onClose, onSold }: SellSheetProps) {
  const locked = useMemo(() => new Set(lockedIds), [lockedIds]);
  const [selected, setSelected] = useState<string[]>(() => initialSelectedIds.filter(id => !locked.has(id)));
  const [filter, setFilter] = useState<Rarity | 'all'>('all');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const chosen = selected.map(id => byId.get(id)).filter((c): c is CardView => !!c);
  const gain = sellTotal(chosen.map(c => c.rarity));
  const precious = chosen.filter(c => needsSellConfirmation(c.rarity));
  const visible = cards.filter(c => filter === 'all' || c.rarity === filter);

  const toggle = (id: string) => {
    setConfirming(false);
    setSelected(cur => (cur.indexOf(id) === -1 ? cur.concat(id) : cur.filter(x => x !== id)));
  };

  const submit = async () => {
    if (chosen.length === 0 || busy) return;
    if (precious.length > 0 && !confirming) { setConfirming(true); return; }
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ coins: number }>('/api/cards/sell', {
        method: 'POST', body: JSON.stringify({ cardIds: chosen.map(c => c.id) }),
      });
      onSold(res.coins);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Vendre des cartes" onClose={onClose}
      footer={
        <div>
          {error && <p className="mb-2 text-sm text-siren" role="alert">{error}</p>}
          {confirming && (
            <div className="mb-3 rounded-xl border border-brass/50 bg-brand-light p-3 text-sm leading-snug" role="alertdialog" aria-label="Confirmer la vente">
              <p className="font-semibold">Tu vends {precious.length === 1 ? 'une carte' : `${precious.length} cartes`} de valeur</p>
              <ul className="mt-1 text-ink2">
                {precious.map(c => <li key={c.id}>{c.player.name}, {RARITY_CONFIG[c.rarity].label}</li>)}
              </ul>
              <p className="mt-1 text-ink2">La vente est définitive.</p>
            </div>
          )}
          <button type="button" onClick={submit} disabled={chosen.length === 0 || busy}
            className="w-full h-12 rounded-xl bg-ink text-on-accent font-bold active:scale-[.98] transition disabled:opacity-40">
            {busy ? 'Vente en cours…'
              : chosen.length === 0 ? 'Choisis des cartes à vendre'
              : confirming ? `Confirmer la vente pour ${coinsLabel(gain)}`
              : `Vendre ${chosen.length} carte${chosen.length > 1 ? 's' : ''} pour ${coinsLabel(gain)}`}
          </button>
          {confirming && (
            <button type="button" onClick={() => setConfirming(false)} className="mt-2 w-full h-11 rounded-xl border border-line bg-surface font-semibold">
              Revenir à ma sélection
            </button>
          )}
        </div>
      }>
      <p className="text-sm text-ink2 leading-snug">
        Une carte jouée dans une journée en cours ne peut pas être vendue. Le gain dépend de la rareté :
        {' '}{RARITIES.map(r => `${RARITY_CONFIG[r].label} ${RARITY_CONFIG[r].sellValue}`).join(', ')}.
      </p>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrer par rareté">
        {(['all'].concat(RARITIES) as (Rarity | 'all')[]).map(r => (
          <button key={r} type="button" onClick={() => setFilter(r)} aria-pressed={filter === r}
            className={`shrink-0 h-9 px-3 rounded-full border text-sm font-semibold ${filter === r ? 'bg-ink text-on-accent border-ink' : 'bg-surface border-line text-ink2'}`}>
            {r === 'all' ? 'Toutes' : RARITY_CONFIG[r].label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">Aucune carte à afficher.</p>
      ) : (
        <ul className="mt-3 rounded-2xl border border-line bg-surface divide-y divide-line overflow-hidden">
          {visible.map(c => (
            <CardPickRow key={c.id} card={c} checked={selected.indexOf(c.id) !== -1}
              disabled={locked.has(c.id)} hint={locked.has(c.id) ? 'verrouillée' : undefined}
              onToggle={() => toggle(c.id)} />
          ))}
        </ul>
      )}
      {chosen.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink2">
          Sélection :
          {RARITIES.filter(r => chosen.some(c => c.rarity === r)).map(r => (
            <span key={r} className="inline-flex items-center gap-1">
              {chosen.filter(c => c.rarity === r).length} <RarityPill rarity={r} />
            </span>
          ))}
        </p>
      )}
    </Sheet>
  );
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import Icon from '@/components/Icon';
import GameCard from '@/components/cards/GameCard';
import PackSealed from '@/components/cards/PackSealed';
import { useCollection } from '@/components/cards/useCollection';
import SellSheet from '@/components/economy/SellSheet';
import UpgradeSheet from '@/components/economy/UpgradeSheet';
import BuyPackCard from '@/components/economy/BuyPackCard';
import { GROUP_PLURAL, positionName, rarityText } from '@/components/cards/labels';
import { RARITIES, RARITY_CONFIG, type Rarity } from '@/lib/cards';
import type { CardView } from '@/lib/card-view';
import type { PositionGroup } from '@/lib/fantasy';
import { formatPoints } from '@/lib/format';

type GroupFilter = PositionGroup | 'tous';
type RarityFilter = Rarity | 'toutes';
type Sort = 'moyenne' | 'rarete' | 'recentes' | 'nom';

const GROUPS: { value: GroupFilter; label: string }[] = [
  { value: 'tous', label: 'Tous les postes' },
  { value: 'arriere', label: GROUP_PLURAL.arriere },
  { value: 'sf', label: GROUP_PLURAL.sf },
  { value: 'grand', label: GROUP_PLURAL.grand },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: 'moyenne', label: 'Meilleure moyenne' },
  { value: 'rarete', label: 'Plus rare d’abord' },
  { value: 'recentes', label: 'Plus récentes' },
  { value: 'nom', label: 'Nom, de A à Z' },
];

const sorters: Record<Sort, (a: CardView, b: CardView) => number> = {
  moyenne: (a, b) => b.player.season_avg_fantasy - a.player.season_avg_fantasy,
  rarete: (a, b) => RARITY_CONFIG[b.rarity].level - RARITY_CONFIG[a.rarity].level || b.player.season_avg_fantasy - a.player.season_avg_fantasy,
  recentes: (a, b) => b.obtained_at.localeCompare(a.obtained_at),
  nom: (a, b) => a.player.name.localeCompare(b.player.name, 'fr'),
};

const chip = (on: boolean) =>
  `shrink-0 min-h-[44px] px-4 rounded-full border text-sm font-semibold transition-colors ${on ? 'bg-ink text-on-accent border-ink' : 'bg-surface text-ink border-line-strong'}`;

export default function CollectionPage() {
  const { token } = useAuthStore();
  const router = useRouter();
  const { data, error, loading, reload } = useCollection();
  const [group, setGroup] = useState<GroupFilter>('tous');
  const [rarity, setRarity] = useState<RarityFilter>('toutes');
  const [sort, setSort] = useState<Sort>('moyenne');
  const [open, setOpen] = useState<CardView | null>(null);
  const [selling, setSelling] = useState(false);

  useEffect(() => { if (!token) router.replace('/auth'); }, [token, router]);

  // Nombre d'exemplaires de chaque joueur : un doublon se voit sur la carte
  const copies = useMemo(() => {
    const m: Record<number, number> = {};
    (data?.cards ?? []).forEach(c => { m[c.player.id] = (m[c.player.id] ?? 0) + 1; });
    return m;
  }, [data]);

  const shown = useMemo(() => {
    const list = (data?.cards ?? []).filter(c =>
      (group === 'tous' || c.player.group === group) && (rarity === 'toutes' || c.rarity === rarity));
    return list.slice().sort(sorters[sort]);
  }, [data, group, rarity, sort]);

  if (!token) return null;

  const packs = data?.packs.length ?? 0;
  const total = data?.cards.length ?? 0;
  const nBy = (r: Rarity) => (data?.cards ?? []).filter(c => c.rarity === r).length;

  return (
    <div className="page">
      <TopBar title="Mes cartes" right={
        data && (
          <span className="inline-flex items-center gap-1.5 text-ink font-semibold" aria-label={`${data.coins} pièces`}>
            <span className="text-brand"><Icon name="coin" size={22} /></span>
            <span className="font-display text-lg font-bold" style={{ fontVariantNumeric: 'lining-nums tabular-nums' }}>
              {data.coins.toLocaleString('fr-FR')}
            </span>
          </span>
        )
      } />

      <div className="page-scroll">
        {data && (
          <div className="px-4 pt-4 space-y-3">
            <BuyPackCard coins={data.coins} onBought={() => reload()} />
            {data.cards.length > 0 && (
              <button type="button" className="btn-secondary" onClick={() => setSelling(true)}>Vendre des cartes</button>
            )}
          </div>
        )}
        {loading && !data && (
          <div className="px-4 pt-5 grid grid-cols-3 gap-3" role="status" aria-label="Chargement de tes cartes">
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="gc-skel" />)}
          </div>
        )}

        {error && !data && (
          <div className="px-4 pt-10 text-center" role="alert">
            <p className="font-display text-xl font-bold">Tes cartes ne se sont pas chargées</p>
            <p className="text-sm text-ink2 mt-1">{error}</p>
            <button className="btn-secondary max-w-xs mt-4" onClick={reload}>Réessayer</button>
          </div>
        )}

        {data && (
          <>
            {/* Paquets fermés */}
            <div className="px-4 pt-4">
              {packs > 0 ? (
                <Link href="/packs" className="flex items-center gap-4 rounded-2xl bg-surface border border-brass p-3 active:scale-[.985] transition-transform"
                  style={{ boxShadow: '0 8px 18px -14px rgba(20,27,38,.6)' }}>
                  <div className="w-[56px] shrink-0"><PackSealed /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-lg font-bold leading-tight">{packs} {packs > 1 ? 'paquets fermés' : 'paquet fermé'}</p>
                    <p className="text-sm text-ink2">{packs * 5} cartes à découvrir</p>
                  </div>
                  <span className="shrink-0 rounded-xl bg-ink text-on-accent text-sm font-semibold px-4 min-h-[44px] inline-flex items-center border border-brass">Ouvrir</span>
                </Link>
              ) : (
                <p className="text-sm text-ink2">Aucun paquet fermé. Le prochain arrive avec la loterie du lundi ou une victoire en duel.</p>
              )}
            </div>

            {total === 0 ? (
              <div className="mx-4 mt-6 rounded-2xl border border-dashed border-line-strong bg-surface p-6 text-center">
                <div className="mx-auto w-12 h-16 rounded-lg border-2 border-dashed border-line-strong" aria-hidden="true" />
                <p className="mt-3 font-display text-lg font-bold">Ta collection est vide</p>
                <p className="text-sm text-ink2 mt-1">Ouvre tes paquets pour recevoir tes premières cartes.</p>
              </div>
            ) : (
              <>
                <p className="px-4 mt-4 text-sm text-ink2">
                  {total} {total > 1 ? 'cartes' : 'carte'}
                  {RARITIES.slice().reverse().filter(r => nBy(r) > 0 && r !== 'bronze' && r !== 'silver')
                    .map(r => `, ${nBy(r)} ${RARITY_CONFIG[r].label}`).join('')}
                </p>

                {/* Filtres */}
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="Filtrer par poste">
                    {GROUPS.map(g => (
                      <button key={g.value} type="button" role="radio" aria-checked={group === g.value} className={chip(group === g.value)}
                        onClick={() => setGroup(g.value)}>{g.label}</button>
                    ))}
                  </div>
                  <div className="flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="Filtrer par rareté">
                    <button type="button" role="radio" aria-checked={rarity === 'toutes'} className={chip(rarity === 'toutes')} onClick={() => setRarity('toutes')}>Toutes les raretés</button>
                    {RARITIES.slice().reverse().map(r => (
                      <button key={r} type="button" role="radio" aria-checked={rarity === r} className={chip(rarity === r)} onClick={() => setRarity(r)}>
                        {RARITY_CONFIG[r].label}
                      </button>
                    ))}
                  </div>
                  <div className="px-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-muted" aria-live="polite">{shown.length} {shown.length > 1 ? 'cartes affichées' : 'carte affichée'}</p>
                    <label className="flex items-center gap-2 text-sm text-ink2">
                      Trier
                      <select value={sort} onChange={e => setSort(e.target.value as Sort)}
                        className="min-h-[44px] rounded-xl border border-line-strong bg-surface px-3 text-ink font-semibold text-sm">
                        {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </label>
                  </div>
                </div>

                {shown.length === 0 ? (
                  <div className="px-4 mt-8 text-center">
                    <p className="font-display text-lg font-bold">Aucune carte ne correspond</p>
                    <button className="btn-secondary max-w-xs mt-3" onClick={() => { setGroup('tous'); setRarity('toutes'); }}>Effacer les filtres</button>
                  </div>
                ) : (
                  <ul className="px-4 mt-4 pb-6 grid grid-cols-3 gap-x-3 gap-y-4 list-none items-start">
                    {shown.map(c => (
                      <li key={c.id}>
                        <button type="button" onClick={() => setOpen(c)} className="block w-full rounded-[12px] active:scale-[.97] transition-transform text-left"
                          aria-label={`${c.player.name}, ${rarityText(c.rarity)}, voir le détail`}>
                          <GameCard card={c} fluid />
                        </button>
                        {copies[c.player.id] > 1 && (
                          <p className="mt-1 text-center text-xs font-semibold text-brand">Doublon ×{copies[c.player.id]}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>

      {selling && data && <SellSheet cards={data.cards} onClose={() => setSelling(false)} onSold={() => { setSelling(false); reload(); }} />}
      {open && data && <CardDetail card={open} cards={data.cards} copies={copies[open.player.id] ?? 1} onClose={() => setOpen(null)}
        onChanged={() => { setOpen(null); reload(); }} />}
      <BottomNav />
    </div>
  );
}

/** Détail d'une carte en grand, avec la vente et l'amélioration. */
function CardDetail({ card, cards, copies, onClose, onChanged }: { card: CardView; cards: CardView[]; copies: number; onClose: () => void; onChanged: () => void }) {
  const [sheet, setSheet] = useState<'vendre' | 'ameliorer' | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`Carte de ${card.player.name}`}>
      <button type="button" className="absolute inset-0 bg-ink/40" onClick={onClose} aria-label="Fermer" tabIndex={-1} />
      <div className="relative w-full max-w-[480px] max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-paper border-t border-line px-4 pt-3 pb-6">
        <div className="flex justify-end">
          <button type="button" onClick={onClose} autoFocus aria-label="Fermer"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-ink2 rounded-full"><Icon name="close" /></button>
        </div>
        <div className="flex justify-center -mt-2"><GameCard card={card} size="reveal" tilt /></div>
        <dl className="mt-5 divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
          <div className="flex justify-between gap-4 p-3"><dt className="text-ink2">Poste</dt><dd className="font-semibold">{positionName(card.player.position)}</dd></div>
          <div className="flex justify-between gap-4 p-3"><dt className="text-ink2">Moyenne</dt><dd className="font-semibold">{formatPoints(card.player.season_avg_fantasy)} pts par match</dd></div>
          <div className="flex justify-between gap-4 p-3"><dt className="text-ink2">Effet de la rareté</dt><dd className="font-semibold">{rarityText(card.rarity)}</dd></div>
          {copies > 1 && <div className="flex justify-between gap-4 p-3"><dt className="text-ink2">Exemplaires</dt><dd className="font-semibold">{copies} de ce joueur</dd></div>}
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" className="btn-secondary" onClick={() => setSheet('vendre')}>Vendre</button>
          {card.rarity !== 'platine' && (
            <button type="button" className="btn-primary" onClick={() => setSheet('ameliorer')}>Améliorer</button>
          )}
        </div>
        {sheet === 'vendre' && <SellSheet cards={cards} initialSelectedIds={[card.id]} onClose={() => setSheet(null)} onSold={onChanged} />}
        {sheet === 'ameliorer' && <UpgradeSheet card={card} cards={cards} onClose={() => setSheet(null)} onUpgraded={onChanged} />}
      </div>
    </div>
  );
}

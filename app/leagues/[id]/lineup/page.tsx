'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { apiFetch, ApiError } from '@/lib/api-client';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import Icon from '@/components/Icon';
import GameCard, { EmptyCard } from '@/components/cards/GameCard';
import { GROUP_SINGULAR, estimate, percent, positionText, pts, rarityText, times } from '@/components/cards/labels';
import { LINEUP_SLOTS, cardMultiplier, positionMultiplier } from '@/lib/cards';
import type { CardView, LineupState } from '@/lib/card-view';
import { formatCountdown } from '@/lib/week-phase';

// Rangées du demi-terrain : arrières au large, ailier à l'aile, intérieurs sous le panier
const ROWS: number[][] = [[0, 1], [2], [3, 4]];
const EMPTY_SLOTS: (string | null)[] = LINEUP_SLOTS.map(() => null);

export default function LineupPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { token } = useAuthStore();
  const router = useRouter();

  const [state, setState] = useState<LineupState | null>(null);
  const [slots, setSlots] = useState<(string | null)[]>(EMPTY_SLOTS);
  const [saved, setSaved] = useState<string>('');
  const [picking, setPicking] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    apiFetch<LineupState>(`/api/leagues/${leagueId}/lineup`)
      .then(data => {
        setState(data);
        const ids = LINEUP_SLOTS.map((_, i) => data.starterCardIds?.[i] ?? null);
        setSlots(ids);
        setSaved(ids.join(','));
      })
      .catch(e => { if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : 'Erreur de chargement'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) { router.replace('/auth'); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, leagueId]);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const byId = useMemo(() => {
    const m: Record<string, CardView> = {};
    (state?.cards ?? []).forEach(c => { m[c.id] = c; });
    return m;
  }, [state]);

  const cardAt = (i: number): CardView | null => (slots[i] ? byId[slots[i]!] ?? null : null);
  const filled = slots.filter(s => s && byId[s]).length;
  const dirty = slots.join(',') !== saved;
  const locked = !!state?.isLocked;

  const total = LINEUP_SLOTS.reduce((sum, slot, i) => {
    const c = cardAt(i);
    return c ? sum + estimate(c.player.season_avg_fantasy, c.rarity, c.player.group, slot) : sum;
  }, 0);

  const place = (slotIndex: number, cardId: string | null) => {
    setSlots(prev => prev.map((s, i) => (i === slotIndex ? cardId : s)));
    setJustSaved(false);
    setError('');
    setPicking(null);
  };

  const save = async () => {
    if (filled !== LINEUP_SLOTS.length || saving || locked) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/leagues/${leagueId}/lineup`, { method: 'POST', body: JSON.stringify({ starterCardIds: slots }) });
      setSaved(slots.join(','));
      setJustSaved(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      if (e instanceof ApiError && e.status === 423) setState(s => (s ? { ...s, isLocked: true } : s));
      setError(e instanceof Error ? e.message : 'Ton cinq n’a pas pu être enregistré');
    }
    setSaving(false);
  };

  if (!token) return null;

  if (loading) return (
    <div className="page"><TopBar title="Mon cinq" back />
      <div className="flex-1 flex items-center justify-center" role="status" aria-label="Chargement"><div className="w-8 h-8 rounded-full border-2 border-line border-t-brass animate-spin" /></div>
    </div>
  );
  if (!state) return (
    <div className="page"><TopBar title="Mon cinq" back />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3" role="alert">
        <p className="font-display text-xl font-bold">Ton cinq ne s’est pas chargé</p>
        <p className="text-sm text-ink2">{error}</p>
        <button className="btn-secondary max-w-xs" onClick={load}>Réessayer</button>
      </div>
    </div>
  );

  const remainingMs = state.lockAt && now ? new Date(state.lockAt).getTime() - now : null;
  const urgent = remainingMs !== null && remainingMs > 0 && remainingMs < 3 * 3_600_000;

  return (
    <div className="page">
      <TopBar title="Mon cinq" back />
      <div className="page-scroll" style={{ paddingBottom: 168 }}>
        <div className="px-4 pt-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold leading-tight">Journée {state.currentWeek}</h2>
            <p className="text-sm text-ink2 mt-0.5">
              {filled === 5 ? <>Estimation : <b className="text-ink font-display text-base" style={{ fontVariantNumeric: 'lining-nums' }}>{pts(total)}</b></> : `${filled} carte${filled > 1 ? 's' : ''} sur 5`}
            </p>
          </div>
          {locked ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink2 bg-raised rounded-full px-3 min-h-[36px]">
              <Icon name="lock" size={18} /> Verrouillé
            </span>
          ) : remainingMs !== null && remainingMs > 0 ? (
            <span className={`text-sm font-semibold text-right ${urgent ? 'text-siren' : 'text-ink2'}`}>
              Verrouillage dans<br /><span className="font-display text-lg font-bold" style={{ fontVariantNumeric: 'lining-nums' }}>{formatCountdown(remainingMs)}</span>
            </span>
          ) : null}
        </div>

        {locked && (
          <p className="mx-4 mt-3 rounded-xl bg-raised px-4 py-3 text-sm text-ink2">
            Ton cinq est verrouillé : la journée a commencé
            {state.lockAt ? ` (${new Date(state.lockAt).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', 'h')})` : ''}.
          </p>
        )}
        {error && <p className="mx-4 mt-3 rounded-xl border border-[#E4B4B0] bg-[#FDF3F2] px-4 py-3 text-sm text-[#8C1D18]" role="alert">{error}</p>}

        {state.cards.length < 5 && (
          <p className="mx-4 mt-3 rounded-xl bg-brand-light px-4 py-3 text-sm text-ink">
            Il te faut au moins 5 cartes de joueurs différents pour aligner un cinq. Ouvre tes paquets dans l’onglet Cartes.
          </p>
        )}

        {/* Demi-terrain 2-1-2 */}
        <div className="px-4 mt-4">
          <div className="court px-3 pt-4 pb-5">
            <i className="c-mid" /><i className="c-three" /><i className="c-key" /><i className="c-ft" /><i className="c-rim" />
            <div className="relative flex flex-col gap-3">
              {ROWS.map((row, r) => (
                <div key={r} className="flex justify-around">
                  {row.map(i => (
                    <Slot key={i} index={i} card={cardAt(i)} locked={locked} onOpen={() => setPicking(i)} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Validation */}
      {!locked && (
        <div className="fixed left-1/2 -translate-x-1/2 w-full max-w-[480px] bottom-16 z-40 px-4 pb-2 pt-3 bg-paper/95 border-t border-line">
          <button type="button" className="btn-primary" onClick={save} disabled={filled !== 5 || saving || (!dirty && !justSaved)}>
            {saving ? 'Enregistrement…' : justSaved && !dirty ? 'Cinq enregistré' : 'Valider mon cinq'}
          </button>
          {filled !== 5 && <p className="text-center text-xs text-ink2 mt-1.5">Touche une place pour choisir une carte.</p>}
        </div>
      )}

      {picking !== null && (
        <PickSheet
          slotIndex={picking}
          cards={state.cards}
          slots={slots}
          onPick={id => place(picking, id)}
          onClear={() => place(picking, null)}
          onClose={() => setPicking(null)}
        />
      )}
      <BottomNav />
    </div>
  );
}

function Slot({ index, card, locked, onOpen }: { index: number; card: CardView | null; locked: boolean; onOpen: () => void }) {
  const slot = LINEUP_SLOTS[index];
  const natural = card?.player.group;
  const posMult = natural ? positionMultiplier(natural, slot) : 1;
  return (
    <div className="w-[30%]">
      <button type="button" onClick={onOpen} disabled={locked && !card}
        aria-label={card ? `${GROUP_SINGULAR[slot]} : ${card.player.name}. Changer` : `${GROUP_SINGULAR[slot]} : place vide. Choisir une carte`}
        className="block w-full rounded-[12px] active:scale-[.97] transition-transform disabled:cursor-default">
        {card ? <GameCard card={card} fluid /> : <EmptyCard label={GROUP_SINGULAR[slot]} />}
      </button>
      <p className="mt-1.5 text-center text-xs leading-tight">
        {card ? (
          <>
            <span className="block font-semibold text-ink">{GROUP_SINGULAR[slot]} · {times(cardMultiplier(card.rarity, card.player.group, slot))}</span>
            <span className={`block ${posMult < 1 ? 'text-ink' : 'text-ink2'}`}>{posMult < 1 ? `poste ${percent(posMult)}` : 'poste naturel'}</span>
          </>
        ) : <span className="block text-ink2">{GROUP_SINGULAR[slot]}</span>}
      </p>
    </div>
  );
}

function PickSheet({ slotIndex, cards, slots, onPick, onClear, onClose }: {
  slotIndex: number; cards: CardView[]; slots: (string | null)[];
  onPick: (id: string) => void; onClear: () => void; onClose: () => void;
}) {
  const slot = LINEUP_SLOTS[slotIndex];
  const current = slots[slotIndex];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Joueurs déjà alignés ailleurs : une même personne ne joue qu'une fois
  const takenBy: Record<number, number> = {};
  slots.forEach((id, i) => {
    const c = id ? cards.find(x => x.id === id) : null;
    if (c && i !== slotIndex) takenBy[c.player.id] = i;
  });

  const rows = cards
    .map(c => ({ c, est: estimate(c.player.season_avg_fantasy, c.rarity, c.player.group, slot), taken: takenBy[c.player.id] }))
    .sort((a, b) => (a.taken !== undefined ? 1 : 0) - (b.taken !== undefined ? 1 : 0) || b.est - a.est);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={`Choisir un ${GROUP_SINGULAR[slot].toLowerCase()}`}>
      <button type="button" className="absolute inset-0 bg-ink/40" onClick={onClose} aria-label="Fermer" tabIndex={-1} />
      <div className="relative w-full max-w-[480px] h-[86dvh] flex flex-col rounded-t-3xl bg-paper border-t border-line">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div>
            <h2 className="font-display text-xl font-bold leading-tight">Choisis ton {GROUP_SINGULAR[slot].toLowerCase()}</h2>
            <p className="text-sm text-ink2">Classées par points estimés pour cette place.</p>
          </div>
          <button type="button" onClick={onClose} autoFocus aria-label="Fermer"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-ink2"><Icon name="close" /></button>
        </div>

        <ul className="flex-1 overflow-y-auto px-4 pb-6 space-y-2 list-none">
          {rows.length === 0 && <li className="text-sm text-ink2 py-6 text-center">Tu n’as pas encore de carte. Ouvre tes paquets d’abord.</li>}
          {rows.map(({ c, est, taken }) => {
            const disabled = taken !== undefined;
            const on = c.id === current;
            const mult = cardMultiplier(c.rarity, c.player.group, slot);
            return (
              <li key={c.id}>
                <button type="button" disabled={disabled} onClick={() => onPick(c.id)} aria-pressed={on}
                  className={`w-full flex items-center gap-3 rounded-2xl border p-2.5 text-left min-h-[88px] transition-colors ${on ? 'border-brass bg-brand-light' : 'border-line bg-surface'} ${disabled ? 'opacity-55' : 'active:scale-[.99]'}`}>
                  <div className="w-[64px] shrink-0"><GameCard card={c} fluid /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink truncate">{c.player.name}</p>
                    <p className="text-sm text-ink mt-0.5">{positionText(c.player.position, c.player.group, slot)}</p>
                    <p className="text-xs text-ink2 mt-0.5">{rarityText(c.rarity)}</p>
                    {disabled && <p className="text-xs font-semibold text-ink2 mt-0.5">Déjà dans ton cinq</p>}
                    {on && <p className="text-xs font-semibold text-brand mt-0.5">Choisie pour cette place</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-xl font-bold leading-none" style={{ fontVariantNumeric: 'lining-nums' }}>{est.toFixed(1).replace('.', ',')}</p>
                    <p className="text-xs text-ink2 mt-1">pts estimés</p>
                    <p className="text-xs font-semibold text-ink mt-0.5">{times(mult)}</p>
                  </div>
                </button>
              </li>
            );
          })}
          {current && (
            <li>
              <button type="button" onClick={onClear} className="w-full min-h-[48px] rounded-xl border border-line-strong bg-surface text-sm font-semibold text-ink2">
                Laisser cette place vide
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

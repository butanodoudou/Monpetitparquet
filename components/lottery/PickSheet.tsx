'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { GROUP_LABELS, ROSTER_SLOTS, type AuctionTier } from '@/lib/fantasy';
import { groupOf, releaseRule, type RosterPlayer } from '@/lib/lottery';
import type { LotteryOpenedPack, LotteryPlayer, LotteryRosterPlayer, LotteryState } from '@/lib/lottery-types';
import PackArt, { PackNumber } from './PackArt';
import { NUM_STYLE, TIER_BORDER, TIER_REVEAL_RANK, fmt1, lastName, tierLabel, tierText } from './shared';
import { useRemainingMs } from './useLottery';

type Stage = 'closed' | 'opening' | 'reveal' | 'error';

// Matières de DESIGN.md : l'Élite en encre, la Star en or, le Basique en argent brossé.
const TIER_FACE: Record<AuctionTier, { bg: string; fg: string; sub: string }> = {
  elite: { bg: 'linear-gradient(160deg,#1C2142,#10131F 70%)', fg: '#F4F2FB', sub: '#C9C4E8' },
  star: { bg: 'linear-gradient(150deg,#FAF0CF 0%,#EDD28A 48%,#F6E6B0 100%)', fg: '#3B2906', sub: '#6B4A08' },
  basique: { bg: 'repeating-linear-gradient(90deg,rgba(255,255,255,.38) 0 1px,rgba(255,255,255,0) 1px 3px),linear-gradient(160deg,#E8ECF0,#CBD3DB)', fg: '#17202A', sub: '#465260' },
};
const initials = (n: string) => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

interface Props {
  leagueId: string;
  state: LotteryState;
  /** Pack choisi dans la grille (ignoré si un pack est déjà ouvert : reprise après rechargement). */
  packId: string | null;
  now: () => number;
  onClose: () => void;
  /** Appelé quand le pick est enregistré. */
  onConfirmed: (pick: number) => void;
}

/** Modale de pick : pack fermé, déchirure, cartes retournées une à une, choix + relâche. */
export default function PickSheet({ leagueId, state, packId, now, onClose, onConfirmed }: Props) {
  const reduce = useReducedMotion();
  const session = state.session!;
  const resumed = state.my_open_pack;
  const [stage, setStage] = useState<Stage>(resumed ? 'reveal' : 'closed');
  const [pack, setPack] = useState<LotteryOpenedPack | null>(resumed);
  const [revealed, setRevealed] = useState(resumed ? 99 : 0);
  const [ready, setReady] = useState(!!resumed);
  const [sel, setSel] = useState<number | null>(null);
  const [rel, setRel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remaining = useRemainingMs(session.pick_deadline, now);
  const secs = Math.ceil(remaining / 1000);

  const packNumber = pack?.pack_number ?? state.packs.find(p => p.id === packId)?.pack_number ?? 0;
  const cards = useMemo<LotteryPlayer[]>(
    () => (pack ? pack.players.slice().sort((a, b) =>
      TIER_REVEAL_RANK[a.tier] - TIER_REVEAL_RANK[b.tier] || a.season_avg_fantasy - b.season_avg_fantasy) : []),
    [pack],
  );
  const roster = useMemo<RosterPlayer[]>(
    () => state.my_roster.map(r => ({ player_id: r.id, position: r.position, season_avg_fantasy: r.season_avg_fantasy })),
    [state.my_roster],
  );

  // Séquence de retournement : une carte toutes les 450 ms, l'élite en dernier avec un temps d'arrêt.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const startReveal = (n: number) => {
    setStage('reveal');
    if (reduce) { setRevealed(n); setReady(true); return; }
    for (let i = 0; i < n; i++) {
      const at = 300 + i * (i === n - 1 ? 900 : 450);
      timers.current.push(setTimeout(() => setRevealed(i + 1), at));
    }
    timers.current.push(setTimeout(() => setReady(true), 300 + (n - 1) * 900 + 900));
  };

  // Cartes prenables à la reprise ou en fin de révélation : présélectionne la meilleure
  useEffect(() => {
    if (!ready || sel !== null || cards.length === 0) return;
    const best = cards
      .filter(c => releaseRule(roster, c.position).selectable)
      .sort((a, b) => b.season_avg_fantasy - a.season_avg_fantasy)[0];
    if (best) setSel(best.id);
  }, [ready, cards, roster, sel]);

  const openPack = async () => {
    if (!packId || stage !== 'closed') return;
    setStage('opening');
    setError('');
    try {
      const [res] = await Promise.all([
        apiFetch<{ pack: LotteryOpenedPack }>(`/api/lottery/${leagueId}/open`, {
          method: 'POST', body: JSON.stringify({ pack_id: packId }),
        }),
        new Promise(r => setTimeout(r, reduce ? 0 : 800)), // durée de la déchirure
      ]);
      setPack(res.pack);
      startReveal(res.pack.players.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue');
      setStage('error');
    }
  };

  const selCard = cards.find(c => c.id === sel) ?? null;
  const rule = selCard ? releaseRule(roster, selCard.position) : null;
  const relPlayer = state.my_roster.find(r => r.id === rel) ?? null;

  const pickCard = (c: LotteryPlayer) => {
    setSel(c.id);
    const r = releaseRule(roster, c.position);
    if (rel !== null && r.candidates.indexOf(rel) === -1) setRel(null);
  };

  const canConfirm = !!selCard && !!rule?.selectable && (!rule.releaseRequired || rel !== null) && !busy;
  const confirm = async () => {
    if (!canConfirm || !pack || !selCard) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/lottery/${leagueId}/pick`, {
        method: 'POST',
        body: JSON.stringify({ pack_id: pack.id, player_id: selCard.id, release_player_id: rule?.releaseRequired ? rel : null }),
      });
      onConfirmed(session.current_pick);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue');
      setStage('error');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Ouverture de ton pack"
      style={{ background: '#F2F4F7' }}>
      <div className="mx-auto max-w-[480px] min-h-full">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="text-sm">
            <span className="text-ink2">Pack {packNumber || '?'}</span>
            <span className="text-muted mx-1">/</span>
            <span className="font-semibold">pick {session.current_pick}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xl font-bold ${secs < 10 ? 'text-red-700 animate-pulse' : 'text-brand'}`} style={NUM_STYLE}>{secs} s</span>
            {stage === 'closed' && (
              <button type="button" onClick={onClose} aria-label="Fermer"
                className="text-ink2 text-2xl leading-none px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">×</button>
            )}
          </div>
        </div>

        <div className="px-4 pb-10">
          {stage === 'closed' && (
            <div className="text-center pt-6">
              <p className="text-lg font-bold">Ton pack est prêt</p>
              <p className="text-sm text-ink2 mt-1">Touche-le pour l&apos;ouvrir. 5 joueurs dedans, tu en gardes un.</p>
              <motion.button type="button" onClick={openPack} aria-label="Ouvrir le pack"
                animate={reduce ? undefined : { rotate: [0, -1.5, 0, 1.5, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="mx-auto mt-8 block w-56 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
                <PackArt className="aspect-[3/4] grid place-items-center"><PackNumber n={packNumber} size={96} /></PackArt>
              </motion.button>
              <p className="mt-8 text-xs text-muted">1 Élite, 2 Star, 2 Basique</p>
            </div>
          )}

          {stage === 'opening' && (
            <div className="relative h-[560px] overflow-hidden grid place-items-center" aria-live="polite">
              <motion.div className="w-56"
                initial={{ scale: 1, rotate: 0, opacity: 1 }}
                animate={reduce ? { opacity: 0 } : { scale: [1, 1.06, 1.5], rotate: [0, -2, 3], opacity: [1, 1, 0] }}
                transition={{ duration: reduce ? 0.3 : 0.6, ease: 'easeIn' }}>
                <PackArt className="aspect-[3/4]" />
              </motion.div>
              {!reduce && (
                <motion.div className="absolute -inset-10 pointer-events-none"
                  style={{ background: 'radial-gradient(circle,#fff 0,#fcd34d 25%,transparent 65%)' }}
                  initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.7, times: [0, 0.25, 1] }} />
              )}
            </div>
          )}

          {stage === 'error' && (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 mt-4" role="alert">
              <p className="font-semibold text-red-700">Ce pick n&apos;a pas pu être enregistré</p>
              <p className="text-sm text-ink2 mt-1 leading-snug">{error}</p>
              <button type="button" onClick={onClose}
                className="mt-3 h-10 px-4 rounded-lg bg-surface text-ink text-sm font-semibold">Revenir aux packs</button>
            </div>
          )}

          {stage === 'reveal' && (
            <>
              <p className="text-sm text-ink2 mb-3" aria-live="polite">{ready ? 'Choisis le joueur que tu gardes.' : 'Découvre tes cartes.'}</p>
              <div className="grid grid-cols-6 gap-2">
                {cards.map((c, i) => (
                  <RevealCard key={c.id} player={c} index={i} up={i < revealed} reduce={!!reduce}
                    selected={ready && sel === c.id}
                    disabled={!ready || !releaseRule(roster, c.position).selectable}
                    onClick={() => pickCard(c)} />
                ))}
              </div>

              <AnimatePresence>
                {ready && selCard && rule && (
                  <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    {rule.releaseRequired && (
                      <ReleasePicker roster={state.my_roster} candidates={rule.candidates} value={rel} onChange={setRel}
                        incomingGroup={groupOf(selCard.position)} />
                    )}
                    {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
                    <button type="button" onClick={confirm} disabled={!canConfirm}
                      className={`mt-4 w-full h-12 rounded-xl font-bold transition ${canConfirm ? 'bg-brand text-on-accent active:scale-[.98]' : 'bg-surface text-muted'}`}>
                      {busy ? 'Enregistrement…'
                        : rule.releaseRequired && rel === null ? 'Choisis qui relâcher'
                        : rule.releaseRequired && relPlayer ? `Garder ${lastName(selCard.name)}, relâcher ${lastName(relPlayer.name)}`
                        : `Garder ${lastName(selCard.name)}`}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RevealCard({ player: c, index, up, selected, disabled, onClick, reduce }: {
  player: LotteryPlayer; index: number; up: boolean; selected: boolean; disabled: boolean; onClick: () => void; reduce: boolean;
}) {
  const big = index >= 3; // les deux dernières cartes (star, élite) sont plus grandes
  const color = TIER_BORDER[c.tier];
  const face = (
    <motion.button type="button" onClick={onClick} disabled={disabled}
      aria-label={`${c.name}, ${tierLabel(c.tier)}, ${c.position ?? 'poste inconnu'}, moyenne ${fmt1(c.season_avg_fantasy)}`}
      aria-pressed={selected}
      animate={{
        y: selected ? -3 : 0,
        boxShadow: up && c.tier === 'elite' && !reduce
          ? ['0 0 0 0 rgba(192,132,252,.9)', '0 0 38px 8px rgba(192,132,252,.7)', '0 0 18px 2px rgba(192,132,252,.45)']
          : '0 0 0 0 rgba(0,0,0,0)',
      }}
      transition={{ boxShadow: { duration: 1.6, delay: 0.3, times: [0, 0.4, 1] } }}
      className={`relative block w-full overflow-hidden rounded-xl text-left ${disabled && up ? 'opacity-40' : ''} ${selected ? 'outline outline-2 outline-offset-2 outline-amber-500' : ''} focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500`}
      style={{
        padding: big ? 12 : '8px 8px 9px', border: `1.5px solid ${color}`,
        background: TIER_FACE[c.tier].bg, color: TIER_FACE[c.tier].fg, backfaceVisibility: 'hidden',
      }}>
      {up && c.tier === 'elite' && !reduce && (
        <motion.span aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(115deg,transparent 35%,rgba(255,255,255,.28) 50%,transparent 65%)' }}
          initial={{ x: '-120%' }} animate={{ x: '120%' }} transition={{ duration: 1.1, delay: 0.5, ease: 'easeOut' }} />
      )}
      <span className="flex items-start justify-between">
        <span>
          <span className={`block font-extrabold leading-none ${big ? 'text-5xl' : 'text-3xl'}`} style={NUM_STYLE}>{fmt1(c.season_avg_fantasy)}</span>
          <span className="block text-[10px] mt-0.5" style={{ color: TIER_FACE[c.tier].sub }}>moy. fantasy</span>
        </span>
        <span className={`text-sm font-bold px-1.5 rounded bg-black/10`} style={NUM_STYLE}>{c.position ?? '-'}</span>
      </span>
      {c.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.photo_url} alt="" className={`block mx-auto my-2 rounded-full object-cover bg-paper/50 ${big ? 'w-16 h-16' : 'w-11 h-11'}`} />
      ) : (
        <span className={`mx-auto my-2 rounded-full bg-paper/50 grid place-items-center font-bold text-ink ${big ? 'w-16 h-16 text-2xl' : 'w-11 h-11 text-lg'}`} style={NUM_STYLE}>
          {initials(c.name)}
        </span>
      )}
      <span className={`block font-semibold leading-tight ${big ? 'text-[15px]' : 'text-[12px]'}`}>{c.name}</span>
      <span className="block text-[11px] truncate" style={{ color: TIER_FACE[c.tier].sub }}>{c.team}</span>
      <span className="block mt-1 text-[11px] font-semibold" style={{ color: TIER_FACE[c.tier].sub }}>{tierLabel(c.tier)}</span>
    </motion.button>
  );

  const span = { gridColumn: `span ${big ? 3 : 2}` };
  if (reduce) {
    // Pas de flip : fondu simple
    return (
      <motion.div style={span} initial={false} animate={{ opacity: up ? 1 : 0 }} transition={{ duration: 0.3 }}>
        {face}
      </motion.div>
    );
  }
  return (
    <div style={{ ...span, perspective: 700 }}>
      <motion.div style={{ transformStyle: 'preserve-3d', position: 'relative' }} initial={false}
        animate={{ rotateY: up ? 0 : 180 }} transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}>
        {face}
        <div aria-hidden className="absolute inset-0 rounded-xl grid place-items-center"
          style={{
            transform: 'rotateY(180deg)', backfaceVisibility: 'hidden', border: '1px solid #B07A1E',
            background: 'repeating-linear-gradient(135deg,#1B2433 0 6px,#141B26 6px 12px)',
          }}>
          <span className="text-muted text-3xl font-bold" style={NUM_STYLE}>MPP</span>
        </div>
      </motion.div>
    </div>
  );
}

function ReleasePicker({ roster, candidates, value, onChange, incomingGroup }: {
  roster: LotteryRosterPlayer[]; candidates: number[]; value: number | null; onChange: (id: number) => void;
  incomingGroup: ReturnType<typeof groupOf>;
}) {
  const order = ['arriere', 'sf', 'grand'];
  const sorted = roster.slice().sort((a, b) =>
    order.indexOf(groupOf(a.position) ?? 'z') - order.indexOf(groupOf(b.position) ?? 'z') || b.season_avg_fantasy - a.season_avg_fantasy);
  return (
    <>
      <h3 className="mt-5 text-sm font-semibold">Qui part pour faire de la place ?</h3>
      <p className="text-xs text-ink2 mb-2 leading-snug">
        {incomingGroup
          ? `Ton équipe garde ${ROSTER_SLOTS.arriere} arrières, ${ROSTER_SLOTS.sf} ailiers et ${ROSTER_SLOTS.grand} intérieurs. Relâche un joueur de ce poste (${GROUP_LABELS[incomingGroup].toLowerCase()}) : il redevient libre.`
          : 'Relâche un joueur : il redevient libre.'}
      </p>
      <ul className="rounded-xl border border-line divide-y divide-line bg-paper/70 overflow-hidden">
        {sorted.map(r => {
          const ok = candidates.indexOf(r.id) !== -1;
          const on = value === r.id;
          const g = groupOf(r.position);
          return (
            <li key={r.id}>
              <button type="button" disabled={!ok} onClick={() => onChange(r.id)} aria-pressed={on}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left ${on ? 'bg-red-500/15' : ''} ${ok ? '' : 'opacity-35'}`}>
                <span className="w-1.5 h-8 rounded-full bg-line-strong" aria-hidden />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{r.name}</span>
                  <span className="block text-xs text-ink2 truncate">{g ? GROUP_LABELS[g] : r.position ?? '-'} - {r.team}</span>
                </span>
                <span className="text-lg font-bold" style={NUM_STYLE}>{fmt1(r.season_avg_fantasy)}</span>
                <span className={`w-5 h-5 rounded-full border grid place-items-center text-[10px] text-white ${on ? 'bg-red-500 border-red-500' : 'border-line-strong'}`} aria-hidden>
                  {on ? '✓' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { apiFetch, ApiError } from '@/lib/api-client';
import { RARITIES, RARITY_CONFIG, CARDS_PER_PACK } from '@/lib/cards';
import type { CardView, PackView } from '@/lib/card-view';
import GameCard, { CardBack } from '@/components/cards/GameCard';
import PackSealed from '@/components/cards/PackSealed';
import { useCollection } from '@/components/cards/useCollection';
import { percent, positionName } from '@/components/cards/labels';

type Stage = 'sealed' | 'tearing' | 'reveal' | 'recap' | 'error';

const SOURCE_LABEL: Record<PackView['source'], string> = {
  starter: 'Paquet de bienvenue',
  lundi: 'Paquet du lundi',
  victoire: 'Paquet de victoire',
  mission: 'Paquet de mission',
  achat: 'Paquet acheté',
};

const SHORT_LABEL: Record<PackView['source'], string> = { starter: 'Bienvenue', lundi: 'Lundi', victoire: 'Victoire', mission: 'Mission', achat: 'Achat' };

/** Du moins rare au plus rare, à rareté égale la plus faible moyenne d'abord. */
const byRarity = (a: CardView, b: CardView) =>
  RARITY_CONFIG[a.rarity].level - RARITY_CONFIG[b.rarity].level || a.player.season_avg_fantasy - b.player.season_avg_fantasy;

/** Chemin interne uniquement : jamais d'URL externe. */
function safeNext(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export default function PacksPage() {
  const { token } = useAuthStore();
  const router = useRouter();
  const { data, error, loading, reload } = useCollection();

  const [queue, setQueue] = useState<PackView[] | null>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('sealed');
  const [cards, setCards] = useState<CardView[]>([]);
  const [cur, setCur] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [doublons, setDoublons] = useState<Record<string, boolean>>({});
  const [openError, setOpenError] = useState('');
  const known = useRef<Record<number, boolean>>({});

  useEffect(() => { if (!token) router.replace('/auth'); }, [token, router]);

  // La file des paquets est figée au chargement : les paquets ouverts ensuite ne la font pas bouger
  useEffect(() => {
    if (!data || queue) return;
    setQueue(data.packs);
    data.cards.forEach(c => { known.current[c.player.id] = true; });
  }, [data, queue]);

  const total = queue?.length ?? 0;
  const pack = queue ? queue[index] : undefined;
  const isLastPack = index >= total - 1;

  const open = async () => {
    if (!pack || (stage !== 'sealed' && stage !== 'error')) return;
    setStage('tearing');
    setOpenError('');
    try {
      const [res] = await Promise.all([
        apiFetch<{ cards: CardView[] }>(`/api/packs/${pack.id}/open`, { method: 'POST' }),
        new Promise(r => setTimeout(r, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 800)),
      ]);
      const sorted = (res?.cards ?? []).slice().sort(byRarity);
      const dup: Record<string, boolean> = {};
      sorted.forEach(c => {
        dup[c.id] = !!known.current[c.player.id];
        known.current[c.player.id] = true;
      });
      setDoublons(dup);
      setCards(sorted);
      setCur(0);
      setFlipped(false);
      setStage('reveal');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setOpenError(e instanceof Error ? e.message : 'Erreur inattendue');
      setStage('error');
    }
  };

  const advance = () => {
    if (stage !== 'reveal') return;
    if (!flipped) { setFlipped(true); return; }
    if (cur < cards.length - 1) { setCur(cur + 1); setFlipped(false); } else setStage('recap');
  };

  const nextPack = () => { setIndex(index + 1); setStage('sealed'); setCards([]); };
  const enterGame = () => router.replace(safeNext() ?? '/home');

  if (!token) return null;

  const card = cards[cur];
  const isLast = cur === cards.length - 1;
  const moment = !!card && isLast && RARITY_CONFIG[card.rarity].level >= 3;

  const header = (
    <div className="flex items-center justify-between px-4 h-14">
      <p className="text-sm text-ink2" aria-live="polite">
        {total > 0 && stage !== 'recap' ? `Paquet ${index + 1} sur ${total}` : ''}
      </p>
      {stage !== 'tearing' && (
        <Link href="/collection" className="min-h-[44px] px-2 inline-flex items-center text-sm font-semibold text-brand underline underline-offset-4">
          {stage === 'recap' && isLastPack ? 'Ma collection' : 'Plus tard'}
        </Link>
      )}
    </div>
  );

  // ── Chargement, erreur, vide ──
  if (loading && !queue) {
    return (
      <main className="page">
        {header}
        <div className="flex-1 flex items-center justify-center" role="status" aria-label="Chargement de tes paquets">
          <div className="w-[190px]"><div className="gc-skel" /></div>
        </div>
      </main>
    );
  }
  if (error && !queue) {
    return (
      <main className="page">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4" role="alert">
          <p className="font-display text-xl font-bold">Tes paquets ne se sont pas chargés</p>
          <p className="text-sm text-ink2">{error}</p>
          <button className="btn-secondary max-w-xs" onClick={reload}>Réessayer</button>
        </div>
      </main>
    );
  }
  if (!pack && stage !== 'recap') {
    return (
      <main className="page">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <div className="w-14 h-20 rounded-lg border-2 border-dashed border-line-strong" aria-hidden="true" />
          <h1 className="font-display text-2xl font-bold">Aucun paquet à ouvrir</h1>
          <p className="text-sm text-ink2 max-w-xs">Tu en gagnes un chaque lundi et à chaque victoire en duel.</p>
          <div className="w-full max-w-xs space-y-2 mt-3">
            <Link href={safeNext() ?? '/home'} className="btn-primary block leading-[1.6]">Continuer</Link>
            <Link href="/collection" className="btn-secondary block leading-[1.9]">Voir mes cartes</Link>
          </div>
        </div>
      </main>
    );
  }

  // ── Paquet fermé / déchirure / erreur ──
  if (stage === 'sealed' || stage === 'tearing' || stage === 'error') {
    return (
      <main className="page">
        {header}
        <div className="flex-1 flex flex-col items-center px-6 pb-8 text-center">
          <h1 className="font-display text-[28px] leading-tight font-bold mt-2">{pack ? SOURCE_LABEL[pack.source] : ''}</h1>
          <p className="text-sm text-ink2 mt-2 max-w-[300px]">
            {pack?.quality === 'or' ? `${CARDS_PER_PACK} cartes, avec de bien meilleures chances de Gold et de Platine.`
              : pack?.quality === 'argent' ? `${CARDS_PER_PACK} cartes, avec de meilleures chances de Gold.`
              : `${CARDS_PER_PACK} cartes dedans, toutes pour toi.`}
          </p>
          <div className="flex-1 flex items-center justify-center w-full py-6">
            <button type="button" onClick={open} disabled={stage === 'tearing'}
              aria-label="Déchirer le paquet" className="w-[min(62vw,236px)] rounded-[16px] disabled:cursor-default">
              <PackSealed idle={stage === 'sealed'} tearing={stage === 'tearing'} label={pack ? SHORT_LABEL[pack.source] : ''} />
            </button>
          </div>
          {stage === 'error' && (
            <div className="w-full max-w-sm rounded-2xl border border-[#E4B4B0] bg-[#FDF3F2] p-4 mb-4 text-left" role="alert">
              <p className="font-semibold text-[#8C1D18]">Le paquet ne s’est pas ouvert</p>
              <p className="text-sm text-[#5B1A17] mt-1">{openError} Tes cartes ne sont pas perdues : réessaie pour les voir.</p>
            </div>
          )}
          <button type="button" className="btn-primary max-w-sm" onClick={open} disabled={stage === 'tearing'}>
            {stage === 'tearing' ? 'Ouverture…' : stage === 'error' ? 'Réessayer' : 'Déchirer le paquet'}
          </button>
        </div>
      </main>
    );
  }

  // ── Récapitulatif ──
  if (stage === 'recap') {
    const best = cards.slice().reverse();
    const counts = RARITIES.slice().reverse()
      .map(r => ({ r, n: cards.filter(c => c.rarity === r).length })).filter(x => x.n > 0)
      .map(x => `${x.n} ${RARITY_CONFIG[x.r].label}`).join(', ');
    const nDup = cards.filter(c => doublons[c.id]).length;
    return (
      <main className="page">
        {header}
        <div className="flex-1 px-4 pb-8 flex flex-col">
          <h1 className="font-display text-[28px] leading-tight font-bold">Dans ta collection</h1>
          <p className="text-sm text-ink2 mt-1">
            {counts}{nDup > 0 ? `. ${nDup} ${nDup > 1 ? 'doublons' : 'doublon'}, utiles pour améliorer plus tard.` : '.'}
          </p>
          <ul className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-4 list-none">
            {best.map(c => (
              <li key={c.id} style={{ width: 'calc((100% - 24px) / 3)' }}>
                <GameCard card={c} fluid />
                {doublons[c.id] && <p className="mt-1 text-center text-xs font-semibold text-brand">Doublon</p>}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8 space-y-2">
            {!isLastPack ? (
              <>
                <button type="button" className="btn-primary" onClick={nextPack}>
                  Ouvrir le suivant ({total - index - 1} {total - index - 1 > 1 ? 'restants' : 'restant'})
                </button>
                <Link href="/collection" className="btn-secondary block leading-[1.9]">Voir mes cartes</Link>
              </>
            ) : (
              <>
                <button type="button" className="btn-primary" onClick={enterGame}>Entrer dans le jeu</button>
                <Link href="/collection" className="btn-secondary block leading-[1.9]">Voir toute ma collection</Link>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ── Révélation, une carte à la fois ──
  const cfg = RARITY_CONFIG[card.rarity];
  return (
    <main className="page overflow-x-hidden">
      {header}
      <div className="flex-1 flex flex-col px-4 pb-6">
        <p className="text-center text-sm text-ink2">Carte {cur + 1} sur {cards.length}</p>

        <div className="reveal-stage">
          <div className="flipwrap">
            <button type="button" key={card.id} onClick={advance}
              className="block w-full rounded-[16px] gc-flip-btn flip-enter"
              aria-label={flipped ? (isLast ? 'Voir le récapitulatif' : 'Carte suivante') : 'Retourner la carte'}>
              <div className={`flip ${flipped ? 'flipped' : ''}`}>
                <div className="back"><CardBack fluid /></div>
                <div className="face"><GameCard card={card} fluid tilt moment={moment && flipped} /></div>
              </div>
            </button>
            <div className={`halo ${moment && flipped && card.rarity === 'platine' ? 'on' : ''}`} />
          </div>
        </div>

        <div className="text-center min-h-[92px]" aria-live="polite">
          {!flipped ? (
            <p className="text-sm text-muted pt-2">Touche la carte pour la retourner</p>
          ) : (
            <div>
              {moment ? (
                <div className="announce on">
                  <p className="font-display text-2xl font-bold">{card.rarity === 'platine' ? 'Un Platine.' : 'Un Gold.'}</p>
                  <p className="text-sm text-ink2 mt-0.5">
                    {card.player.name}, {percent(cfg.multiplier)} sur ses points quand tu l’alignes.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-display text-lg font-bold">{card.player.name}</p>
                  <p className="text-sm text-ink2">{cfg.label} · {positionName(card.player.position)}{doublons[card.id] ? ' · doublon' : ''}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <ol className="flex justify-center gap-2 my-3 list-none" aria-label="Cartes du paquet">
          {cards.map((c, i) => (
            <li key={c.id} className="w-[54px]">
              {i < cur || (i === cur && flipped) ? <GameCard card={c} fluid /> : <CardBack fluid />}
            </li>
          ))}
        </ol>

        <div className="mt-auto pt-3 space-y-1">
          <button type="button" className="btn-primary" onClick={advance}>
            {!flipped ? 'Retourner la carte' : isLast ? 'Voir le récapitulatif' : 'Carte suivante'}
          </button>
          <button type="button" className="w-full min-h-[44px] text-sm font-semibold text-ink2 underline underline-offset-4"
            onClick={() => setStage('recap')}>
            Tout retourner d’un coup
          </button>
        </div>
      </div>
    </main>
  );
}

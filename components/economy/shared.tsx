'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { RARITY_CONFIG, type Rarity } from '@/lib/cards';
import type { CardView } from '@/lib/card-view';

/** 1 pièce, 2 pièces. */
export const coinsLabel = (n: number) => `${n} pièce${n > 1 ? 's' : ''}`;

/** Matière de chaque rareté : un fond doux, une bordure, et un nom écrit (jamais la couleur seule). */
const RARITY_BOX: Record<Rarity, string> = {
  bronze: 'bg-[#F4EAE0] text-[#6B4A2E] border-[#B58A66]',
  silver: 'bg-raised text-ink2 border-line-strong',
  gold: 'bg-brand-light text-brand border-brass',
  platine: 'bg-ink text-on-accent border-ame',
};
const RARITY_GAUGE: Record<Rarity, number> = { bronze: 1, silver: 2, gold: 3, platine: 4 };

export function RarityPill({ rarity, className = '' }: { rarity: Rarity; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${RARITY_BOX[rarity]} ${className}`}>
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: RARITY_GAUGE[rarity] }, (_, i) => <i key={i} className="block w-1.5 h-1.5 rotate-45 bg-current" />)}
      </span>
      {RARITY_CONFIG[rarity].label}
    </span>
  );
}

/** Effet d'une rareté sur les points, en pourcentage lisible : -10 %, aucun effet, +10 %. */
export function rarityEffect(rarity: Rarity): string {
  const pct = Math.round((RARITY_CONFIG[rarity].multiplier - 1) * 100);
  return pct === 0 ? 'Aucun effet sur les points' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)} % sur les points`;
}

/** Ligne de carte sélectionnable : joueur, équipe, moyenne, rareté. */
export function CardPickRow({
  card, checked, disabled, hint, onToggle,
}: { card: CardView; checked: boolean; disabled?: boolean; hint?: string; onToggle: () => void }) {
  return (
    <li>
      <label className={`flex items-center gap-3 px-3 py-2.5 ${disabled ? 'opacity-50' : 'cursor-pointer active:bg-raised'} ${checked ? 'bg-brand-light/60' : ''}`}>
        <input type="checkbox" className="w-5 h-5 accent-[#141B26] shrink-0" checked={checked} disabled={disabled} onChange={onToggle} />
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block font-medium truncate">{card.player.name}</span>
          <span className="block text-xs text-ink2 truncate">
            {card.player.team} · moyenne {card.player.season_avg_fantasy.toFixed(1).replace('.', ',')}
            {hint ? ` · ${hint}` : ''}
          </span>
        </span>
        <RarityPill rarity={card.rarity} />
      </label>
    </li>
  );
}

/** Feuille qui monte du bas de l'écran. Se ferme avec Échap ou en touchant le fond. */
export function Sheet({
  title, onClose, children, footer,
}: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md max-h-[88vh] flex flex-col rounded-t-3xl bg-paper outline-none shadow-xl">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer"
            className="w-10 h-10 grid place-items-center rounded-full text-ink2 active:bg-raised">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-3">{children}</div>
        {footer && <div className="px-4 pt-3 pb-5 border-t border-line bg-paper">{footer}</div>}
      </div>
    </div>
  );
}

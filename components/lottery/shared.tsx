'use client';
import type { CSSProperties } from 'react';
import { AUCTION_TIER_CONFIG, type AuctionTier } from '@/lib/fantasy';

/** Police des chiffres : Barlow Condensed, exposée par la page loterie via la variable --font-barlow. */
export const NUM_STYLE: CSSProperties = {
  fontFamily: 'var(--font-barlow), Inter, system-ui, sans-serif',
  fontVariantNumeric: 'tabular-nums',
};

/** 12,3 -> "12,3" (virgule française). */
export const fmt1 = (n: number) => n.toFixed(1).replace('.', ',');

/** Ordre de révélation d'un pack : basique, basique, star, star, élite (l'élite arrive en dernier). */
export const TIER_REVEAL_RANK: Record<AuctionTier, number> = { basique: 0, star: 1, elite: 2 };

export const tierLabel = (t: AuctionTier) => AUCTION_TIER_CONFIG[t].label;
export const tierText = (t: AuctionTier) => AUCTION_TIER_CONFIG[t].color;
/** Fond et bordure de carte par tier (classes de AUCTION_TIER_CONFIG). */
export const tierBox = (t: AuctionTier) => AUCTION_TIER_CONFIG[t].bg;

/** Couleur de halo selon le tier, pour les cartes révélées. */
export const TIER_BORDER: Record<AuctionTier, string> = {
  elite: '#c084fc',
  star: '#facc15',
  basique: '#94a3b8',
};

export function Avatar({ name, color, me, size = 32 }: { name: string; color?: string; me?: boolean; size?: number }) {
  return (
    <span
      className={`shrink-0 rounded-full grid place-items-center font-bold ${me ? 'bg-amber-500 text-slate-950' : 'text-slate-900'}`}
      style={{ width: size, height: size, fontSize: size * 0.4, ...(me ? {} : { backgroundColor: color ?? '#94a3b8' }) }}
      aria-hidden
    >
      {(name[0] ?? '?').toUpperCase()}
    </span>
  );
}

/** "il y a 2 min" à partir d'une date ISO. */
export function relTime(iso: string | null, nowMs: number): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} j`;
}

/** Nom court : dernier mot. */
export const lastName = (n: string) => n.trim().split(/\s+/).slice(-1)[0] ?? n;

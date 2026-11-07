'use client';
import { formatPoints } from '@/lib/format';
import type { CSSProperties } from 'react';
import type { PackQuality } from '@/lib/cards';

/** Police des chiffres : Barlow Condensed, exposée par la page loterie via la variable --font-barlow. */
export const NUM_STYLE: CSSProperties = {
  fontFamily: 'var(--font-barlow), Inter, system-ui, sans-serif',
  fontVariantNumeric: 'tabular-nums',
};

/** 12,3 -> "12,3" (virgule française). */
export const fmt1 = (n: number) => formatPoints(n).replace('.', ',');

export const QUALITY_LABEL: Record<PackQuality, string> = {
  or: 'Paquet Or',
  argent: 'Paquet Argent',
  standard: 'Paquet Standard',
};

/** Nombre de losanges de la jauge : la qualité se lit sans la couleur. */
const QUALITY_GAUGE: Record<PackQuality, number> = { standard: 1, argent: 2, or: 3 };

const QUALITY_BOX: Record<PackQuality, string> = {
  or: 'bg-brand-light text-brand border-brass/60',
  argent: 'bg-raised text-ink2 border-line-strong',
  standard: 'bg-surface text-muted border-line',
};

/** Pastille de qualité : nom écrit + jauge de losanges. */
export function QualityBadge({ quality, className = '' }: { quality: PackQuality; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${QUALITY_BOX[quality]} ${className}`}>
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: QUALITY_GAUGE[quality] }, (_, i) => (
          <i key={i} className="block w-1.5 h-1.5 rotate-45 bg-current" />
        ))}
      </span>
      {QUALITY_LABEL[quality]}
    </span>
  );
}

export function Avatar({ name, color, me, size = 32 }: { name: string; color?: string; me?: boolean; size?: number }) {
  return (
    <span
      className={`shrink-0 rounded-full grid place-items-center font-bold ${me ? 'bg-brand text-on-accent' : 'text-ink'}`}
      style={{ width: size, height: size, fontSize: size * 0.4, ...(me ? {} : { backgroundColor: color ?? '#94a3b8' }) }}
      aria-hidden
    >
      {(name[0] ?? '?').toUpperCase()}
    </span>
  );
}

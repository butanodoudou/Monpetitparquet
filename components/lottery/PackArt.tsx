'use client';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { NUM_STYLE } from './shared';

/** Pack fermé : dégradé métal, bande ambre et reflet qui balaie. */
export default function PackArt({ children, used, className = '' }: { children?: ReactNode; used?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${className}`}
      style={{
        background: 'linear-gradient(150deg,#2C3749 0%,#141B26 42%,#232D3E 58%,#10151F 100%)',
        borderColor: '#B07A1E', borderWidth: 1,
        opacity: used ? 0.55 : 1, filter: used ? 'saturate(.3)' : undefined,
      }}>
      <span className="absolute left-0 right-0 bg-brass" style={{ top: '18%', height: 6 }} aria-hidden />
      {!used && !reduce && (
        <motion.span aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(115deg,transparent 40%,rgba(255,255,255,.18) 50%,transparent 60%)' }}
          initial={{ x: '-120%' }} animate={{ x: ['-120%', '-120%', '120%'] }}
          transition={{ duration: 3.2, times: [0, 0.6, 1], repeat: Infinity, ease: 'easeInOut' }} />
      )}
      {children}
    </div>
  );
}

export function PackNumber({ n, size = 36 }: { n: number; size?: number }) {
  return <span className="relative font-display font-bold text-on-accent" style={{ fontSize: size }}>{n}</span>;
}

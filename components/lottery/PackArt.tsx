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
        background: 'linear-gradient(150deg,#475569 0%,#1e293b 38%,#334155 52%,#0f172a 100%)',
        borderColor: '#64748b', borderWidth: 1.5,
        opacity: used ? 0.55 : 1, filter: used ? 'saturate(.3)' : undefined,
      }}>
      <span className="absolute left-0 right-0 bg-amber-500/90" style={{ top: '18%', height: 14 }} aria-hidden />
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
  return <span className="relative font-extrabold text-slate-100" style={{ ...NUM_STYLE, fontSize: size }}>{n}</span>;
}

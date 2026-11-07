'use client';
import { motion, useReducedMotion } from 'framer-motion';
import { LOTTERY_ORDER_STEP_MS } from '@/lib/lottery';
import type { LotteryMember, LotteryState } from '@/lib/lottery-types';
import { Avatar, NUM_STYLE, QualityBadge } from './shared';

interface Props {
  state: LotteryState;
  meId: string | undefined;
  /** true : les lignes glissent l'une après l'autre (révélation, 450 ms de décalage) avec leur qualité. */
  stagger: boolean;
}

/** Ordre tiré et qualité du paquet de chacun ; la ligne du manager connecté est mise en avant. */
export default function DrawOrderList({ state, meId, stagger }: Props) {
  const reduce = useReducedMotion();
  const byId: Record<string, LotteryMember> = {};
  for (const m of state.members) byId[m.user_id] = m;
  const order = state.order.slice().sort((a, b) => a.pick - b.pick);

  return (
    <ol className="rounded-2xl border border-line divide-y divide-line overflow-hidden bg-surface">
      {order.map((o, i) => {
        const m = byId[o.user_id];
        const me = o.user_id === meId;
        return (
          <motion.li key={o.user_id}
            initial={stagger ? (reduce ? { opacity: 0 } : { opacity: 0, x: -12 }) : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: stagger ? (i * LOTTERY_ORDER_STEP_MS) / 1000 : 0, ease: 'easeOut' }}
            className={`flex items-center gap-3 px-3 py-2.5 ${me ? 'bg-brand-light/60' : ''}`}>
            <span className={`w-6 text-xl font-bold ${me ? 'text-brand' : 'text-muted'}`} style={NUM_STYLE}>{o.pick}</span>
            <Avatar name={m?.username ?? '?'} color={m?.avatar_color} me={me} />
            <span className="flex-1 min-w-0 font-medium truncate">
              {m?.username ?? '?'}{me && <span className="text-xs text-brand"> (toi)</span>}
            </span>
            <QualityBadge quality={o.quality} />
          </motion.li>
        );
      })}
    </ol>
  );
}

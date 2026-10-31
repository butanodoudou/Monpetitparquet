'use client';
import { motion, useReducedMotion } from 'framer-motion';
import type { LotteryState } from '@/lib/lottery-types';
import PackArt, { PackNumber } from './PackArt';
import { tierText } from './shared';

interface Props {
  state: LotteryState;
  /** Le manager connecté peut choisir un pack fermé (son tour, pas encore de pack ouvert). */
  canPick: boolean;
  onPick: (packId: string) => void;
}

/** Grille des packs : fermés (cliquables à ton tour), en cours d'ouverture, pris. */
export default function PackGrid({ state, canPick, onPick }: Props) {
  const reduce = useReducedMotion();
  const nameById: Record<string, string> = {};
  for (const m of state.members) nameById[m.user_id] = m.username;

  return (
    <div className="grid grid-cols-3 gap-3">
      {state.packs.map(p => {
        if (p.taken_by) {
          return (
            <PackArt key={p.id} used className="aspect-[3/4] flex flex-col justify-end p-2">
              <div className="relative text-[11px] leading-tight">
                <div className="font-semibold text-slate-200 truncate">{nameById[p.taken_by] ?? '?'}</div>
                {p.chosen && <div className={`truncate ${tierText(p.chosen.tier)}`}>{p.chosen.name}</div>}
              </div>
            </PackArt>
          );
        }
        if (p.opened) {
          return (
            <PackArt key={p.id} className="aspect-[3/4] flex flex-col items-center justify-end pb-2 !border-amber-500/60">
              <span className="relative text-[11px] text-amber-300 font-semibold text-center leading-tight px-1">
                Ouvert par {p.opened_by ? nameById[p.opened_by] ?? '?' : '?'}
              </span>
            </PackArt>
          );
        }
        if (canPick) {
          return (
            <motion.button key={p.id} type="button" aria-label={`Ouvrir le pack ${p.pack_number}`}
              onClick={() => onPick(p.id)} whileTap={{ scale: 0.96 }}
              animate={reduce ? undefined : { boxShadow: ['0 0 0 0 rgba(245,158,11,.55)', '0 0 0 6px rgba(245,158,11,0)'] }}
              transition={{ duration: 1.6, repeat: Infinity }}
              className="rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
              <PackArt className="aspect-[3/4] flex items-end justify-center pb-3"><PackNumber n={p.pack_number} /></PackArt>
            </motion.button>
          );
        }
        return (
          <PackArt key={p.id} className="aspect-[3/4] flex items-end justify-center pb-3"><PackNumber n={p.pack_number} /></PackArt>
        );
      })}
    </div>
  );
}

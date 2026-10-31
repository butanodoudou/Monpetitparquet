'use client';
import type { LotteryState } from '@/lib/lottery-types';
import { Avatar, NUM_STYLE, tierText } from './shared';

/** Récap de la loterie terminée : un bloc par pick. */
export default function Recap({ state, meId }: { state: LotteryState; meId: string | undefined }) {
  const events = state.events.slice().sort((a, b) => a.pick - b.pick);
  const colorById: Record<string, string> = {};
  for (const m of state.members) colorById[m.user_id] = m.avatar_color;
  return (
    <ul className="space-y-3">
      {events.map(e => {
        const me = e.user_id === meId;
        return (
          <li key={e.pick}
            className={`rounded-xl border p-3 flex items-center gap-3 ${me ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
            <span className="w-5 text-lg font-bold text-slate-500" style={NUM_STYLE}>{e.pick}</span>
            <Avatar name={e.username} color={colorById[e.user_id]} me={me} />
            <div className="flex-1 min-w-0">
              <div className="text-sm">
                <span className="font-semibold">{e.username}</span> a pris{' '}
                <span className={`font-semibold ${e.chosen ? tierText(e.chosen.tier) : ''}`}>{e.chosen?.name ?? 'un joueur'}</span>
              </div>
              <div className="text-xs text-slate-400">
                {e.released ? `Relâché : ${e.released.name}` : 'Équipe incomplète, personne relâché'}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

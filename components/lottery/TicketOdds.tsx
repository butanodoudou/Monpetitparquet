'use client';
import type { LotteryMember } from '@/lib/lottery-types';
import { Avatar, NUM_STYLE, fmt1 } from './shared';

const rankLabel = (r: number) => (r === 1 ? '1er' : `${r}e`);

/** Tickets et chances de passer en premier, un bloc par manager (écran « programmée »). */
export default function TicketOdds({ members, meId }: { members: LotteryMember[]; meId: string | undefined }) {
  const maxOdds = Math.max(1, ...members.map(m => m.odds));
  return (
    <ul className="space-y-2">
      {members.map(m => {
        const me = m.user_id === meId;
        return (
          <li key={m.user_id}
            className={`rounded-xl border p-3 ${me ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 bg-slate-900/60'}`}>
            <div className="flex items-center gap-3">
              <Avatar name={m.username} color={m.avatar_color} me={me} />
              <div className="flex-1 min-w-0">
                <div className="font-medium leading-tight truncate">
                  {m.username}{me && <span className="text-xs text-amber-400"> (toi)</span>}
                </div>
                <div className="text-xs text-slate-500">{rankLabel(m.rank)} du classement de la semaine</div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold leading-none ${me ? 'text-amber-400' : ''}`} style={NUM_STYLE}>
                  {fmt1(m.odds)} %
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{m.tickets} ticket{m.tickets > 1 ? 's' : ''}</div>
              </div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden>
              <div className={`h-full rounded-full ${me ? 'bg-amber-500' : 'bg-slate-500'}`}
                style={{ width: `${(m.odds / maxOdds) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

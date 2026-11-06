'use client';
import GameCard from '@/components/cards/GameCard';
import { times } from '@/components/cards/labels';
import type { DuelStarter } from '@/lib/card-view';
import { formatPoints } from '@/lib/format';

const lastName = (name: string) => name.split(' ').slice(1).join(' ') || name;

function Side({ s, right }: { s: DuelStarter | undefined; right?: boolean }) {
  if (!s) return <div className="flex-1" />;
  const card = (
    <div className="w-[58px] shrink-0"><GameCard card={s.card} fluid /></div>
  );
  const text = (
    <div className={`min-w-0 flex-1 ${right ? 'text-right' : ''}`}>
      <p className="text-sm font-semibold text-ink truncate">{lastName(s.card.player.name)}</p>
      <p className="font-display text-lg font-bold leading-tight" style={{ fontVariantNumeric: 'lining-nums' }}>{formatPoints(s.points)}</p>
      <p className="text-xs text-ink2">{times(s.multiplier)}</p>
    </div>
  );
  return <div className="flex-1 min-w-0 flex items-center gap-2">{right ? <>{text}{card}</> : <>{card}{text}</>}</div>;
}

/** Les cinq titulaires des deux côtés d'un duel, place par place. */
export default function DuelStarters({ mine, theirs, mineName, theirsName }: {
  mine?: DuelStarter[]; theirs?: DuelStarter[]; mineName: string; theirsName: string;
}) {
  const count = Math.max(mine?.length ?? 0, theirs?.length ?? 0);
  if (count === 0) return null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex justify-between text-sm font-semibold text-ink2 pb-2 border-b border-line">
        <span>{mineName}</span><span>{theirsName}</span>
      </div>
      <ul className="list-none divide-y divide-line">
        {Array.from({ length: count }, (_, i) => {
          const a = mine?.[i];
          const b = theirs?.[i];

          return (
            <li key={i} className="py-2.5">
              <div className="flex items-center gap-3">
                <Side s={a} />
                <Side s={b} right />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

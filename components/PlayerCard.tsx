'use client';
import { formatPoints } from '@/lib/format';
import Image from 'next/image';
import TierPips from '@/components/TierPips';
import type { PlayerTier } from '@/lib/fantasy';

const posColors: Record<string, string> = {
  PG: 'bg-raised text-ink2',
  SG: 'bg-raised text-ink2',
  SF: 'bg-raised text-ink2',
  PF: 'bg-raised text-ink2',
  C: 'bg-raised text-ink2',
};

export interface PlayerRow {
  id: number;
  name: string;
  team: string;
  position: string;
  jersey_number: number | null;
  photo_url?: string | null;
  avg_points: number;
  avg_assists: number;
  avg_rebounds: number;
  avg_steals?: number;
  avg_blocks?: number;
  avg_turnovers?: number;
  season_avg_fantasy: number;
  total_fantasy?: number;
  last_week_fantasy?: number;
  games_played?: number;
  nationality?: string | null;
}

interface PlayerCardProps {
  player: PlayerRow;
  onPick?: () => void;
  isPicked?: boolean;
  isMyPick?: boolean;
  compact?: boolean;
  rank?: number;
  myUserId?: string;
  tier?: PlayerTier;
}

export default function PlayerCard({ player, onPick, isPicked, isMyPick, compact, rank, myUserId, tier }: PlayerCardProps) {
  const fantasy = player.total_fantasy ?? player.season_avg_fantasy ?? 0;
  const pos = player.position ?? '?';

  const Avatar = () => (
    <div className="w-9 h-9 rounded-full bg-raised flex items-center justify-center text-xs font-bold text-ink2 flex-shrink-0 overflow-hidden">
      {player.photo_url
        ? <Image src={player.photo_url} alt={player.name} width={36} height={36} className="object-cover" unoptimized />
        : `#${player.jersey_number ?? '?'}`
      }
    </div>
  );

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
        isMyPick ? 'bg-brand/10 border-brand/30' :
        isPicked ? 'bg-surface/50 border-line/50 opacity-50' :
        'bg-surface border-line'
      }`}>
        {rank !== undefined && <span className="text-muted text-xs font-bold w-5 text-center">{rank}</span>}
        <Avatar />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-ink text-sm truncate">{player.name}</span>
            <span className={`position-badge ${posColors[pos] ?? 'bg-line-strong text-ink2'}`}>{pos}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            {tier && <TierPips tier={tier} showLabel={false} />}
            <span className="text-xs text-ink2 truncate">{player.team}</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-display font-bold text-ink text-base">{formatPoints(Number(fantasy))}</div>
          <div className="text-[10px] text-muted">{player.total_fantasy != null ? 'pts total' : 'moy/match'}</div>
        </div>
        {onPick && !isPicked && (
          <button onClick={onPick}
            className="ml-1 bg-brand text-on-accent font-bold text-xs px-3 py-1.5 rounded-lg active:scale-90 transition-transform flex-shrink-0">
            Choisir
          </button>
        )}
        {isPicked && <span className="text-[10px] text-muted ml-1 flex-shrink-0">{isMyPick ? '✓ Moi' : '✓ Pris'}</span>}
      </div>
    );
  }

  return (
    <div className="card flex items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-raised flex items-center justify-center text-sm font-bold text-ink2 flex-shrink-0 overflow-hidden">
        {player.photo_url
          ? <Image src={player.photo_url} alt={player.name} width={56} height={56} className="object-cover" unoptimized />
          : `#${player.jersey_number ?? '?'}`
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-bold text-ink">{player.name}</span>
          <span className={`position-badge ${posColors[pos] ?? 'bg-line-strong text-ink2'}`}>{pos}</span>
        </div>
        <span className="text-sm text-ink2">{player.team}</span>
        <div className="flex gap-4 mt-2 text-xs text-ink2">
          <span><span className="text-ink font-semibold">{formatPoints(player.avg_points)}</span> pts</span>
          <span><span className="text-ink font-semibold">{formatPoints(player.avg_assists)}</span> ast</span>
          <span><span className="text-ink font-semibold">{formatPoints(player.avg_rebounds)}</span> reb</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-display font-bold text-ink text-2xl">{formatPoints(Number(fantasy))}</div>
        <div className="text-xs text-muted">pts fantasy</div>
        {player.games_played != null && <div className="text-[10px] text-muted">{player.games_played} matchs</div>}
      </div>
    </div>
  );
}

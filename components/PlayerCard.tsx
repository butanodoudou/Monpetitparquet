'use client';
import Image from 'next/image';

const posColors: Record<string, string> = {
  PG: 'bg-blue-500/20 text-blue-400',
  SG: 'bg-purple-500/20 text-purple-400',
  SF: 'bg-green-500/20 text-green-400',
  PF: 'bg-orange-500/20 text-orange-400',
  C: 'bg-red-500/20 text-red-400',
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
  drafted_by?: string | null;
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
}

export default function PlayerCard({ player, onPick, isPicked, isMyPick, compact, rank, myUserId }: PlayerCardProps) {
  const fantasy = player.total_fantasy ?? player.season_avg_fantasy ?? 0;
  const pos = player.position ?? '?';

  const Avatar = () => (
    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0 overflow-hidden">
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
        isPicked ? 'bg-slate-800/50 border-slate-700/50 opacity-50' :
        'bg-slate-800 border-slate-700'
      }`}>
        {rank !== undefined && <span className="text-slate-500 text-xs font-bold w-5 text-center">{rank}</span>}
        <Avatar />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-100 text-sm truncate">{player.name}</span>
            <span className={`position-badge ${posColors[pos] ?? 'bg-slate-600 text-slate-300'}`}>{pos}</span>
          </div>
          <span className="text-xs text-slate-400">{player.team}</span>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-brand font-bold text-sm">{Number(fantasy).toFixed(1)}</div>
          <div className="text-[10px] text-slate-500">{player.total_fantasy != null ? 'pts total' : 'moy/match'}</div>
        </div>
        {onPick && !isPicked && (
          <button onClick={onPick}
            className="ml-1 bg-brand text-slate-900 font-bold text-xs px-3 py-1.5 rounded-lg active:scale-90 transition-transform flex-shrink-0">
            Choisir
          </button>
        )}
        {isPicked && <span className="text-[10px] text-slate-500 ml-1 flex-shrink-0">{isMyPick ? '✓ Moi' : '✓ Pris'}</span>}
      </div>
    );
  }

  return (
    <div className="card flex items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0 overflow-hidden">
        {player.photo_url
          ? <Image src={player.photo_url} alt={player.name} width={56} height={56} className="object-cover" unoptimized />
          : `#${player.jersey_number ?? '?'}`
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-bold text-slate-100">{player.name}</span>
          <span className={`position-badge ${posColors[pos] ?? 'bg-slate-600 text-slate-300'}`}>{pos}</span>
        </div>
        <span className="text-sm text-slate-400">{player.team}</span>
        <div className="flex gap-4 mt-2 text-xs text-slate-400">
          <span><span className="text-slate-200 font-semibold">{player.avg_points.toFixed(1)}</span> pts</span>
          <span><span className="text-slate-200 font-semibold">{player.avg_assists.toFixed(1)}</span> ast</span>
          <span><span className="text-slate-200 font-semibold">{player.avg_rebounds.toFixed(1)}</span> reb</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-brand font-black text-xl">{Number(fantasy).toFixed(1)}</div>
        <div className="text-xs text-slate-500">pts fantasy</div>
        {player.games_played != null && <div className="text-[10px] text-slate-600">{player.games_played} matchs</div>}
      </div>
    </div>
  );
}

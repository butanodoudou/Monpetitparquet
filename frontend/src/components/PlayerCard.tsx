import { positionColors, positionLabels } from '../api/client';

interface Player {
  id: number;
  name: string;
  team: string;
  position: string;
  jersey_number: number;
  nationality: string;
  avg_points: number;
  avg_assists: number;
  avg_rebounds: number;
  season_avg_fantasy?: number;
  total_fantasy?: number;
  last_week_fantasy?: number;
}

interface PlayerCardProps {
  player: Player;
  onPick?: () => void;
  isPicked?: boolean;
  isMyPick?: boolean;
  compact?: boolean;
  rank?: number;
}

export default function PlayerCard({ player, onPick, isPicked, isMyPick, compact, rank }: PlayerCardProps) {
  const fantasy = player.season_avg_fantasy ?? player.total_fantasy ?? 0;

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
        isMyPick ? 'bg-brand/10 border-brand/30' :
        isPicked ? 'bg-slate-800/50 border-slate-700/50 opacity-60' :
        'bg-slate-800 border-slate-700'
      }`}>
        {rank !== undefined && (
          <span className="text-slate-500 text-sm font-bold w-5 text-center">{rank}</span>
        )}
        <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0">
          #{player.jersey_number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100 text-sm truncate">{player.name}</span>
            <span className={`position-badge ${positionColors[player.position] ?? 'bg-slate-600 text-slate-300'}`}>
              {player.position}
            </span>
          </div>
          <span className="text-xs text-slate-400">{player.team}</span>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-brand font-bold text-sm">{Number(fantasy).toFixed(1)}</div>
          <div className="text-[10px] text-slate-500">pts/match</div>
        </div>
        {onPick && !isPicked && (
          <button
            onClick={onPick}
            className="ml-1 bg-brand text-slate-900 font-bold text-xs px-3 py-1.5 rounded-lg active:scale-90 transition-transform flex-shrink-0"
          >
            Choisir
          </button>
        )}
        {isPicked && (
          <span className="text-[10px] text-slate-500 ml-1">{isMyPick ? '✓ Moi' : '✓ Pris'}</span>
        )}
      </div>
    );
  }

  return (
    <div className="card flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-300 flex-shrink-0">
        #{player.jersey_number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-bold text-slate-100">{player.name}</span>
          <span className={`position-badge ${positionColors[player.position] ?? 'bg-slate-600 text-slate-300'}`}>
            {player.position}
          </span>
        </div>
        <span className="text-sm text-slate-400">{player.team} · {positionLabels[player.position]}</span>
        <div className="flex gap-4 mt-2 text-xs text-slate-400">
          <span><span className="text-slate-200 font-semibold">{player.avg_points.toFixed(1)}</span> pts</span>
          <span><span className="text-slate-200 font-semibold">{player.avg_assists.toFixed(1)}</span> ast</span>
          <span><span className="text-slate-200 font-semibold">{player.avg_rebounds.toFixed(1)}</span> reb</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-brand font-black text-xl">{Number(fantasy).toFixed(1)}</div>
        <div className="text-xs text-slate-500">pts fantasy</div>
      </div>
    </div>
  );
}

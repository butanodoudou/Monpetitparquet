import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { positionColors } from '../api/client';

interface Player {
  id: number;
  name: string;
  team: string;
  position: string;
  avg_points: number;
  avg_assists: number;
  avg_rebounds: number;
  season_avg_fantasy?: number;
}

interface Pick {
  pick_number: number;
  round: number;
  userId: number;
  playerId: number;
  playerName: string;
  playerTeam: string;
  playerPosition: string;
  username: string;
}

interface DraftState {
  currentPickIndex: number;
  currentUserId: number;
  pickOrder: number[];
  totalPicks: number;
  numTeams: number;
  picksPerTeam: number;
  timeLeft: number;
  availablePlayers: Player[];
  picks: Pick[];
}

export default function DraftPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const navigate = useNavigate();

  const socketRef = useRef<Socket | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [timeLeft, setTimeLeft] = useState(45);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [connected, setConnected] = useState(false);
  const [myPicks, setMyPicks] = useState<number[]>([]);
  const [pickedIds, setPickedIds] = useState<Set<number>>(new Set());
  const [isDone, setIsDone] = useState(false);
  const [lastPick, setLastPick] = useState<string | null>(null);

  useEffect(() => {
    const socket = io('/', { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-draft', { leagueId: Number(leagueId) });
    });

    socket.on('draft-state', (state: DraftState) => {
      setDraft(state);
      setTimeLeft(state.timeLeft);
      const myPickIds = state.picks
        .filter(p => p.userId === user?.id)
        .map(p => p.playerId);
      setMyPicks(myPickIds);
      setPickedIds(new Set(state.picks.map(p => p.playerId)));
    });

    socket.on('player-picked', (data: { pickNumber: number; userId: number; playerId: number; playerName: string; playerTeam: string; playerPosition: string }) => {
      setLastPick(`${data.playerName} (${data.playerTeam}) — pick #${data.pickNumber}`);
      setPickedIds(prev => new Set([...prev, data.playerId]));
      setDraft(prev => {
        if (!prev) return prev;
        const newPick: Pick = { ...data, round: Math.ceil(data.pickNumber / prev.numTeams), username: '' };
        return {
          ...prev,
          currentPickIndex: prev.currentPickIndex + 1,
          picks: [...prev.picks, newPick],
          availablePlayers: prev.availablePlayers.filter(p => p.id !== data.playerId),
        };
      });
      if (data.userId === user?.id) {
        setMyPicks(prev => [...prev, data.playerId]);
      }
      setTimeout(() => setLastPick(null), 4000);
    });

    socket.on('next-pick', (data: { pickNumber: number; userId: number; timeLeft: number }) => {
      setDraft(prev => prev ? { ...prev, currentPickIndex: data.pickNumber - 1, currentUserId: data.userId } : prev);
      setTimeLeft(data.timeLeft);
    });

    socket.on('timer-tick', ({ timeLeft }: { timeLeft: number }) => {
      setTimeLeft(timeLeft);
    });

    socket.on('draft-complete', () => {
      setIsDone(true);
    });

    socket.on('error', (e: { message: string }) => {
      alert(e.message);
    });

    return () => {
      socket.emit('leave-draft', { leagueId: Number(leagueId) });
      socket.disconnect();
    };
  }, [leagueId, token, user?.id]);

  const makePick = useCallback((playerId: number) => {
    socketRef.current?.emit('make-pick', { leagueId: Number(leagueId), playerId });
  }, [leagueId]);

  const isMyTurn = draft?.currentUserId === user?.id;

  const filteredPlayers = (draft?.availablePlayers ?? []).filter(p => {
    if (pickedIds.has(p.id)) return false;
    if (posFilter && p.position !== posFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !p.team.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (isDone) {
    return (
      <div className="flex flex-col min-h-dvh items-center justify-center px-6 text-center bg-slate-900">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-3xl font-black text-slate-100 mb-2">Draft terminée !</h1>
        <p className="text-slate-400 mb-8">Tes {myPicks.length} joueurs sont prêts. Bonne chance !</p>
        <button className="btn-primary max-w-xs" onClick={() => navigate(`/leagues/${leagueId}/team`)}>
          Voir mon équipe
        </button>
        <button className="btn-secondary max-w-xs mt-3" onClick={() => navigate(`/leagues/${leagueId}`)}>
          Retour à la ligue
        </button>
      </div>
    );
  }

  if (!connected || !draft) {
    return (
      <div className="flex flex-col min-h-dvh items-center justify-center bg-slate-900">
        <div className="text-5xl animate-bounce mb-4">🏀</div>
        <p className="text-slate-400">Connexion à la draft…</p>
      </div>
    );
  }

  const timerPct = (timeLeft / 45) * 100;
  const timerColor = timeLeft > 15 ? '#F59E0B' : '#EF4444';
  const round = Math.floor(draft.currentPickIndex / draft.numTeams) + 1;
  const pickInRound = (draft.currentPickIndex % draft.numTeams) + 1;

  return (
    <div className="flex flex-col min-h-dvh bg-slate-900">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-slate-400 text-xs">Round {round}/{draft.picksPerTeam} · Pick {pickInRound}/{draft.numTeams}</div>
            <div className={`font-bold text-sm ${isMyTurn ? 'text-brand' : 'text-slate-300'}`}>
              {isMyTurn ? '🔥 TON TOUR !' : `En attente de ${draft.picks.find(p => p.userId === draft.currentUserId)?.username ?? '...'}`}
            </div>
          </div>
          <div className="text-right">
            <div className="font-black text-2xl" style={{ color: timerColor }}>{timeLeft}s</div>
          </div>
        </div>
        {/* Timer bar */}
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${timerPct}%`, backgroundColor: timerColor }}
          />
        </div>
      </div>

      {/* Last pick toast */}
      {lastPick && (
        <div className="mx-4 mt-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2 text-green-400 text-sm font-semibold text-center animate-pulse">
          ✓ {lastPick}
        </div>
      )}

      {/* Tabs: Available / My picks */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* My picks summary */}
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <span className="text-slate-500 text-xs font-semibold whitespace-nowrap">Mes picks ({myPicks.length}/{draft.picksPerTeam}) :</span>
            {myPicks.map(pid => {
              const p = draft.picks.find(pk => pk.playerId === pid && pk.userId === user?.id);
              return p ? (
                <span key={pid} className="bg-brand/20 text-brand text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap flex-shrink-0">
                  {p.playerName.split(' ').slice(-1)[0]}
                </span>
              ) : null;
            })}
            {Array.from({ length: Math.max(0, draft.picksPerTeam - myPicks.length) }).map((_, i) => (
              <span key={i} className="bg-slate-700/50 text-slate-600 text-xs px-3 py-1 rounded-lg border border-dashed border-slate-600 flex-shrink-0">
                ?
              </span>
            ))}
          </div>
        </div>

        {/* Search & filter */}
        <div className="px-4 pt-2 flex gap-2">
          <input
            className="input-field text-sm py-2 flex-1"
            placeholder="Rechercher un joueur…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="input-field text-sm py-2 w-24 flex-shrink-0"
            value={posFilter}
            onChange={e => setPosFilter(e.target.value)}
          >
            <option value="">Tous</option>
            {['PG', 'SG', 'SF', 'PF', 'C'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Available players list */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2">
          {filteredPlayers.slice(0, 50).map(p => {
            const fantasy = ((p.avg_points || 0) + (p.avg_assists || 0) * 2 + (p.avg_rebounds || 0) * 1.5).toFixed(1);
            return (
              <div key={p.id} className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5">
                <span className={`position-badge ${positionColors[p.position] ?? 'bg-slate-600 text-slate-300'}`}>
                  {p.position}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-100 font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-slate-400 text-xs">{p.team}</div>
                </div>
                <div className="text-right mr-2">
                  <div className="text-brand font-bold text-sm">{fantasy}</div>
                  <div className="text-[10px] text-slate-500">pts/j</div>
                </div>
                <button
                  onClick={() => makePick(p.id)}
                  disabled={!isMyTurn || myPicks.length >= draft.picksPerTeam}
                  className="bg-brand text-slate-900 font-bold text-xs px-3 py-1.5 rounded-lg active:scale-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                >
                  Choisir
                </button>
              </div>
            );
          })}
          {filteredPlayers.length === 0 && (
            <div className="text-center py-10 text-slate-500">Aucun joueur disponible</div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getSupabase } from '@/lib/supabase';
import { buildSnakeOrder } from '@/lib/fantasy';
import Image from 'next/image';

const posColors: Record<string, string> = {
  PG: 'bg-blue-500/20 text-blue-400', SG: 'bg-purple-500/20 text-purple-400',
  SF: 'bg-green-500/20 text-green-400', PF: 'bg-orange-500/20 text-orange-400', C: 'bg-red-500/20 text-red-400',
};

interface Player { id: number; name: string; team: string; position: string; jersey_number: number | null; photo_url: string | null; avg_points: number; avg_assists: number; avg_rebounds: number; season_avg_fantasy: number; drafted_by: string | null; }
interface Pick { pick_number: number; round: number; user: { username: string }; player: { name: string; position: string; team: string }; user_id: string; player_id: number; }
interface LeagueState { id: string; draft_status: string; current_draft_pick: number; pick_deadline: string | null; picks_per_team: number; members: { user_id: string; draft_position: number; team_name: string; user: { username: string } }[]; }

export default function DraftPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const router = useRouter();

  const [league, setLeague] = useState<LeagueState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [timeLeft, setTimeLeft] = useState(45);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [isDone, setIsDone] = useState(false);
  const [picking, setPicking] = useState(false);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSentRef = useRef(false);

  const load = async () => {
    const [leagueRes, playersRes, picksRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/players?league=${leagueId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/players?league=${leagueId}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const leagueData = await leagueRes.json();
    const playersData = await playersRes.json();
    setLeague(leagueData);
    setPlayers(playersData);
    setPicks(leagueData.draftPicks ?? []);
    if (leagueData.draft_status === 'completed') setIsDone(true);
  };

  useEffect(() => { if (!token) router.replace('/auth'); else load(); }, [token, leagueId]);

  // Polling fallback: refresh every 5s in case Realtime is not enabled
  useEffect(() => {
    if (!token || isDone) return;
    const poll = setInterval(() => load(), 5000);
    return () => clearInterval(poll);
  }, [token, leagueId, isDone]);

  // Supabase Realtime: listen to draft_picks and leagues changes
  useEffect(() => {
    const channel = getSupabase().channel(`draft-${leagueId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'draft_picks', filter: `league_id=eq.${leagueId}` },
        async (payload) => {
          const newPick = payload.new as any;
          // Refresh players to update drafted_by
          const r = await fetch(`/api/players?league=${leagueId}`, { headers: { Authorization: `Bearer ${token}` } });
          setPlayers(await r.json());
          setLastPick(`Pick #${newPick.pick_number}`);
          setTimeout(() => setLastPick(null), 3000);
          autoSentRef.current = false;
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` },
        async (payload) => {
          const updated = payload.new as any;
          setLeague(prev => prev ? { ...prev, ...updated } : prev);
          if (updated.draft_status === 'completed') { setIsDone(true); return; }
          if (updated.pick_deadline) {
            const left = Math.max(0, Math.ceil((new Date(updated.pick_deadline).getTime() - Date.now()) / 1000));
            setTimeLeft(left);
            autoSentRef.current = false;
          }
          // Refresh picks
          const r = await fetch(`/api/leagues/${leagueId}`, { headers: { Authorization: `Bearer ${token}` } });
          const d = await r.json();
          setPicks(d.draftPicks ?? []);
        })
      .subscribe();
    return () => { getSupabase().removeChannel(channel); };
  }, [leagueId, token]);

  // Local timer countdown
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!league?.pick_deadline || isDone) return;
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((new Date(league.pick_deadline!).getTime() - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0 && !autoSentRef.current) {
        autoSentRef.current = true;
        fetch(`/api/draft/${leagueId}/pick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ auto: true }),
        }).then(() => load());
      }
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [league?.pick_deadline, isDone]);

  const makePick = useCallback(async (playerId: number) => {
    if (picking) return;
    setPicking(true);
    try {
      const r = await fetch(`/api/draft/${leagueId}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ playerId }),
      });
      if (!r.ok) { const d = await r.json(); alert(d.error); }
      else { await load(); }
    } finally { setPicking(false); }
  }, [leagueId, token, picking]);

  if (!league) return <div className="page items-center justify-center flex"><div className="text-5xl animate-bounce">🏀</div></div>;

  if (isDone) return (
    <div className="page items-center justify-center px-6 text-center">
      <div className="text-6xl mb-4">🎉</div>
      <h1 className="text-3xl font-black text-slate-100 mb-2">Draft terminée !</h1>
      <p className="text-slate-400 mb-8">Tes joueurs sont prêts. Bonne chance !</p>
      <button className="btn-primary max-w-xs" onClick={() => router.push(`/leagues/${leagueId}/team`)}>Voir mon équipe</button>
      <button className="btn-secondary max-w-xs mt-3" onClick={() => router.push(`/leagues/${leagueId}`)}>Retour à la ligue</button>
    </div>
  );

  const members = league.members ?? [];
  const orderedIds = members.filter(m => m.draft_position != null).sort((a,b) => a.draft_position - b.draft_position).map(m => m.user_id);
  const pickOrder = buildSnakeOrder(orderedIds, league.picks_per_team);
  const pickIndex = (league.current_draft_pick ?? 1) - 1;
  const currentUserId = pickOrder[pickIndex];
  const isMyTurn = currentUserId === user?.id;
  const round = Math.floor(pickIndex / orderedIds.length) + 1;

  const draftedIds = new Set(players.filter(p => p.drafted_by).map(p => p.id));
  const myPickIds = players.filter(p => p.drafted_by === user?.id).map(p => p.id);

  const filtered = players.filter(p => {
    if (draftedIds.has(p.id)) return false;
    if (posFilter && p.position !== posFilter) return false;
    if (search) { const q = search.toLowerCase(); return p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q); }
    return true;
  });

  const timerPct = (timeLeft / 45) * 100;
  const timerColor = timeLeft > 15 ? '#F59E0B' : '#EF4444';

  return (
    <div className="flex flex-col min-h-dvh bg-slate-900">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-slate-400 text-xs">Round {round}/{league.picks_per_team} · Pick {(pickIndex % orderedIds.length) + 1}/{orderedIds.length}</div>
            <div className={`font-bold text-sm ${isMyTurn ? 'text-brand' : 'text-slate-300'}`}>
              {isMyTurn ? '🔥 TON TOUR !' : `En attente de ${members.find(m => m.user_id === currentUserId)?.user?.username ?? '…'}`}
            </div>
          </div>
          <div className="font-black text-2xl" style={{ color: timerColor }}>{timeLeft}s</div>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${timerPct}%`, backgroundColor: timerColor }} />
        </div>
      </div>

      {lastPick && (
        <div className="mx-4 mt-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2 text-green-400 text-sm font-semibold text-center">{lastPick} effectué !</div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* My picks */}
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <span className="text-slate-500 text-xs font-semibold whitespace-nowrap">Mes picks ({myPickIds.length}/{league.picks_per_team}) :</span>
            {myPickIds.map(pid => {
              const p = players.find(pl => pl.id === pid);
              return p ? <span key={pid} className="bg-brand/20 text-brand text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap flex-shrink-0">{p.name.split(' ').slice(-1)[0]}</span> : null;
            })}
            {Array.from({ length: Math.max(0, league.picks_per_team - myPickIds.length) }).map((_,i) => (
              <span key={i} className="bg-slate-700/50 text-slate-600 text-xs px-3 py-1 rounded-lg border border-dashed border-slate-600 flex-shrink-0">?</span>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 pt-2 flex gap-2">
          <input className="input-field text-sm py-2 flex-1" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input-field text-sm py-2 w-20 flex-shrink-0" value={posFilter} onChange={e => setPosFilter(e.target.value)}>
            <option value="">Tous</option>
            {['PG','SG','SF','PF','C'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Players list */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2">
          {filtered.length === 0 && <div className="text-center py-10 text-slate-500">Aucun joueur disponible</div>}
          {filtered.slice(0, 60).map(p => (
            <div key={p.id} className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs overflow-hidden flex-shrink-0">
                {p.photo_url ? <Image src={p.photo_url} alt={p.name} width={32} height={32} className="object-cover" unoptimized /> : `#${p.jersey_number ?? '?'}`}
              </div>
              <span className={`position-badge ${posColors[p.position] ?? 'bg-slate-600 text-slate-300'}`}>{p.position}</span>
              <div className="flex-1 min-w-0">
                <div className="text-slate-100 font-semibold text-sm truncate">{p.name}</div>
                <div className="text-slate-400 text-xs">{p.team}</div>
              </div>
              <div className="text-right mr-2 flex-shrink-0">
                <div className="text-brand font-bold text-sm">{p.season_avg_fantasy.toFixed(1)}</div>
                <div className="text-[10px] text-slate-500">pts/j</div>
              </div>
              <button onClick={() => makePick(p.id)} disabled={!isMyTurn || myPickIds.length >= league.picks_per_team || picking}
                className="bg-brand text-slate-900 font-bold text-xs px-3 py-1.5 rounded-lg active:scale-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">
                {picking ? '…' : 'Choisir'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

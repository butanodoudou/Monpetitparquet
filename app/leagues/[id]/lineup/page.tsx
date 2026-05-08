'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import {
  STARTER_SLOTS, POSITION_GROUP_MAP, GROUP_LABELS,
  type PositionGroup,
} from '@/lib/fantasy';

interface Player {
  id: number;
  name: string;
  position: string;
  photo_url: string | null;
  jersey_number: number | null;
  season_avg_fantasy: number;
  avg_points: number;
  avg_assists: number;
  avg_rebounds: number;
}

const GROUP_ORDER: PositionGroup[] = ['arriere', 'sf', 'grand'];

export default function LineupPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { token } = useAuthStore();
  const router = useRouter();

  const [players, setPlayers] = useState<Player[]>([]);
  const [starterIds, setStarterIds] = useState<Set<number>>(new Set());
  const [currentWeek, setCurrentWeek] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { router.replace('/auth'); return; }
    fetch(`/api/leagues/${leagueId}/lineup`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setPlayers(data.players ?? []);
        setStarterIds(new Set(data.starterIds ?? []));
        setCurrentWeek(data.currentWeek ?? 1);
        setIsLocked(data.isLocked ?? false);
      })
      .finally(() => setLoading(false));
  }, [token, leagueId]);

  const togglePlayer = (player: Player) => {
    if (isLocked) return;
    const group = POSITION_GROUP_MAP[player.position] as PositionGroup | undefined;
    if (!group) return;

    const next = new Set(starterIds);
    if (next.has(player.id)) {
      next.delete(player.id);
    } else {
      const groupStarters = players.filter(p => POSITION_GROUP_MAP[p.position] === group && next.has(p.id));
      if (groupStarters.length >= STARTER_SLOTS[group]) {
        next.delete(groupStarters[0].id);
      }
      next.add(player.id);
    }
    setStarterIds(next);
    setSaved(false);
    setError('');
  };

  const isValid = () => {
    const counts: Record<PositionGroup, number> = { arriere: 0, sf: 0, grand: 0 };
    for (const id of starterIds) {
      const p = players.find(pl => pl.id === id);
      const g = p ? POSITION_GROUP_MAP[p.position] as PositionGroup | undefined : undefined;
      if (g) counts[g]++;
    }
    return (Object.entries(STARTER_SLOTS) as [PositionGroup, number][]).every(([g, s]) => counts[g] === s);
  };

  const save = async () => {
    if (!token || !isValid()) return;
    setSaving(true);
    setError('');
    const res = await fetch(`/api/leagues/${leagueId}/lineup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ starterIds: [...starterIds], week: currentWeek }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
    else setError(data.error);
  };

  if (loading) return (
    <div className="page"><TopBar title="Composition" back />
      <div className="flex-1 flex items-center justify-center"><div className="text-4xl animate-bounce">🏀</div></div>
    </div>
  );

  const groupedPlayers = GROUP_ORDER.reduce((acc, g) => {
    acc[g] = players.filter(p => POSITION_GROUP_MAP[p.position] === g);
    return acc;
  }, {} as Record<PositionGroup, Player[]>);

  return (
    <div className="page">
      <TopBar title="Composition" back />
      <div className="page-scroll">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div>
            <div className="text-slate-100 font-black text-lg">Journée {currentWeek}</div>
            <div className="text-slate-500 text-xs mt-0.5">2 arrières · 1 ailier · 2 grands</div>
          </div>
          {isLocked
            ? <span className="bg-red-500/20 text-red-400 text-xs font-bold px-3 py-1.5 rounded-full">🔒 Verrouillé</span>
            : <span className="bg-green-500/20 text-green-400 text-xs font-bold px-3 py-1.5 rounded-full">🟢 Ouvert</span>
          }
        </div>

        {error && (
          <div className="mx-4 mt-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 text-red-400 text-xs">{error}</div>
        )}

        {GROUP_ORDER.map(group => {
          const gPlayers = groupedPlayers[group] ?? [];
          const starterCount = gPlayers.filter(p => starterIds.has(p.id)).length;
          const maxStarters = STARTER_SLOTS[group];

          return (
            <div key={group} className="px-4 mt-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{GROUP_LABELS[group]}</span>
                <div className="flex gap-1">
                  {Array.from({ length: maxStarters }).map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i < starterCount ? 'bg-brand' : 'bg-slate-700'}`} />
                  ))}
                </div>
                <span className={`text-xs font-semibold ${starterCount === maxStarters ? 'text-brand' : 'text-slate-500'}`}>
                  {starterCount}/{maxStarters}
                </span>
              </div>

              <div className="space-y-2">
                {gPlayers.map(player => {
                  const isStarter = starterIds.has(player.id);
                  return (
                    <button
                      key={player.id}
                      onClick={() => togglePlayer(player)}
                      disabled={isLocked}
                      className={`w-full card flex items-center gap-3 text-left transition-all ${
                        isStarter ? 'border-brand/50 bg-brand/5' : ''
                      } ${!isLocked ? 'active:scale-[0.98]' : 'opacity-70 cursor-default'}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 transition-colors ${
                        isStarter ? 'bg-brand text-slate-900' : 'bg-slate-700 text-slate-400'
                      }`}>
                        {isStarter ? '✓' : (player.jersey_number ?? player.position[0])}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-100 text-sm truncate">{player.name}</div>
                        <div className="text-xs text-slate-500">
                          {player.position} · {player.avg_points.toFixed(0)}pts {player.avg_assists.toFixed(0)}ast {player.avg_rebounds.toFixed(0)}reb
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`font-black text-sm ${isStarter ? 'text-brand' : 'text-slate-400'}`}>
                          {player.season_avg_fantasy.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-slate-600">moy/match</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="px-4 mt-6 pb-8">
          {!isLocked && (
            <>
              <button
                onClick={save}
                disabled={saving || !isValid()}
                className={`btn-primary w-full py-3 transition-all ${!isValid() ? 'opacity-40' : ''}`}
              >
                {saving ? 'Sauvegarde…' : saved ? '✓ Composition sauvegardée !' : 'Valider ma composition'}
              </button>
              {!isValid() && (
                <div className="text-center text-xs text-slate-600 mt-2">
                  Sélectionne 2 arrières + 1 ailier + 2 grands
                </div>
              )}
            </>
          )}
          {isLocked && (
            <div className="text-center text-slate-500 text-sm py-4">
              🔒 La composition est verrouillée le vendredi soir jusqu'au lundi
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

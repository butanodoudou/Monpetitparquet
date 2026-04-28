'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import PlayerCard, { type PlayerRow } from '@/components/PlayerCard';

interface Standing { user_id: string; username: string; team_name: string; avatar_color: string; total_score: number; player_count: number; }

export default function TeamPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const router = useRouter();
  const [players, setPlayers] = useState<(PlayerRow & { total_fantasy: number; last_week_fantasy: number })[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [tab, setTab] = useState<'equipe' | 'classement'>('equipe');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { router.replace('/auth'); return; }
    Promise.all([
      fetch(`/api/teams/${leagueId}/my-team`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`/api/teams/${leagueId}/standings`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([teamData, standingsData]) => {
      setPlayers(teamData.players ?? []);
      setTotalScore(teamData.totalScore ?? 0);
      setStandings(standingsData ?? []);
    }).finally(() => setLoading(false));
  }, [token, leagueId]);

  const myRank = standings.findIndex(s => s.user_id === user?.id) + 1;

  if (loading) return <div className="page"><TopBar title="Mon équipe" back /><div className="flex-1 flex items-center justify-center"><div className="text-4xl animate-bounce">🏀</div></div></div>;

  return (
    <div className="page">
      <TopBar title="Mon équipe" back />
      <div className="page-scroll">
        {/* Score hero */}
        <div className="px-4 pt-4">
          <div className="card bg-gradient-to-br from-slate-800 to-slate-900 text-center py-6">
            <div className="text-5xl font-black text-brand mb-1">{totalScore.toFixed(1)}</div>
            <div className="text-slate-400 text-sm">points fantasy au total</div>
            {myRank > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 bg-slate-700 rounded-full px-4 py-1.5">
                <span className="text-lg">{myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : `#${myRank}`}</span>
                <span className="text-slate-300 font-semibold text-sm">dans la ligue</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 mt-4">
          <div className="flex bg-slate-800 rounded-xl p-1">
            {(['equipe', 'classement'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-brand text-slate-900' : 'text-slate-400'}`}>
                {t === 'equipe' ? '🎽 Mon équipe' : '🏆 Classement'}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 mt-4">
          {tab === 'equipe' && (
            players.length === 0
              ? <div className="text-center py-12 text-slate-500"><div className="text-4xl mb-3">🎽</div><p>Aucun joueur dans ton équipe</p></div>
              : <div className="space-y-3">
                  {players.map(p => (
                    <div key={p.id} className="card">
                      <PlayerCard player={{ ...p, season_avg_fantasy: p.total_fantasy }} compact myUserId={user?.id} />
                      <div className="flex gap-4 mt-2 pt-2 border-t border-slate-700 text-xs text-slate-400">
                        <span>Moy: <span className="text-slate-200 font-semibold">{p.avg_points.toFixed(1)} pts</span></span>
                        <span><span className="text-slate-200 font-semibold">{p.avg_assists.toFixed(1)}</span> ast</span>
                        <span><span className="text-slate-200 font-semibold">{p.avg_rebounds.toFixed(1)}</span> reb</span>
                        <span className="ml-auto">Sem: <span className="text-brand font-bold">{p.last_week_fantasy.toFixed(1)}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {tab === 'classement' && (
            <div className="space-y-2">
              {standings.map((s, i) => (
                <div key={s.user_id} className={`card flex items-center gap-3 ${s.user_id === user?.id ? 'border-brand/40' : ''}`}>
                  <div className="text-xl w-6 text-center">{i===0?'🥇':i===1?'🥈':i===2?'🥉':<span className="text-slate-500 text-sm font-bold">{i+1}</span>}</div>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-slate-900 flex-shrink-0" style={{ backgroundColor: s.avatar_color }}>{s.username[0].toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-100 text-sm">{s.team_name}{s.user_id===user?.id&&<span className="text-brand text-xs ml-1">(moi)</span>}</div>
                    <div className="text-xs text-slate-400">{s.username}</div>
                  </div>
                  <div className="text-right"><div className="font-black text-brand">{s.total_score.toFixed(1)}</div><div className="text-[10px] text-slate-500">pts</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

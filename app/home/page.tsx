'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';

interface League { id: string; name: string; draft_status: string; member_count: number; team_name: string; }
interface Match { id: number; home_team: string; away_team: string; home_score: number | null; away_score: number | null; status: string; match_date: string; }

function useApi<T>(url: string, token: string | null) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!token) return;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setData).catch(() => {});
  }, [url, token]);
  return data;
}

export default function HomePage() {
  const { user, token, logout } = useAuthStore();
  const router = useRouter();
  const leagues = useApi<League[]>('/api/leagues', token);
  const matches = useApi<Match[]>('/api/matches?status=scheduled&limit=4', token);

  useEffect(() => { if (!token) router.replace('/auth'); }, [token]);
  if (!token || !user) return null;

  const statusColor = (s: string) => s === 'in_progress' ? 'text-brand animate-pulse' : s === 'completed' ? 'text-green-400' : 'text-slate-500';
  const statusLabel = (s: string) => s === 'in_progress' ? 'Draft live' : s === 'completed' ? 'En saison' : 'En attente';

  return (
    <div className="page">
      <TopBar title="Mon Petit Parquet" right={
        <button onClick={() => { logout(); router.replace('/auth'); }}
          className="text-slate-500 text-sm px-3 py-1 rounded-lg hover:text-slate-300">Déco</button>
      } />

      <div className="page-scroll">
        {/* Greeting */}
        <div className="px-4 pt-4 pb-2 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black text-slate-900 flex-shrink-0"
            style={{ backgroundColor: user.avatarColor }}>
            {user.username[0].toUpperCase()}
          </div>
          <div>
            <p className="text-slate-400 text-sm">Bonjour,</p>
            <p className="text-xl font-black text-slate-100">{user.username} 👋</p>
          </div>
        </div>

        {/* Upcoming matches */}
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Prochains matchs</h2>
            <Link href="/players" className="text-brand text-xs font-semibold">Tous →</Link>
          </div>
          {!matches ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="card h-12 animate-pulse bg-slate-800/50" />)}</div>
          ) : matches.length === 0 ? (
            <div className="card text-center py-6 text-slate-500 text-sm">Aucun match à venir — synchronise les données d'abord</div>
          ) : (
            <div className="space-y-2">
              {matches.map(m => (
                <div key={m.id} className="card flex items-center justify-between py-3">
                  <span className="text-slate-200 font-semibold text-sm flex-1 truncate">{m.home_team}</span>
                  <div className="px-3 flex-shrink-0">
                    {m.status === 'finished'
                      ? <span className="text-brand font-black">{m.home_score} – {m.away_score}</span>
                      : <span className="text-slate-500 text-xs font-bold bg-slate-700 px-2 py-0.5 rounded-full">VS</span>}
                  </div>
                  <span className="text-slate-200 font-semibold text-sm flex-1 truncate text-right">{m.away_team}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My leagues */}
        <div className="px-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Mes ligues</h2>
            <Link href="/leagues" className="text-brand text-xs font-semibold">Voir tout →</Link>
          </div>
          {!leagues ? (
            <div className="space-y-3">{[1,2].map(i => <div key={i} className="card h-24 animate-pulse bg-slate-800/50" />)}</div>
          ) : leagues.length === 0 ? (
            <div className="card text-center py-8">
              <div className="text-4xl mb-3">🏆</div>
              <p className="text-slate-400 text-sm mb-4">Rejoins ou crée une ligue avec tes amis</p>
              <Link href="/leagues" className="btn-primary max-w-xs mx-auto block">Commencer</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {leagues.slice(0, 3).map(l => (
                <Link key={l.id} href={`/leagues/${l.id}`}
                  className="card block active:scale-[0.98] transition-transform">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-100">{l.name}</span>
                    <span className={`text-xs font-semibold ${statusColor(l.draft_status)}`}>{statusLabel(l.draft_status)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-400">
                    <span>🎽 {l.team_name}</span>
                    <span>·</span>
                    <span>👥 {l.member_count} équipes</span>
                  </div>
                  {l.draft_status === 'in_progress' && (
                    <div className="mt-2 bg-brand/10 border border-brand/30 rounded-lg px-3 py-1.5">
                      <span className="text-brand text-xs font-bold">🔥 Draft en cours — Rejoins !</span>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Scoring system */}
        <div className="px-4 mt-6 mb-4">
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Barème de points</h2>
          <div className="card grid grid-cols-3 gap-3 text-center">
            {[['Point','▲1'],['Passe','▲2'],['Rebond','▲1.5'],['Interception','▲3'],['Contre','▲3'],['Perte de balle','▼2']].map(([label, val]) => (
              <div key={label}>
                <div className={`font-black text-lg ${val.startsWith('▼') ? 'text-red-400' : 'text-brand'}`}>{val.replace('▲','+').replace('▼','-')}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 text-center mt-2">+5 double-double · +10 triple-double</p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

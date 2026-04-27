import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';

interface League {
  id: number;
  name: string;
  invite_code: string;
  draft_status: string;
  member_count: number;
  team_name: string;
  commissioner_id: number;
  commissioner_name: string;
}

interface Match {
  id: number;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  week: number;
  status: string;
  match_date: string;
}

export default function HomePage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [nextMatches, setNextMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [leaguesRes, matchesRes] = await Promise.all([
          api.get('/leagues'),
          api.get('/matches/week/5'),
        ]);
        setLeagues(leaguesRes.data);
        setNextMatches(matchesRes.data.slice(0, 4));
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const draftStatusLabel = (s: string) =>
    s === 'pending' ? 'En attente' : s === 'in_progress' ? 'Draft en cours' : 'En saison';

  const draftStatusColor = (s: string) =>
    s === 'pending' ? 'text-slate-400' : s === 'in_progress' ? 'text-brand animate-pulse' : 'text-green-400';

  return (
    <div className="flex flex-col min-h-dvh">
      <TopBar
        title="Mon Petit Parquet"
        right={
          <button
            onClick={() => { logout(); navigate('/'); }}
            className="text-slate-500 text-sm px-3 py-1 rounded-lg hover:text-slate-300 transition-colors"
          >
            Déco
          </button>
        }
      />

      <div className="page-scroll">
        {/* Greeting */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black text-slate-900"
              style={{ backgroundColor: user?.avatarColor ?? '#F59E0B' }}
            >
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-slate-400 text-sm">Bonjour,</p>
              <p className="text-xl font-black text-slate-100">{user?.username} 👋</p>
            </div>
          </div>
        </div>

        {/* Upcoming matches */}
        <div className="px-4 mt-4">
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Journée 5 · À venir</h2>
          <div className="space-y-2">
            {nextMatches.map(m => (
              <div key={m.id} className="card flex items-center justify-between py-3">
                <span className="text-slate-200 font-semibold text-sm flex-1 truncate">{m.home_team}</span>
                <div className="flex items-center gap-2 px-3">
                  {m.status === 'finished' ? (
                    <span className="text-brand font-black">{m.home_score} – {m.away_score}</span>
                  ) : (
                    <span className="text-slate-500 text-xs font-bold bg-slate-700 px-2 py-0.5 rounded-full">VS</span>
                  )}
                </div>
                <span className="text-slate-200 font-semibold text-sm flex-1 truncate text-right">{m.away_team}</span>
              </div>
            ))}
          </div>
        </div>

        {/* My leagues */}
        <div className="px-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Mes ligues</h2>
            <button
              onClick={() => navigate('/leagues')}
              className="text-brand text-sm font-semibold"
            >
              Voir tout →
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="card animate-pulse h-24 bg-slate-800/50" />
              ))}
            </div>
          ) : leagues.length === 0 ? (
            <div className="card text-center py-8">
              <div className="text-4xl mb-3">🏆</div>
              <p className="text-slate-400 text-sm mb-4">Rejoins ou crée une ligue avec tes amis</p>
              <button onClick={() => navigate('/leagues')} className="btn-primary max-w-xs mx-auto">
                Commencer
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {leagues.slice(0, 3).map(l => (
                <button
                  key={l.id}
                  onClick={() => navigate(`/leagues/${l.id}`)}
                  className="card w-full text-left active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-100">{l.name}</span>
                    <span className={`text-xs font-semibold ${draftStatusColor(l.draft_status)}`}>
                      {draftStatusLabel(l.draft_status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-400">
                    <span>🎽 {l.team_name}</span>
                    <span>·</span>
                    <span>👥 {l.member_count} équipes</span>
                  </div>
                  {l.draft_status === 'in_progress' && (
                    <div className="mt-2 bg-brand/10 border border-brand/30 rounded-lg px-3 py-1.5">
                      <span className="text-brand text-xs font-bold">Draft en cours — Rejoins maintenant !</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scoring rules */}
        <div className="px-4 mt-6 mb-4">
          <h2 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">Barème de points</h2>
          <div className="card grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Point', val: '+1' },
              { label: 'Passe', val: '+2' },
              { label: 'Rebond', val: '+1.5' },
              { label: 'Interception', val: '+3' },
              { label: 'Contre', val: '+3' },
              { label: 'Perte de balle', val: '-2' },
            ].map(r => (
              <div key={r.label}>
                <div className={`font-black text-lg ${r.val.startsWith('-') ? 'text-red-400' : 'text-brand'}`}>
                  {r.val}
                </div>
                <div className="text-xs text-slate-500">{r.label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 text-center mt-2">+5 pts double-double · +10 pts triple-double</p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/authStore';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';

interface Member {
  user_id: number;
  username: string;
  team_name: string;
  avatar_color: string;
  total_score: number;
  player_count: number;
  draft_position: number;
}

interface League {
  id: number;
  name: string;
  invite_code: string;
  draft_status: string;
  commissioner_id: number;
  picks_per_team: number;
  members: Member[];
  draftPicks: any[];
}

export default function LeagueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingDraft, setStartingDraft] = useState(false);
  const [tab, setTab] = useState<'classement' | 'draft' | 'infos'>('classement');

  const load = async () => {
    try {
      const { data } = await api.get(`/leagues/${id}`);
      setLeague(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const startDraft = async () => {
    if (!confirm('Démarrer la draft ? Tous les joueurs doivent être connectés.')) return;
    setStartingDraft(true);
    try {
      await api.post(`/leagues/${id}/start-draft`);
      navigate(`/leagues/${id}/draft`);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erreur');
    } finally {
      setStartingDraft(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-dvh">
        <TopBar title="Chargement..." back />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-4xl animate-bounce">🏀</div>
        </div>
      </div>
    );
  }

  if (!league) return null;

  const isCommissioner = user?.id === league.commissioner_id;
  const myMember = league.members.find(m => m.user_id === user?.id);

  return (
    <div className="flex flex-col min-h-dvh">
      <TopBar title={league.name} back />

      <div className="page-scroll">
        {/* Hero card */}
        <div className="px-4 pt-4">
          <div className="card bg-gradient-to-br from-slate-800 to-slate-900">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-2xl font-black text-slate-100">{league.name}</div>
                <div className="text-sm text-slate-400 mt-0.5">{league.members.length} équipes · {league.picks_per_team} picks/équipe</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 mb-1">Code d'invitation</div>
                <div className="bg-slate-700 rounded-lg px-3 py-1.5 font-mono font-bold text-brand text-lg tracking-widest">
                  {league.invite_code}
                </div>
              </div>
            </div>

            {/* Status + actions */}
            {league.draft_status === 'pending' && (
              <div className="bg-slate-700/50 rounded-xl p-3 text-sm">
                {isCommissioner ? (
                  <div className="space-y-2">
                    <p className="text-slate-300">
                      {league.members.length < 2
                        ? 'Invite au moins un ami avant de commencer.'
                        : 'Tout le monde est prêt ? Lance la draft !'}
                    </p>
                    <button
                      className="btn-primary py-2 text-sm"
                      onClick={startDraft}
                      disabled={startingDraft || league.members.length < 2}
                    >
                      {startingDraft ? '...' : '🚀 Lancer la draft'}
                    </button>
                  </div>
                ) : (
                  <p className="text-slate-400">En attente que le commissaire lance la draft…</p>
                )}
              </div>
            )}

            {league.draft_status === 'in_progress' && (
              <button
                className="btn-primary py-2 text-sm"
                onClick={() => navigate(`/leagues/${id}/draft`)}
              >
                🏀 Rejoindre la draft en cours
              </button>
            )}

            {league.draft_status === 'completed' && myMember && (
              <div className="flex gap-2">
                <button
                  className="btn-secondary py-2 text-sm flex-1"
                  onClick={() => navigate(`/leagues/${id}/team`)}
                >
                  Mon équipe
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 mt-4">
          <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
            {(['classement', 'draft', 'infos'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                  tab === t ? 'bg-brand text-slate-900' : 'text-slate-400'
                }`}
              >
                {t === 'classement' ? '🏆 Classement' : t === 'draft' ? '📋 Draft' : 'ℹ️ Infos'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="px-4 mt-4">
          {tab === 'classement' && (
            <div className="space-y-2">
              {league.members.map((m, i) => (
                <div key={m.user_id} className={`card flex items-center gap-3 ${m.user_id === user?.id ? 'border-brand/40' : ''}`}>
                  <div className="text-2xl font-black text-slate-600 w-6 text-center">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </div>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-slate-900 flex-shrink-0"
                    style={{ backgroundColor: m.avatar_color }}
                  >
                    {m.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-100 text-sm">
                      {m.team_name}
                      {m.user_id === user?.id && <span className="text-brand text-xs ml-1">(moi)</span>}
                    </div>
                    <div className="text-xs text-slate-400">{m.username} · {m.player_count} joueurs</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-brand">{Number(m.total_score).toFixed(1)}</div>
                    <div className="text-[10px] text-slate-500">pts</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'draft' && (
            <div>
              {league.draftPicks.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <div className="text-4xl mb-3">📋</div>
                  <p>La draft n'a pas encore eu lieu</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {league.draftPicks.map((pick: any) => (
                    <div key={pick.id} className="flex items-center gap-3 py-2 border-b border-slate-800">
                      <div className="text-slate-500 text-sm font-mono w-6">#{pick.pick_number}</div>
                      <div className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{pick.position}</div>
                      <div className="flex-1">
                        <span className="text-slate-200 text-sm font-semibold">{pick.player_name}</span>
                        <span className="text-slate-500 text-xs ml-1">· {pick.team}</span>
                      </div>
                      <div className="text-slate-400 text-xs">{pick.username}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'infos' && (
            <div className="space-y-3">
              <div className="card">
                <div className="text-slate-400 text-xs mb-3 font-bold uppercase tracking-wide">Membres</div>
                <div className="space-y-2">
                  {league.members.map(m => (
                    <div key={m.user_id} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-slate-900"
                        style={{ backgroundColor: m.avatar_color }}
                      >
                        {m.username[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-slate-200 text-sm font-semibold">{m.username}</div>
                        <div className="text-xs text-slate-500">{m.team_name}</div>
                      </div>
                      {m.user_id === league.commissioner_id && (
                        <span className="ml-auto text-xs bg-brand/20 text-brand px-2 py-0.5 rounded-full font-bold">Commissaire</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

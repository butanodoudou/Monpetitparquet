'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { getSupabase } from '@/lib/supabase';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';

interface Member {
  user_id: string; username: string; team_name: string; avatar_color: string;
  total_score: number; player_count: number; is_bot?: boolean;
}
interface League {
  id: string; name: string; invite_code: string; draft_status: string;
  commissioner_id: string; picks_per_team: number; members: Member[]; draftPicks: any[];
}
interface MatchupSide {
  user_id: string; team_name: string; username: string; avatar_color: string; weekScore: number;
}
interface Matchup { id: string; home: MatchupSide; away: MatchupSide; leadingUserId: string | null; }
interface WeekData {
  currentWeek: number; scheduleGenerated: boolean; matchups: Matchup[];
  weekScores: Record<string, number>;
  wld: Record<string, { wins: number; losses: number; draws: number }>;
}

type Tab = 'duels' | 'classement' | 'draft' | 'infos';

export default function LeagueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const router = useRouter();
  const [league, setLeague] = useState<League | null>(null);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('classement');
  const [starting, setStarting] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [addingBot, setAddingBot] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`/api/leagues/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { router.replace('/leagues'); return; }
    const leagueData: League = await r.json();
    setLeague(leagueData);

    if (leagueData.draft_status === 'completed') {
      setTab('duels');
      const wr = await fetch(`/api/leagues/${id}/week`, { headers: { Authorization: `Bearer ${token}` } });
      if (wr.ok) setWeekData(await wr.json());
    }
    setLoading(false);
  }, [token, id, router]);

  useEffect(() => { if (!token) router.replace('/auth'); else load(); }, [token, id]);

  useEffect(() => {
    const ch = getSupabase()
      .channel(`league-status-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${id}` },
        p => setLeague(prev => prev ? { ...prev, ...(p.new as any) } : prev))
      .subscribe();
    return () => { getSupabase().removeChannel(ch); };
  }, [id]);

  const startDraft = async () => {
    if (!confirm('Démarrer la draft ?')) return;
    setStarting(true);
    const r = await fetch(`/api/leagues/${id}/start-draft`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) router.push(`/leagues/${id}/draft`);
    else { const d = await r.json(); alert(d.error); setStarting(false); }
  };

  const addBot = async () => {
    setAddingBot(true);
    const r = await fetch(`/api/leagues/${id}/add-bot`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) await load();
    else { const d = await r.json(); alert(d.error); }
    setAddingBot(false);
  };

  const generateSchedule = async () => {
    setGeneratingSchedule(true);
    const r = await fetch(`/api/leagues/${id}/generate-schedule`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const wr = await fetch(`/api/leagues/${id}/week`, { headers: { Authorization: `Bearer ${token}` } });
      if (wr.ok) setWeekData(await wr.json());
    } else { const d = await r.json(); alert(d.error); }
    setGeneratingSchedule(false);
  };

  if (loading) return (
    <div className="page"><TopBar title="Chargement…" back />
      <div className="flex-1 flex items-center justify-center"><div className="text-4xl animate-bounce">🏀</div></div>
    </div>
  );
  if (!league) return null;

  const isCommissioner = user?.id === league.commissioner_id;
  const draftDone = league.draft_status === 'completed';
  const botCount = league.members.filter(m => m.is_bot).length;
  const myMatchup = weekData?.matchups.find(m => m.home.user_id === user?.id || m.away.user_id === user?.id);

  const tabs: Tab[] = draftDone ? ['duels', 'classement', 'infos'] : ['classement', 'draft', 'infos'];
  const tabLabels: Record<Tab, string> = { duels: '⚡ Duels', classement: '🏆 Classement', draft: '📋 Draft', infos: 'ℹ️ Infos' };

  return (
    <div className="page">
      <TopBar title={league.name} back />
      <div className="page-scroll">
        {/* Hero */}
        <div className="px-4 pt-4">
          <div className="card bg-gradient-to-br from-slate-800 to-slate-900">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-2xl font-black text-slate-100">{league.name}</div>
                <div className="text-sm text-slate-400 mt-0.5">{league.members.length} équipes · {league.picks_per_team} picks/équipe</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 mb-1">Code invitation</div>
                <div className="bg-slate-700 rounded-lg px-3 py-1.5 font-mono font-bold text-brand text-sm tracking-widest">{league.invite_code}</div>
              </div>
            </div>

            {league.draft_status === 'pending' && (
              <div className="bg-slate-700/50 rounded-xl p-3">
                {isCommissioner ? (
                  <div className="space-y-2">
                    <p className="text-slate-300 text-sm">
                      {league.members.length < 2 ? 'Invite un ami ou ajoute un bot pour commencer.' : 'Lance la draft quand tout le monde est prêt !'}
                    </p>
                    <div className="flex gap-2">
                      {botCount < 3 && (
                        <button className="btn-secondary py-2 text-sm flex-1" onClick={addBot} disabled={addingBot}>
                          {addingBot ? '…' : `🤖 Ajouter un bot (${botCount}/3)`}
                        </button>
                      )}
                      <button className="btn-primary py-2 text-sm flex-1" onClick={startDraft}
                        disabled={starting || league.members.length < 2}>
                        {starting ? '…' : '🚀 Lancer'}
                      </button>
                    </div>
                  </div>
                ) : <p className="text-slate-400 text-sm">En attente que le commissaire lance la draft…</p>}
              </div>
            )}
            {league.draft_status === 'in_progress' && (
              <Link href={`/leagues/${id}/draft`} className="btn-primary py-2 text-sm text-center block">🏀 Rejoindre la draft en cours</Link>
            )}
            {draftDone && (
              <Link href={`/leagues/${id}/team`} className="btn-secondary py-2 text-sm text-center block">Mon équipe →</Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 mt-4">
          <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t ? 'bg-brand text-slate-900' : 'text-slate-400'}`}>
                {tabLabels[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 mt-4 pb-6">

          {/* ── DUELS ── */}
          {tab === 'duels' && (
            <div>
              {weekData && (
                <div className="text-center mb-4">
                  <span className="text-xs bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full font-semibold">
                    Journée {weekData.currentWeek}
                  </span>
                </div>
              )}

              {weekData?.scheduleGenerated ? (
                <>
                  {myMatchup && (
                    <div className="card bg-gradient-to-br from-slate-800 to-slate-900 mb-4">
                      <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-3 text-center">Ton duel</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 text-center">
                          <div className="w-10 h-10 rounded-full mx-auto mb-1.5 flex items-center justify-center text-sm font-black text-slate-900"
                            style={{ backgroundColor: myMatchup.home.avatar_color }}>
                            {myMatchup.home.username[0]?.toUpperCase()}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate px-1">{myMatchup.home.team_name}</div>
                          <div className={`text-3xl font-black mt-1 ${myMatchup.home.user_id === user?.id ? 'text-brand' : 'text-slate-100'}`}>
                            {myMatchup.home.weekScore.toFixed(1)}
                          </div>
                        </div>

                        <div className="flex flex-col items-center px-2 min-w-[44px]">
                          <div className="text-slate-600 font-black text-sm">VS</div>
                          {myMatchup.leadingUserId === user?.id && <div className="text-[10px] text-green-400 font-bold mt-1 text-center">Tu mènes 🔥</div>}
                          {myMatchup.leadingUserId && myMatchup.leadingUserId !== user?.id && <div className="text-[10px] text-red-400 font-bold mt-1 text-center">Tu es mené 😤</div>}
                          {!myMatchup.leadingUserId && <div className="text-[10px] text-slate-500 mt-1">Égalité</div>}
                        </div>

                        <div className="flex-1 text-center">
                          <div className="w-10 h-10 rounded-full mx-auto mb-1.5 flex items-center justify-center text-sm font-black text-slate-900"
                            style={{ backgroundColor: myMatchup.away.avatar_color }}>
                            {myMatchup.away.username[0]?.toUpperCase()}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate px-1">{myMatchup.away.team_name}</div>
                          <div className={`text-3xl font-black mt-1 ${myMatchup.away.user_id === user?.id ? 'text-brand' : 'text-slate-100'}`}>
                            {myMatchup.away.weekScore.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {weekData.matchups.length > 0 && (
                    <div>
                      {weekData.matchups.length > 1 && (
                        <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">Tous les duels</div>
                      )}
                      <div className="space-y-2">
                        {weekData.matchups.map(mu => {
                          const isMyGame = mu.home.user_id === user?.id || mu.away.user_id === user?.id;
                          return (
                            <div key={mu.id} className={`card flex items-center gap-1.5 py-2.5 ${isMyGame ? 'border-brand/30' : ''}`}>
                              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-slate-900"
                                style={{ backgroundColor: mu.home.avatar_color }}>
                                {mu.home.username[0]?.toUpperCase()}
                              </div>
                              <div className="flex-1 text-right min-w-0">
                                <div className="text-[11px] text-slate-300 font-medium truncate">{mu.home.team_name}</div>
                              </div>
                              <div className={`font-black text-sm w-10 text-right ${mu.leadingUserId === mu.home.user_id ? 'text-brand' : 'text-slate-300'}`}>
                                {mu.home.weekScore.toFixed(1)}
                              </div>
                              <div className="text-slate-600 text-xs font-bold px-0.5">–</div>
                              <div className={`font-black text-sm w-10 ${mu.leadingUserId === mu.away.user_id ? 'text-brand' : 'text-slate-300'}`}>
                                {mu.away.weekScore.toFixed(1)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] text-slate-300 font-medium truncate">{mu.away.team_name}</div>
                              </div>
                              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-slate-900"
                                style={{ backgroundColor: mu.away.avatar_color }}>
                                {mu.away.username[0]?.toUpperCase()}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">📅</div>
                  {isCommissioner ? (
                    <>
                      <div className="text-slate-300 font-semibold text-sm mb-1">Calendrier pas encore généré</div>
                      <div className="text-slate-500 text-xs mb-4">Lance la génération pour démarrer les duels hebdo</div>
                      <button className="btn-primary py-2 text-sm max-w-xs" onClick={generateSchedule} disabled={generatingSchedule}>
                        {generatingSchedule ? 'Génération…' : '📅 Générer le calendrier'}
                      </button>
                    </>
                  ) : (
                    <p className="text-slate-500 text-sm">En attente du calendrier par le commissaire…</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── CLASSEMENT ── */}
          {tab === 'classement' && (
            <div className="space-y-2">
              {league.members.map((m, i) => {
                const entry = weekData?.wld[m.user_id];
                const weekScore = weekData?.weekScores[m.user_id];
                return (
                  <div key={m.user_id} className={`card flex items-center gap-3 ${m.user_id === user?.id ? 'border-brand/40' : ''}`}>
                    <div className="text-xl w-6 text-center">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-slate-500 text-sm font-bold">{i + 1}</span>}
                    </div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-slate-900 flex-shrink-0"
                      style={{ backgroundColor: m.avatar_color }}>
                      {m.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-100 text-sm">
                        {m.team_name}
                        {m.user_id === user?.id && <span className="text-brand text-xs ml-1">(moi)</span>}
                      </div>
                      <div className="text-xs text-slate-400">
                        {m.username}
                        {entry && (entry.wins > 0 || entry.losses > 0) && (
                          <span className="ml-2 text-slate-500 font-semibold">
                            {entry.wins}V-{entry.losses}D{entry.draws > 0 ? `-${entry.draws}N` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-brand">{m.total_score.toFixed(1)}</div>
                      {weekScore !== undefined && weekData && (
                        <div className="text-[10px] text-slate-500">J{weekData.currentWeek}: {weekScore.toFixed(1)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── DRAFT ── */}
          {tab === 'draft' && (
            league.draftPicks.length === 0
              ? <div className="text-center py-10 text-slate-500"><div className="text-4xl mb-3">📋</div><p>Draft pas encore effectuée</p></div>
              : <div className="space-y-2">
                  {league.draftPicks.map((pick: any) => (
                    <div key={pick.id} className="flex items-center gap-3 py-2 border-b border-slate-800">
                      <div className="text-slate-500 text-sm font-mono w-6">#{pick.pick_number}</div>
                      <div className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{pick.player?.position}</div>
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-200 text-sm font-semibold">{pick.player?.name}</span>
                        <span className="text-slate-500 text-xs ml-1">· {pick.player?.team}</span>
                      </div>
                      <div className="text-slate-400 text-xs">{pick.user?.username}</div>
                    </div>
                  ))}
                </div>
          )}

          {/* ── INFOS ── */}
          {tab === 'infos' && (
            <div className="space-y-3">
              <div className="card space-y-3">
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-2">Membres</div>
                {league.members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-slate-900"
                      style={{ backgroundColor: m.avatar_color }}>
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

              {isCommissioner && (
                <button
                  onClick={async () => {
                    if (!confirm('Supprimer définitivement cette ligue et toutes ses données ?')) return;
                    const r = await fetch(`/api/leagues/${id}`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (r.ok) router.replace('/leagues');
                    else { const d = await r.json(); alert(d.error); }
                  }}
                  className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold"
                >
                  🗑 Supprimer la ligue
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

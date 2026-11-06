'use client';
import { formatPoints } from '@/lib/format';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { getSupabase } from '@/lib/supabase';
import { apiFetch, ApiError } from '@/lib/api-client';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import LotteryBanner from '@/components/lottery/LotteryBanner';
import LoginLinkBox from '@/components/LoginLinkBox';
import Scoreboard from '@/components/scoreboard/Scoreboard';
import type { WeekPhase } from '@/lib/week-phase';
import { loginUrl } from '@/lib/login-link';

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
  baseScore: number; chemBonus: number; weekendMult: number; defMultApplied: number;
}
interface Matchup { id: string; home: MatchupSide; away: MatchupSide; leadingUserId: string | null; }
interface WeekData {
  currentWeek: number; scheduleGenerated: boolean; matchups: Matchup[];
  phase: WeekPhase; lockAt: string | null;
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
  const [resetResult, setResetResult] = useState<{ username: string; link: string } | null>(null);
  const [resetError, setResetError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('classement');
  const [starting, setStarting] = useState(false);
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [addingBot, setAddingBot] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    let leagueData: League;
    try {
      leagueData = await apiFetch<League>(`/api/leagues/${id}`);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) router.replace('/leagues');
      return;
    }
    setLeague(leagueData);

    if (leagueData.draft_status === 'completed') {
      setTab('duels');
      try { setWeekData(await apiFetch(`/api/leagues/${id}/week`)); } catch { /* semaine indisponible : on garde l'écran sans duels */ }
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
    try {
      await apiFetch(`/api/leagues/${id}/start-draft`, { method: 'POST' });
      router.push(`/leagues/${id}/draft`);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) alert(e instanceof Error ? e.message : 'Erreur');
      setStarting(false);
    }
  };

  // Commissaire : nouveau lien pour un membre qui a perdu le sien (l'ancien cesse de marcher)
  const resetLink = async (m: Member) => {
    if (!window.confirm(`Créer un nouveau lien pour ${m.username} ? Son ancien lien ne marchera plus.`)) return;
    setResetError('');
    try {
      const { loginToken } = await apiFetch<{ loginToken: string }>(`/api/leagues/${id}/members/${m.user_id}/reset-link`, { method: 'POST' });
      setResetResult({ username: m.username, link: loginUrl(loginToken) });
    } catch (e) {
      setResetError(e instanceof ApiError ? e.message : 'Erreur réseau');
    }
  };

  // Invitation : feuille de partage native, sinon copie dans le presse-papier
  const invite = async () => {
    if (!league) return;
    const url = `${window.location.origin}/leagues?join=${league.invite_code}`;
    const text = `Rejoins ma ligue « ${league.name} » sur Mon Petit Parquet ! Code : ${league.invite_code}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Mon Petit Parquet', text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // partage annulé
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setInviteMsg('Lien copié dans le presse-papier');
    } catch {
      window.prompt('Copie ce lien pour inviter tes amis', url);
      return;
    }
    setTimeout(() => setInviteMsg(''), 2500);
  };

  const addBot = async () => {
    setAddingBot(true);
    try {
      await apiFetch(`/api/leagues/${id}/add-bot`, { method: 'POST' });
      await load();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) alert(e instanceof Error ? e.message : 'Erreur');
    }
    setAddingBot(false);
  };

  const generateSchedule = async () => {
    setGeneratingSchedule(true);
    try {
      await apiFetch(`/api/leagues/${id}/generate-schedule`, { method: 'POST' });
      try { setWeekData(await apiFetch(`/api/leagues/${id}/week`)); } catch { /* semaine indisponible */ }
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) alert(e instanceof Error ? e.message : 'Erreur');
    }
    setGeneratingSchedule(false);
  };

  if (loading) return (
    <div className="page"><TopBar title="Chargement…" back />
      <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-line border-t-brass animate-spin" /></div>
    </div>
  );
  if (!league) return null;

  const isCommissioner = user?.id === league.commissioner_id;
  const draftDone = league.draft_status === 'completed';
  const botCount = league.members.filter(m => m.is_bot).length;
  const myMatchup = weekData?.matchups.find(m => m.home.user_id === user?.id || m.away.user_id === user?.id);

  const tabs: Tab[] = draftDone ? ['duels', 'classement', 'infos'] : ['classement', 'draft', 'infos'];
  const tabLabels: Record<Tab, string> = { duels: 'Duels', classement: 'Classement', draft: 'Draft', infos: 'ℹ️ Infos' };

  return (
    <div className="page">
      <TopBar title={league.name} back />
      <div className="page-scroll">
        {/* Hero */}
        <div className="px-4 pt-4">
          <div className="card bg-gradient-to-br from-surface to-paper">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-2xl font-black text-ink">{league.name}</div>
                <div className="text-sm text-ink2 mt-0.5">{league.members.length} équipes · {league.picks_per_team} picks/équipe</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted mb-1">Code invitation</div>
                <div className="bg-raised rounded-lg px-3 py-1.5 font-mono font-bold text-brand text-sm tracking-widest">{league.invite_code}</div>
              </div>
            </div>

            <div className="mb-4">
              <button type="button" onClick={invite} className="btn-secondary py-2 text-sm w-full">
                {inviteMsg || 'Inviter des amis'}
              </button>
            </div>

            {league.draft_status === 'pending' && (
              <div className="bg-raised/50 rounded-xl p-3">
                {isCommissioner ? (
                  <div className="space-y-2">
                    <p className="text-ink2 text-sm">
                      {league.members.length < 2 ? 'Invite un ami ou ajoute un bot pour commencer.' : 'Lance la draft quand tout le monde est prêt !'}
                    </p>
                    <div className="flex gap-2">
                      {botCount < 3 && (
                        <button className="btn-secondary py-2 text-sm flex-1" onClick={addBot} disabled={addingBot}>
                          {addingBot ? '…' : `Ajouter un bot (${botCount}/3)`}
                        </button>
                      )}
                      <button className="btn-primary py-2 text-sm flex-1" onClick={startDraft}
                        disabled={starting || league.members.length < 2}>
                        {starting ? '…' : 'Lancer'}
                      </button>
                    </div>
                  </div>
                ) : <p className="text-ink2 text-sm">En attente que le commissaire lance la draft…</p>}
              </div>
            )}
            {league.draft_status === 'in_progress' && (
              <Link href={`/leagues/${id}/draft`} className="btn-primary py-2 text-sm text-center block">Rejoindre la draft en cours</Link>
            )}
            {draftDone && (
              <div className="space-y-2">
                <LotteryBanner leagueId={id} userId={user?.id} />
                <Link href={`/leagues/${id}/team`} className="btn-secondary py-2 text-sm text-center block">Mon équipe →</Link>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 mt-4">
          <div className="flex bg-surface rounded-xl p-1 gap-1">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t ? 'bg-brand text-on-accent' : 'text-ink2'}`}>
                {tabLabels[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 mt-4 pb-6">

          {/* ── DUELS ── */}
          {tab === 'duels' && (
            <div>
              {weekData && !myMatchup && (
                <div className="text-center mb-4">
                  <span className="text-xs bg-raised text-ink2 px-3 py-1.5 rounded-full font-semibold">
                    Journée {weekData.currentWeek}
                  </span>
                </div>
              )}

              {weekData?.scheduleGenerated ? (
                <>
                  {myMatchup && weekData && (() => {
                    const mine = myMatchup.home.user_id === user?.id ? myMatchup.home : myMatchup.away;
                    const theirs = mine === myMatchup.home ? myMatchup.away : myMatchup.home;
                    return (
                      <>
                        <Scoreboard
                          phase={weekData.phase}
                          week={weekData.currentWeek}
                          lockAt={weekData.lockAt}
                          me={{ name: mine.username, team: mine.team_name, score: mine.weekScore }}
                          opponent={{ name: theirs.username, team: theirs.team_name, score: theirs.weekScore }}
                        />
                        <div className="grid grid-cols-2 gap-3 mb-4 -mt-1">
                          <MatchupModifiers side={mine} />
                          <MatchupModifiers side={theirs} />
                        </div>
                      </>
                    );
                  })()}

                  {weekData.matchups.length > 0 && (
                    <div>
                      {weekData.matchups.length > 1 && (
                        <div className="text-xs text-muted font-semibold mb-2">Tous les duels</div>
                      )}
                      <div className="space-y-2">
                        {weekData.matchups.map(mu => {
                          const isMyGame = mu.home.user_id === user?.id || mu.away.user_id === user?.id;
                          return (
                            <div key={mu.id} className={`card flex items-center gap-1.5 py-2.5 ${isMyGame ? 'border-brand/30' : ''}`}>
                              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-ink"
                                style={{ backgroundColor: mu.home.avatar_color }}>
                                {mu.home.username[0]?.toUpperCase()}
                              </div>
                              <div className="flex-1 text-right min-w-0">
                                <div className="text-[11px] text-ink2 font-medium truncate">{mu.home.team_name}</div>
                              </div>
                              <div className={`font-black text-sm w-10 text-right ${mu.leadingUserId === mu.home.user_id ? 'text-brand' : 'text-ink2'}`}>
                                {formatPoints(mu.home.weekScore)}
                              </div>
                              <div className="text-muted text-xs font-bold px-0.5">–</div>
                              <div className={`font-black text-sm w-10 ${mu.leadingUserId === mu.away.user_id ? 'text-brand' : 'text-ink2'}`}>
                                {formatPoints(mu.away.weekScore)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] text-ink2 font-medium truncate">{mu.away.team_name}</div>
                              </div>
                              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-ink"
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
                  {isCommissioner ? (
                    <>
                      <div className="text-ink2 font-semibold text-sm mb-1">Calendrier pas encore généré</div>
                      <div className="text-muted text-xs mb-4">Lance la génération pour démarrer les duels hebdo</div>
                      <button className="btn-primary py-2 text-sm max-w-xs" onClick={generateSchedule} disabled={generatingSchedule}>
                        {generatingSchedule ? 'Génération…' : 'Générer le calendrier'}
                      </button>
                    </>
                  ) : (
                    <p className="text-muted text-sm">En attente du calendrier par le commissaire…</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── CLASSEMENT ── */}
          {tab === 'classement' && (
            <div className="space-y-2">
              {resetError && <p className="text-xs text-red-700">{resetError}</p>}
              {resetResult && (
                <div className="card space-y-2">
                  <div className="font-semibold text-ink text-sm">Nouveau lien de {resetResult.username}</div>
                  <p className="text-xs text-ink2">Envoie-le-lui en privé : il donne accès à son compte.</p>
                  <LoginLinkBox link={resetResult.link} shareText={`${resetResult.username}, voici ton nouveau lien Mon Petit Parquet`} />
                </div>
              )}
              {league.members.map((m, i) => {
                const entry = weekData?.wld[m.user_id];
                const weekScore = weekData?.weekScores[m.user_id];
                return (
                  <div key={m.user_id} className={`card flex items-center gap-3 ${m.user_id === user?.id ? 'border-brand/40' : ''}`}>
                    <div className="text-xl w-6 text-center">
                      <span className="font-display font-bold text-ink2 text-base">{i + 1}</span>
                    </div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-ink flex-shrink-0"
                      style={{ backgroundColor: m.avatar_color }}>
                      {m.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink text-sm">
                        {m.team_name}
                        {m.user_id === user?.id && <span className="text-brand text-xs ml-1">(moi)</span>}
                      </div>
                      <div className="text-xs text-ink2">
                        {m.username}
                        {entry && (entry.wins > 0 || entry.losses > 0) && (
                          <span className="ml-2 text-muted font-semibold">
                            {entry.wins}V-{entry.losses}D{entry.draws > 0 ? `-${entry.draws}N` : ''}
                          </span>
                        )}
                      </div>
                      {league.commissioner_id === user?.id && !m.is_bot && (
                        <button type="button" onClick={() => resetLink(m)} className="text-[11px] text-muted underline mt-0.5">
                          Nouveau lien
                        </button>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-black text-brand">{formatPoints(m.total_score)}</div>
                      {weekScore !== undefined && weekData && (
                        <div className="text-[10px] text-muted">J{weekData.currentWeek}: {formatPoints(weekScore)}</div>
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
              ? <div className="text-center py-10 text-muted"><p>Draft pas encore effectuée</p></div>
              : <div className="space-y-2">
                  {league.draftPicks.map((pick: any) => (
                    <div key={pick.id} className="flex items-center gap-3 py-2 border-b border-line">
                      <div className="text-muted text-sm font-mono w-6">#{pick.pick_number}</div>
                      <div className="text-xs bg-raised text-ink2 px-2 py-0.5 rounded-full">{pick.player?.position}</div>
                      <div className="flex-1 min-w-0">
                        <span className="text-ink text-sm font-semibold">{pick.player?.name}</span>
                        <span className="text-muted text-xs ml-1">· {pick.player?.team}</span>
                      </div>
                      <div className="text-ink2 text-xs">{pick.user?.username}</div>
                    </div>
                  ))}
                </div>
          )}

          {/* ── INFOS ── */}
          {tab === 'infos' && (
            <div className="space-y-3">
              <div className="card space-y-3">
                <div className="text-ink2 text-xs font-bold mb-2">Membres</div>
                {league.members.map(m => (
                  <div key={m.user_id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-ink"
                      style={{ backgroundColor: m.avatar_color }}>
                      {m.username[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="text-ink text-sm font-semibold">{m.username}</div>
                      <div className="text-xs text-muted">{m.team_name}</div>
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
                    try {
                      await apiFetch(`/api/leagues/${id}`, { method: 'DELETE' });
                      router.replace('/leagues');
                    } catch (e) {
                      if (!(e instanceof ApiError && e.status === 401)) alert(e instanceof Error ? e.message : 'Erreur');
                    }
                  }}
                  className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 text-sm font-semibold"
                >
                  Supprimer la ligue
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

function MatchupModifiers({ side }: { side: MatchupSide }) {
  const badges: { label: string; color: string }[] = [];
  if (side.chemBonus > 0)
    badges.push({ label: `+${formatPoints(side.chemBonus)} chimie`, color: 'text-ame' });
  if (side.weekendMult > 1)
    badges.push({ label: `×${side.weekendMult.toFixed(2)} weekend`, color: 'text-brand' });
  if (side.defMultApplied < 1)
    badges.push({ label: `×${side.defMultApplied.toFixed(2)} déf. adv.`, color: 'text-red-700' });
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 mt-1">
      {badges.map(b => (
        <span key={b.label} className={`text-[9px] font-semibold ${b.color}`}>{b.label}</span>
      ))}
    </div>
  );
}

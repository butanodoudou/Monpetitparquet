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
import DuelStarters from '@/components/cards/DuelStarters';
import type { DuelStarter, StandingRow } from '@/lib/card-view';
import type { WeekPhase } from '@/lib/week-phase';
import { loginUrl } from '@/lib/login-link';

interface Member {
  user_id: string; username: string; team_name: string; avatar_color: string; is_bot?: boolean;
}
interface League {
  id: string; name: string; invite_code: string; draft_status: string;
  commissioner_id: string; members: Member[];
}
interface MatchupSide {
  user_id: string; team_name: string; username: string; avatar_color: string; weekScore: number;
  baseScore: number; chemBonus: number; weekendMult: number; defMultApplied: number;
  starters?: DuelStarter[];
}
interface Matchup { id: string; home: MatchupSide; away: MatchupSide; leadingUserId: string | null; }
interface WeekData {
  currentWeek: number; scheduleGenerated: boolean; matchups: Matchup[];
  phase: WeekPhase; lockAt: string | null;
}

type Tab = 'duels' | 'classement' | 'infos';
const TAB_LABEL: Record<Tab, string> = { duels: 'Duels', classement: 'Classement', infos: 'Infos' };

const Avatar = ({ m, size = 36 }: { m: { avatar_color: string; username: string }; size?: number }) => (
  <div className="rounded-full flex items-center justify-center font-black text-ink flex-shrink-0"
    style={{ backgroundColor: m.avatar_color, width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
    {m.username[0]?.toUpperCase()}
  </div>
);

export default function LeagueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const router = useRouter();
  const [league, setLeague] = useState<League | null>(null);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [resetResult, setResetResult] = useState<{ username: string; link: string } | null>(null);
  const [resetError, setResetError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('duels');
  const [starting, setStarting] = useState(false);
  const [addingBot, setAddingBot] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [openDuel, setOpenDuel] = useState<string | null>(null);

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
      const [week, rows] = await Promise.all([
        apiFetch<WeekData>(`/api/leagues/${id}/week`).catch(() => null),
        apiFetch<StandingRow[]>(`/api/teams/${id}/standings`).catch(() => null),
      ]);
      setWeekData(week);
      setStandings(Array.isArray(rows) ? rows : []);
    }
    setLoading(false);
  }, [token, id, router]);

  useEffect(() => { if (!token) router.replace('/auth'); else load(); }, [token, id]);

  // Quand le commissaire lance la ligue, tout le monde bascule sans recharger
  useEffect(() => {
    const ch = getSupabase()
      .channel(`league-status-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${id}` }, () => { load(); })
      .subscribe();
    return () => { getSupabase().removeChannel(ch); };
  }, [id, load]);

  const startLeague = async () => {
    if (!league) return;
    if (!window.confirm('Lancer la ligue ? Plus personne ne pourra la rejoindre ensuite.')) return;
    setStarting(true);
    setActionError('');
    try {
      await apiFetch(`/api/leagues/${id}/start`, { method: 'POST' });
      await load();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setActionError(e instanceof Error ? e.message : 'La ligue n’a pas pu être lancée');
    }
    setStarting(false);
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
    setActionError('');
    try {
      await apiFetch(`/api/leagues/${id}/add-bot`, { method: 'POST' });
      await load();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setActionError(e instanceof Error ? e.message : 'Le bot n’a pas pu être ajouté');
    }
    setAddingBot(false);
  };

  if (loading) return (
    <div className="page"><TopBar title="Chargement…" back />
      <div className="flex-1 flex items-center justify-center" role="status" aria-label="Chargement"><div className="w-8 h-8 rounded-full border-2 border-line border-t-brass animate-spin" /></div>
    </div>
  );
  if (!league) return null;

  const isCommissioner = user?.id === league.commissioner_id;
  const started = league.draft_status === 'completed';
  const botCount = league.members.filter(m => m.is_bot).length;
  const myMatchup = weekData?.matchups.find(m => m.home.user_id === user?.id || m.away.user_id === user?.id);

  const hero = (
    <div className="px-4 pt-4">
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold text-ink leading-tight">{league.name}</h2>
            <p className="text-sm text-ink2 mt-0.5">{league.members.length} {league.members.length > 1 ? 'managers' : 'manager'}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-muted mb-1">Code d’invitation</div>
            <div className="bg-raised rounded-lg px-3 py-1.5 font-mono font-bold text-brand text-sm tracking-widest">{league.invite_code}</div>
          </div>
        </div>
        {!started && (
          <button type="button" onClick={invite} className="btn-secondary mt-4">{inviteMsg || 'Inviter des amis'}</button>
        )}
        {started && (
          <div className="mt-4 space-y-2">
            <LotteryBanner leagueId={id} userId={user?.id} />
            <Link href={`/leagues/${id}/lineup`} className="btn-primary block leading-[1.6]">Composer mon cinq</Link>
          </div>
        )}
      </div>
    </div>
  );

  // ── Avant le lancement : membres, invitation, bouton du commissaire ──
  if (!started) {
    const enough = league.members.length >= 2;
    return (
      <div className="page">
        <TopBar title={league.name} back />
        <div className="page-scroll">
          {hero}
          <div className="px-4 mt-4">
            <h3 className="font-display text-lg font-bold mb-2">Les managers</h3>
            <ul className="space-y-2 list-none">
              {league.members.map(m => (
                <li key={m.user_id} className="card flex items-center gap-3 py-3">
                  <Avatar m={m} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink text-sm truncate">{m.username}{m.user_id === user?.id && <span className="text-brand text-xs ml-1">(moi)</span>}</p>
                    <p className="text-xs text-ink2 truncate">{m.team_name}</p>
                  </div>
                  {m.user_id === league.commissioner_id && <span className="text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full font-bold">Commissaire</span>}
                  {m.is_bot && <span className="text-xs bg-raised text-ink2 px-2 py-0.5 rounded-full font-semibold">Bot</span>}
                </li>
              ))}
            </ul>

            {actionError && <p className="mt-3 text-sm text-[#8C1D18]" role="alert">{actionError}</p>}

            <div className="mt-5 rounded-2xl bg-raised p-4">
              {isCommissioner ? (
                <div className="space-y-3">
                  <p className="text-sm text-ink2">
                    {enough ? 'Quand tout le monde est là, lance la ligue : le calendrier des duels se crée et les inscriptions se ferment.' : 'Il faut au moins 2 managers. Invite un ami ou ajoute un bot.'}
                  </p>
                  <button type="button" className="btn-primary" onClick={startLeague} disabled={starting || !enough}>
                    {starting ? 'Lancement…' : 'Lancer la ligue'}
                  </button>
                  {botCount < 3 && (
                    <button type="button" className="btn-secondary" onClick={addBot} disabled={addingBot}>
                      {addingBot ? 'Ajout…' : `Ajouter un bot (${botCount} sur 3)`}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink2">{league.members.find(m => m.user_id === league.commissioner_id)?.username ?? 'Le commissaire'} lancera la ligue quand tout le monde sera là.</p>
              )}
            </div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Ligue lancée : duels, classement, infos ──
  const tabs: Tab[] = ['duels', 'classement', 'infos'];
  return (
    <div className="page">
      <TopBar title={league.name} back />
      <div className="page-scroll">
        {hero}

        <div className="px-4 mt-4">
          <div className="flex bg-surface rounded-xl p-1 gap-1" role="tablist">
            {tabs.map(t => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${tab === t ? 'bg-ink text-on-accent' : 'text-ink2'}`}>
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 mt-4 pb-6">
          {/* ── DUELS ── */}
          {tab === 'duels' && (
            <div>
              {weekData?.scheduleGenerated ? (
                <>
                  {myMatchup && (() => {
                    const mine = myMatchup.home.user_id === user?.id ? myMatchup.home : myMatchup.away;
                    const theirs = mine === myMatchup.home ? myMatchup.away : myMatchup.home;
                    return (
                      <div className="space-y-3 mb-5">
                        <Scoreboard
                          phase={weekData.phase}
                          week={weekData.currentWeek}
                          lockAt={weekData.lockAt}
                          me={{ name: mine.username, team: mine.team_name, score: mine.weekScore }}
                          opponent={{ name: theirs.username, team: theirs.team_name, score: theirs.weekScore }}
                        />
                        <div className="grid grid-cols-2 gap-3 -mt-1">
                          <MatchupModifiers side={mine} />
                          <MatchupModifiers side={theirs} />
                        </div>
                        <DuelStarters mine={mine.starters} theirs={theirs.starters} mineName={mine.username} theirsName={theirs.username} />
                      </div>
                    );
                  })()}

                  {weekData.matchups.length > 0 && (
                    <div>
                      <h3 className="font-display text-lg font-bold mb-2">{myMatchup ? 'Tous les duels' : `Journée ${weekData.currentWeek}`}</h3>
                      <ul className="space-y-2 list-none">
                        {weekData.matchups.map(mu => {
                          const isMyGame = mu.home.user_id === user?.id || mu.away.user_id === user?.id;
                          const hasStarters = !!(mu.home.starters?.length || mu.away.starters?.length);
                          const expanded = openDuel === mu.id;
                          return (
                            <li key={mu.id}>
                              <button type="button" disabled={!hasStarters} onClick={() => setOpenDuel(expanded ? null : mu.id)} aria-expanded={hasStarters ? expanded : undefined}
                                className={`card w-full flex items-center gap-1.5 py-2.5 min-h-[52px] text-left ${isMyGame ? 'border-brass' : ''}`}>
                                <Avatar m={mu.home} size={26} />
                                <div className="flex-1 text-right min-w-0 text-xs text-ink2 font-medium truncate">{mu.home.team_name}</div>
                                <div className={`font-black text-sm w-11 text-right ${mu.leadingUserId === mu.home.user_id ? 'text-brand' : 'text-ink2'}`}>{formatPoints(mu.home.weekScore)}</div>
                                <div className="text-muted text-xs font-bold px-0.5">–</div>
                                <div className={`font-black text-sm w-11 ${mu.leadingUserId === mu.away.user_id ? 'text-brand' : 'text-ink2'}`}>{formatPoints(mu.away.weekScore)}</div>
                                <div className="flex-1 min-w-0 text-xs text-ink2 font-medium truncate">{mu.away.team_name}</div>
                                <Avatar m={mu.away} size={26} />
                              </button>
                              {expanded && (
                                <div className="mt-2">
                                  <DuelStarters mine={mu.home.starters} theirs={mu.away.starters} mineName={mu.home.username} theirsName={mu.away.username} />
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-ink font-semibold">Le calendrier se prépare</p>
                  <p className="text-ink2 text-sm mt-1">Les duels apparaîtront ici dès le prochain relevé.</p>
                </div>
              )}
            </div>
          )}

          {/* ── CLASSEMENT ── */}
          {tab === 'classement' && (
            <div>
              {resetError && <p className="text-sm text-[#8C1D18] mb-2">{resetError}</p>}
              {resetResult && (
                <div className="card space-y-2 mb-3">
                  <div className="font-semibold text-ink text-sm">Nouveau lien de {resetResult.username}</div>
                  <p className="text-xs text-ink2">Envoie-le-lui en privé : il donne accès à son compte.</p>
                  <LoginLinkBox link={resetResult.link} shareText={`${resetResult.username}, voici ton nouveau lien Mon Petit Parquet`} />
                </div>
              )}
              <div className="flex items-center gap-3 px-4 pb-1 text-xs text-ink2 font-semibold">
                <span className="w-6" />
                <span className="flex-1">Manager</span>
                <span className="w-[72px] text-center" title="Victoires, nuls, défaites">V-N-D</span>
                <span className="w-12 text-right">Points</span>
              </div>
              {standings.length === 0 ? (
                <p className="text-center text-sm text-ink2 py-6">Le classement s’affichera après les premiers duels.</p>
              ) : (
                <ol className="space-y-2 list-none">
                  {standings.map((s, i) => {
                    const member = league.members.find(m => m.user_id === s.user_id);
                    return (
                      <li key={s.user_id} className={`card flex items-center gap-3 py-3 ${s.user_id === user?.id ? 'border-brass' : ''}`}>
                        <span className="font-display font-bold text-ink2 text-base w-6 text-center">{i + 1}</span>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <Avatar m={s} size={32} />
                          <div className="min-w-0">
                            <p className="font-semibold text-ink text-sm truncate">
                              {s.team_name}{s.user_id === user?.id && <span className="text-brand text-xs ml-1">(moi)</span>}
                            </p>
                            <p className="text-xs text-ink2 truncate">{s.username}</p>
                            {isCommissioner && member && !member.is_bot && s.user_id !== user?.id && (
                              <button type="button" onClick={() => resetLink(member)} className="text-xs text-muted underline min-h-[28px]">Nouveau lien</button>
                            )}
                          </div>
                        </div>
                        <span className="w-[72px] text-center text-sm font-semibold text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {s.wins}-{s.draws}-{s.losses}
                        </span>
                        <span className="w-12 text-right font-display font-bold text-brand" style={{ fontVariantNumeric: 'lining-nums tabular-nums' }}>{formatPoints(s.points_for)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}

          {/* ── INFOS ── */}
          {tab === 'infos' && (
            <div className="space-y-3">
              <div className="card">
                <h3 className="font-display text-lg font-bold mb-3">Managers</h3>
                <ul className="space-y-3 list-none">
                  {league.members.map(m => (
                    <li key={m.user_id} className="flex items-center gap-3">
                      <Avatar m={m} size={32} />
                      <div className="min-w-0">
                        <div className="text-ink text-sm font-semibold truncate">{m.username}</div>
                        <div className="text-xs text-muted truncate">{m.team_name}</div>
                      </div>
                      {m.user_id === league.commissioner_id && (
                        <span className="ml-auto text-xs bg-brand-light text-brand px-2 py-0.5 rounded-full font-bold">Commissaire</span>
                      )}
                    </li>
                  ))}
                </ul>
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
                  className="w-full min-h-[48px] rounded-xl bg-[#FDF3F2] border border-[#E4B4B0] text-[#8C1D18] text-sm font-semibold"
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
    badges.push({ label: `×${side.weekendMult.toFixed(2).replace('.', ',')} week-end`, color: 'text-brand' });
  if (side.defMultApplied < 1)
    badges.push({ label: `×${side.defMultApplied.toFixed(2).replace('.', ',')} défense adverse`, color: 'text-ink2' });
  if (badges.length === 0) return <div />;
  return (
    <div className="flex flex-col items-center gap-0.5 mt-1">
      {badges.map(b => (
        <span key={b.label} className={`text-xs font-semibold ${b.color}`}>{b.label}</span>
      ))}
    </div>
  );
}

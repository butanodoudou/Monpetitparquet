'use client';
import { formatPoints } from '@/lib/format';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import { apiFetch } from '@/lib/api-client';
import BottomNav from '@/components/BottomNav';
import PlayerCard, { type PlayerRow } from '@/components/PlayerCard';

interface MatchupSide {
  user_id: string; team_name: string; username: string; avatar_color: string; weekScore: number;
}
interface Matchup { id: string; home: MatchupSide; away: MatchupSide; leadingUserId: string | null; }
interface WeekData {
  currentWeek: number; scheduleGenerated: boolean; matchups: Matchup[];
  weekScores: Record<string, number>;
  wld: Record<string, { wins: number; losses: number; draws: number }>;
}
interface Standing {
  user_id: string; username: string; team_name: string; avatar_color: string;
  total_score: number; player_count: number;
}

export default function TeamPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const router = useRouter();
  const [players, setPlayers] = useState<(PlayerRow & { total_fantasy: number; last_week_fantasy: number })[]>([]);
  const [totalScore, setTotalScore] = useState(0);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [starterIds, setStarterIds] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<'equipe' | 'classement'>('equipe');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!token) { router.replace('/auth'); return; }
    Promise.all([
      apiFetch(`/api/teams/${leagueId}/my-team`),
      apiFetch(`/api/teams/${leagueId}/standings`),
      // Données secondaires : leur échec ne bloque pas la page (sauf 401, géré par apiFetch)
      apiFetch(`/api/leagues/${leagueId}/week`).catch(() => null),
      apiFetch(`/api/leagues/${leagueId}/lineup`).catch(() => null),
    ]).then(([teamData, standingsData, wd, lineupData]) => {
      setPlayers(teamData?.players ?? []);
      setTotalScore(teamData?.totalScore ?? 0);
      setStandings(Array.isArray(standingsData) ? standingsData : []);
      if (wd) setWeekData(wd);
      if (lineupData?.starterIds) setStarterIds(new Set(lineupData.starterIds));
    }).catch(e => setLoadError(e instanceof Error ? e.message : 'Erreur inattendue'))
      .finally(() => setLoading(false));
  }, [token, leagueId]);

  const myRank = standings.findIndex(s => s.user_id === user?.id) + 1;
  const myWeekScore = weekData?.weekScores[user?.id ?? ''] ?? 0;
  const myMatchup = weekData?.matchups.find(m => m.home.user_id === user?.id || m.away.user_id === user?.id);
  const opponent = myMatchup
    ? (myMatchup.home.user_id === user?.id ? myMatchup.away : myMatchup.home)
    : null;

  if (loading) return (
    <div className="page"><TopBar title="Mon équipe" back />
      <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-line border-t-brass animate-spin" /></div>
    </div>
  );

  if (loadError) return (
    <div className="page"><TopBar title="Mon équipe" back />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-red-700 text-sm mb-4">{loadError}</p>
        <button className="btn-secondary max-w-xs" onClick={() => window.location.reload()}>Réessayer</button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <TopBar title="Mon équipe" back />
      <div className="page-scroll">
        <div className="px-4 pt-4">
          <div className="card bg-gradient-to-br from-surface to-paper text-center py-5">
            <div className="text-5xl font-black text-brand mb-1">{formatPoints(totalScore)}</div>
            <div className="text-ink2 text-sm">points fantasy au total</div>
            {myRank > 0 && (
              <div className="mt-3 inline-flex items-center gap-2 bg-raised rounded-full px-4 py-1.5">
                <span className="text-lg">{myRank}{myRank === 1 ? 'er' : 'e'}</span>
                <span className="text-ink2 font-semibold text-sm">dans la ligue</span>
              </div>
            )}

            {weekData && (
              <div className="mt-4 flex items-stretch justify-center gap-3">
                <div className="bg-raised/60 rounded-xl px-4 py-2.5 text-center">
                  <div className="text-[10px] text-muted mb-0.5">
                    J{weekData.currentWeek} (titulaires)
                  </div>
                  <div className="font-black text-brand text-xl leading-none">{formatPoints(myWeekScore)}</div>
                  <div className="text-[10px] text-muted mt-0.5">pts</div>
                </div>

                {opponent && myMatchup && (
                  <>
                    <div className="flex items-center">
                      <div className="flex flex-col items-center">
                        <div className="text-muted font-black text-xs">VS</div>
                        {myMatchup.leadingUserId === user?.id && <div className="text-[9px] text-green-700 font-bold mt-0.5">Mène</div>}
                        {myMatchup.leadingUserId && myMatchup.leadingUserId !== user?.id && <div className="text-[9px] text-red-700 font-bold mt-0.5">Mené</div>}
                        {!myMatchup.leadingUserId && <div className="text-[9px] text-muted mt-0.5">Égalité</div>}
                      </div>
                    </div>
                    <div className="bg-raised/60 rounded-xl px-4 py-2.5 text-center">
                      <div className="text-[10px] text-muted mb-0.5">
                        {opponent.username}
                      </div>
                      <div className={`font-black text-xl leading-none ${myMatchup.leadingUserId === opponent.user_id ? 'text-red-700' : 'text-ink2'}`}>
                        {formatPoints(opponent.weekScore)}
                      </div>
                      <div className="text-[10px] text-muted mt-0.5 truncate max-w-[72px]">{opponent.team_name}</div>
                    </div>
                  </>
                )}
              </div>
            )}

            <Link href={`/leagues/${leagueId}/lineup`}
              className="mt-4 inline-flex items-center gap-1.5 bg-raised hover:bg-line-strong text-ink2 text-xs font-semibold px-4 py-2 rounded-full transition-colors">
              Modifier ma composition
            </Link>
          </div>
        </div>

        <div className="px-4 mt-4">
          <div className="flex bg-surface rounded-xl p-1">
            {(['equipe', 'classement'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-brand text-on-accent' : 'text-ink2'}`}>
                {t === 'equipe' ? 'Mon équipe' : 'Classement'}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 mt-4">
          {tab === 'equipe' && (
            players.length === 0
              ? <div className="text-center py-12 text-muted"><p>Aucun joueur dans ton équipe</p></div>
              : <div className="space-y-3">
                  {players.map(p => {
                    const isStarter = starterIds.has(p.id);
                    return (
                      <div key={p.id} className={`card ${isStarter ? 'border-brand/30' : 'opacity-80'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isStarter ? 'bg-brand/20 text-brand' : 'bg-raised text-muted'
                          }`}>
                            {isStarter ? 'TITULAIRE' : 'REMPLAÇANT'}
                          </span>
                        </div>
                        <PlayerCard player={{ ...p, season_avg_fantasy: p.total_fantasy }} compact myUserId={user?.id} />
                        <div className="flex gap-4 mt-2 pt-2 border-t border-line text-xs text-ink2">
                          <span>Moy: <span className="text-ink font-semibold">{formatPoints(p.avg_points)} pts</span></span>
                          <span><span className="text-ink font-semibold">{formatPoints(p.avg_assists)}</span> ast</span>
                          <span><span className="text-ink font-semibold">{formatPoints(p.avg_rebounds)}</span> reb</span>
                          <span className="ml-auto">
                            {weekData ? (
                              <>J{weekData.currentWeek}: <span className={`font-bold ${isStarter ? 'text-brand' : 'text-muted'}`}>{formatPoints(p.last_week_fantasy)}</span></>
                            ) : (
                              <>Sem: <span className="text-brand font-bold">{formatPoints(p.last_week_fantasy)}</span></>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
          )}

          {tab === 'classement' && (
            <div className="space-y-2">
              {standings.map((s, i) => {
                const entry = weekData?.wld[s.user_id];
                const wScore = weekData?.weekScores[s.user_id];
                return (
                  <div key={s.user_id} className={`card flex items-center gap-3 ${s.user_id === user?.id ? 'border-brand/40' : ''}`}>
                    <div className="text-xl w-6 text-center">
                      <span className="font-display font-bold text-ink2 text-base">{i + 1}</span>
                    </div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-ink flex-shrink-0"
                      style={{ backgroundColor: s.avatar_color }}>
                      {s.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink text-sm">
                        {s.team_name}
                        {s.user_id === user?.id && <span className="text-brand text-xs ml-1">(moi)</span>}
                      </div>
                      <div className="text-xs text-ink2">
                        {s.username}
                        {entry && (entry.wins > 0 || entry.losses > 0) && (
                          <span className="ml-2 text-muted font-semibold">
                            {entry.wins}V-{entry.losses}D
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-brand">{formatPoints(s.total_score)}</div>
                      {wScore !== undefined && weekData && (
                        <div className="text-[10px] text-muted">J{weekData.currentWeek}: {formatPoints(wScore)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

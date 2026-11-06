'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import MyLoginLink from '@/components/MyLoginLink';
import MyDuelBoard, { type DuelWeek } from '@/components/scoreboard/MyDuelBoard';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import LotteryBanner from '@/components/lottery/LotteryBanner';
import PackSealed from '@/components/cards/PackSealed';
import type { Collection } from '@/lib/card-view';
import { apiFetch } from '@/lib/api-client';

interface League { id: string; name: string; draft_status: string; member_count: number; team_name: string; }
interface Match { id: number; home_team: string; away_team: string; home_score: number | null; away_score: number | null; status: string; match_date: string; }

function useApi<T>(url: string | null, token: string | null) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!token || !url) return;
    apiFetch<T>(url).then(setData).catch(() => {});
  }, [url, token]);
  return data;
}

export default function HomePage() {
  const { user, token, logout } = useAuthStore();
  const router = useRouter();
  const leagues = useApi<League[]>('/api/leagues', token);
  const matches = useApi<Match[]>('/api/matches?status=scheduled&limit=4', token);
  const duelLeague = leagues?.find(l => l.draft_status === 'completed') ?? null;
  const collection = useApi<Collection>('/api/collection', token);
  const closedPacks = collection?.packs.length ?? 0;
  const week = useApi<DuelWeek>(duelLeague ? `/api/leagues/${duelLeague.id}/week` : null, token);

  useEffect(() => { if (!token) router.replace('/auth'); }, [token]);
  if (!token || !user) return null;

  const statusColor = (s: string) => s === 'in_progress' ? 'text-brand animate-pulse' : s === 'completed' ? 'text-green-700' : 'text-muted';
  const statusLabel = (s: string) => s === 'in_progress' ? 'Draft live' : s === 'completed' ? 'En saison' : 'En attente';

  return (
    <div className="page">
      <TopBar title="Mon Petit Parquet" right={
        <button onClick={() => {
          if (!window.confirm('Sans ton lien personnel, tu ne pourras plus revenir sur ce compte. Te déconnecter ?')) return;
          logout();
          router.replace('/auth');
        }} className="text-muted text-sm px-3 py-2 rounded-lg hover:text-ink2">Déconnexion</button>
      } />

      <div className="page-scroll">
        {/* Paquets fermés : le premier réflexe, avant tout le reste */}
        {closedPacks > 0 && (
          <div className="px-4 pt-4">
            <Link href="/packs" className="flex items-center gap-4 rounded-2xl bg-surface border border-brass p-4 active:scale-[.985] transition-transform"
              style={{ boxShadow: '0 10px 22px -16px rgba(20,27,38,.7)' }}>
              <div className="w-[76px] shrink-0"><PackSealed idle label="" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-xl font-bold leading-tight text-ink">
                  {closedPacks > 1 ? `${closedPacks} paquets t’attendent` : 'Un paquet t’attend'}
                </p>
                <p className="text-sm text-ink2 mt-0.5">{closedPacks * 5} cartes à découvrir.</p>
                <span className="mt-2 inline-flex items-center min-h-[44px] px-5 rounded-xl bg-ink text-on-accent text-sm font-semibold border border-brass">Ouvrir mes paquets</span>
              </div>
            </Link>
          </div>
        )}

        {/* Greeting */}
        <div className="px-4 pt-5 pb-1">
          <h2 className="font-display text-3xl font-bold text-ink">Salut {user.username}.</h2>
          {duelLeague && <p className="text-ink2 text-sm mt-1">{duelLeague.name}</p>}
        </div>

        {duelLeague && week && (
          <div className="px-4 mt-3">
            <Link href={`/leagues/${duelLeague.id}`} className="block"><MyDuelBoard week={week} userId={user.id} /></Link>
          </div>
        )}

        {/* Loterie du lundi : une bannière par ligue en saison */}
        {leagues && leagues.some(l => l.draft_status === 'completed') && (
          <div className="px-4 mt-4 space-y-2">
            {leagues.filter(l => l.draft_status === 'completed').slice(0, 3).map(l => (
              <LotteryBanner key={l.id} leagueId={l.id} userId={user.id} leagueName={leagues.length > 1 ? l.name : undefined} />
            ))}
          </div>
        )}

        {/* Upcoming matches */}
        <div className="px-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-ink2 text-xs font-bold">Prochains matchs</h2>
            <Link href="/players" className="text-brand text-xs font-semibold">Tous →</Link>
          </div>
          {!matches ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="card h-12 animate-pulse bg-surface/50" />)}</div>
          ) : matches.length === 0 ? (
            <div className="card text-center py-6 text-muted text-sm">Aucun match à venir — synchronise les données d'abord</div>
          ) : (
            <div className="space-y-2">
              {matches.map(m => (
                <div key={m.id} className="card flex items-center justify-between py-3">
                  <span className="text-ink font-semibold text-sm flex-1 truncate">{m.home_team}</span>
                  <div className="px-3 flex-shrink-0">
                    {m.status === 'finished'
                      ? <span className="text-brand font-black">{m.home_score} – {m.away_score}</span>
                      : <span className="text-muted text-xs font-bold bg-raised px-2 py-0.5 rounded-full">VS</span>}
                  </div>
                  <span className="text-ink font-semibold text-sm flex-1 truncate text-right">{m.away_team}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* My leagues */}
        <div className="px-4 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-ink2 text-xs font-bold">Mes ligues</h2>
            <Link href="/leagues" className="text-brand text-xs font-semibold">Voir tout →</Link>
          </div>
          {!leagues ? (
            <div className="space-y-3">{[1,2].map(i => <div key={i} className="card h-24 animate-pulse bg-surface/50" />)}</div>
          ) : leagues.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-ink2 text-sm mb-4">Rejoins ou crée une ligue avec tes amis</p>
              <Link href="/leagues" className="btn-primary max-w-xs mx-auto block">Commencer</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {leagues.slice(0, 3).map(l => (
                <Link key={l.id} href={`/leagues/${l.id}`}
                  className="card block active:scale-[0.98] transition-transform">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-ink">{l.name}</span>
                    <span className={`text-xs font-semibold ${statusColor(l.draft_status)}`}>{statusLabel(l.draft_status)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-ink2">
                    <span>{l.team_name}</span>
                    <span>·</span>
                    <span>{l.member_count} équipes</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 pb-4"><MyLoginLink /></div>
      </div>

      <BottomNav />
    </div>
  );
}

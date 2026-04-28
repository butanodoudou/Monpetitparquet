'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import PlayerCard, { type PlayerRow } from '@/components/PlayerCard';

const posLabels: Record<string, string> = { PG: 'Meneur', SG: 'Arrière', SF: 'Ailier', PF: 'Ailier-fort', C: 'Pivot' };

export default function PlayersPage() {
  const { token } = useAuthStore();
  const router = useRouter();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [sortBy, setSortBy] = useState<'fantasy' | 'pts' | 'ast' | 'reb'>('fantasy');
  const [selected, setSelected] = useState<PlayerRow | null>(null);

  useEffect(() => { if (!token) router.replace('/auth'); }, [token]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/players', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setPlayers)
      .finally(() => setLoading(false));
  }, [token]);

  const teams = Array.from(new Set(players.map(p => p.team))).sort();

  const filtered = players
    .filter(p => {
      if (posFilter && p.position !== posFilter) return false;
      if (teamFilter && p.team !== teamFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'pts') return b.avg_points - a.avg_points;
      if (sortBy === 'ast') return b.avg_assists - a.avg_assists;
      if (sortBy === 'reb') return b.avg_rebounds - a.avg_rebounds;
      return (b.season_avg_fantasy ?? 0) - (a.season_avg_fantasy ?? 0);
    });

  return (
    <div className="page">
      <TopBar title="Joueurs Betclic Élite" />

      <div className="page-scroll">
        {/* Filters */}
        <div className="px-4 pt-4 space-y-2">
          <input
            className="input-field text-sm py-2"
            placeholder="Rechercher un joueur ou une équipe…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex gap-2">
            <select className="input-field text-sm py-2 flex-1" value={posFilter} onChange={e => setPosFilter(e.target.value)}>
              <option value="">Tous postes</option>
              {Object.entries(posLabels).map(([k, v]) => <option key={k} value={k}>{k} – {v}</option>)}
            </select>
            <select className="input-field text-sm py-2 flex-1" value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
              <option value="">Toutes équipes</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {/* Sort */}
          <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
            {([['fantasy', 'Fantasy'], ['pts', 'Points'], ['ast', 'Passes'], ['reb', 'Rebonds']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${sortBy === key ? 'bg-brand text-slate-900' : 'text-slate-400'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats header */}
        {!loading && players.length > 0 && (
          <div className="px-4 mt-2 flex items-center gap-2">
            <span className="text-slate-500 text-xs">{filtered.length} joueur{filtered.length > 1 ? 's' : ''}</span>
            {players.length === 0 && (
              <span className="text-xs text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                Lance /api/sync/players d'abord
              </span>
            )}
          </div>
        )}

        {/* Player list */}
        <div className="px-4 mt-2 pb-4 space-y-2">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <div key={i} className="card h-16 animate-pulse bg-slate-800/50" />)
          ) : players.length === 0 ? (
            <div className="text-center py-16 card">
              <div className="text-4xl mb-3">🏀</div>
              <p className="text-slate-300 font-semibold mb-2">Aucun joueur en base</p>
              <p className="text-slate-500 text-sm mb-4">Lance la synchronisation depuis l'admin pour importer les données réelles Betclic Élite.</p>
              <code className="text-xs bg-slate-700 rounded-lg px-3 py-2 text-brand block">
                POST /api/sync/players?secret=CRON_SECRET
              </code>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500">Aucun résultat</div>
          ) : (
            filtered.map((p, i) => (
              <button key={p.id} className="w-full text-left" onClick={() => setSelected(p)}>
                <PlayerCard player={p} compact rank={i + 1} />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Player detail modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="bg-slate-800 border border-slate-700 rounded-t-3xl w-full max-w-[480px] p-6 pb-10">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-16 h-16 rounded-full bg-slate-700 flex-shrink-0 overflow-hidden flex items-center justify-center text-slate-400 font-bold">
                {selected.photo_url
                  ? <Image src={selected.photo_url} alt={selected.name} width={64} height={64} className="object-cover" unoptimized />
                  : `#${selected.jersey_number ?? '?'}`}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-black text-slate-100 leading-tight">{selected.name}</h2>
                <p className="text-slate-400 text-sm">{selected.team}</p>
                <p className="text-xs text-slate-500 mt-0.5">{selected.nationality ?? ''}{selected.jersey_number ? ` · #${selected.jersey_number}` : ''}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-brand font-black text-3xl">{(selected.season_avg_fantasy ?? 0).toFixed(1)}</div>
                <div className="text-xs text-slate-500">pts fantasy/match</div>
                {(selected.games_played ?? 0) > 0 && <div className="text-xs text-slate-600">{selected.games_played} matchs</div>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                ['Points', selected.avg_points],
                ['Passes', selected.avg_assists],
                ['Rebonds', selected.avg_rebounds],
                ['Interc.', selected.avg_steals ?? 0],
                ['Contres', selected.avg_blocks ?? 0],
                ['Pertes', selected.avg_turnovers ?? 0],
              ].map(([label, val]) => (
                <div key={String(label)} className="bg-slate-700 rounded-xl p-3 text-center">
                  <div className="font-black text-xl text-slate-100">{Number(val).toFixed(1)}</div>
                  <div className="text-xs text-slate-400">{label}</div>
                </div>
              ))}
            </div>

            <button className="btn-secondary" onClick={() => setSelected(null)}>Fermer</button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

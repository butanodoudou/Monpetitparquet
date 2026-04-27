import { useEffect, useState } from 'react';
import api from '../api/client';
import TopBar from '../components/TopBar';
import BottomNav from '../components/BottomNav';
import PlayerCard from '../components/PlayerCard';
import { positionLabels } from '../api/client';

interface Player {
  id: number;
  name: string;
  team: string;
  position: string;
  jersey_number: number;
  nationality: string;
  avg_points: number;
  avg_assists: number;
  avg_rebounds: number;
  avg_steals: number;
  avg_blocks: number;
  avg_turnovers: number;
  season_avg_fantasy: number;
}

const TEAMS = ['ASVEL', 'Paris Basketball', 'Monaco', 'JL Bourg', 'Strasbourg', 'Nanterre 92', 'Le Mans', 'Limoges CSP'];

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [sortBy, setSortBy] = useState<'fantasy' | 'pts' | 'ast' | 'reb'>('fantasy');
  const [selected, setSelected] = useState<Player | null>(null);

  useEffect(() => {
    api.get('/players').then(({ data }) => {
      setPlayers(data);
    }).finally(() => setLoading(false));
  }, []);

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
      if (sortBy === 'fantasy') return b.season_avg_fantasy - a.season_avg_fantasy;
      if (sortBy === 'pts') return b.avg_points - a.avg_points;
      if (sortBy === 'ast') return b.avg_assists - a.avg_assists;
      return b.avg_rebounds - a.avg_rebounds;
    });

  return (
    <div className="flex flex-col min-h-dvh">
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
            <select
              className="input-field text-sm py-2 flex-1"
              value={posFilter}
              onChange={e => setPosFilter(e.target.value)}
            >
              <option value="">Tous postes</option>
              {['PG', 'SG', 'SF', 'PF', 'C'].map(p => (
                <option key={p} value={p}>{p} – {positionLabels[p]}</option>
              ))}
            </select>
            <select
              className="input-field text-sm py-2 flex-1"
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
            >
              <option value="">Toutes équipes</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {/* Sort tabs */}
          <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
            {([['fantasy', 'Fantasy'], ['pts', 'Pts'], ['ast', 'Passes'], ['reb', 'Rebonds']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  sortBy === key ? 'bg-brand text-slate-900' : 'text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Player list */}
        <div className="px-4 mt-3 pb-4 space-y-2">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card h-16 animate-pulse bg-slate-800/50" />
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500">Aucun joueur trouvé</div>
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
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black text-slate-100">{selected.name}</h2>
                <p className="text-slate-400 text-sm">{selected.team} · #{selected.jersey_number}</p>
                <p className="text-xs text-slate-500 mt-0.5">{selected.nationality}</p>
              </div>
              <div className="text-right">
                <div className="text-brand font-black text-3xl">{Number(selected.season_avg_fantasy).toFixed(1)}</div>
                <div className="text-xs text-slate-500">pts fantasy/match</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Points', value: selected.avg_points.toFixed(1) },
                { label: 'Passes', value: selected.avg_assists.toFixed(1) },
                { label: 'Rebonds', value: selected.avg_rebounds.toFixed(1) },
                { label: 'Interceptions', value: selected.avg_steals.toFixed(1) },
                { label: 'Contres', value: selected.avg_blocks.toFixed(1) },
                { label: 'Pertes', value: selected.avg_turnovers.toFixed(1) },
              ].map(stat => (
                <div key={stat.label} className="bg-slate-700 rounded-xl p-3 text-center">
                  <div className="font-black text-xl text-slate-100">{stat.value}</div>
                  <div className="text-xs text-slate-400">{stat.label}</div>
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

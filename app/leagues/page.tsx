'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';

interface League { id: string; name: string; invite_code: string; draft_status: string; member_count: number; team_name: string; }
type Modal = 'create' | 'join' | null;

export default function LeaguesPage() {
  const { token } = useAuthStore();
  const router = useRouter();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState({ name: '', teamName: '', inviteCode: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!token) router.replace('/auth'); }, [token]);

  const load = async () => {
    const r = await fetch('/api/leagues', { headers: { Authorization: `Bearer ${token}` } });
    setLeagues(await r.json());
    setLoading(false);
  };
  useEffect(() => { if (token) load(); }, [token]);

  const openModal = (m: Modal) => { setModal(m); setForm({ name: '', teamName: '', inviteCode: '' }); setError(''); };

  const submit = async () => {
    setError(''); setBusy(true);
    const isCreate = modal === 'create';
    const url = isCreate ? '/api/leagues' : '/api/leagues/join';
    const body = isCreate ? { name: form.name, teamName: form.teamName } : { inviteCode: form.inviteCode, teamName: form.teamName };
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { setError(data.error); return; }
      await load();
      setModal(null);
      if (!isCreate) router.push(`/leagues/${data.leagueId}`);
    } catch { setError('Erreur réseau'); }
    finally { setBusy(false); }
  };

  const statusBadge = (s: string) => {
    if (s === 'in_progress') return <span className="text-xs bg-brand/20 text-brand font-bold px-2 py-0.5 rounded-full">Draft live</span>;
    if (s === 'completed') return <span className="text-xs bg-green-500/20 text-green-400 font-bold px-2 py-0.5 rounded-full">En saison</span>;
    return <span className="text-xs bg-slate-700 text-slate-400 font-bold px-2 py-0.5 rounded-full">En attente</span>;
  };

  return (
    <div className="page">
      <TopBar title="Mes ligues" />
      <div className="page-scroll">
        <div className="px-4 pt-4 grid grid-cols-2 gap-3">
          <button onClick={() => openModal('create')} className="btn-primary text-sm py-3">+ Créer une ligue</button>
          <button onClick={() => openModal('join')} className="btn-secondary text-sm py-3">Rejoindre</button>
        </div>

        <div className="px-4 mt-6">
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card h-28 animate-pulse bg-slate-800/50" />)}</div>
          ) : leagues.length === 0 ? (
            <div className="text-center py-16 text-slate-500"><div className="text-5xl mb-4">🏆</div><p>Aucune ligue pour l'instant</p></div>
          ) : (
            <div className="space-y-3">
              {leagues.map(l => (
                <Link key={l.id} href={`/leagues/${l.id}`} className="card block active:scale-[0.98] transition-transform">
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-bold text-slate-100 text-base">{l.name}</span>
                    {statusBadge(l.draft_status)}
                  </div>
                  <div className="text-sm text-slate-400 space-y-1">
                    <div>🎽 Mon équipe : <span className="text-slate-200">{l.team_name}</span></div>
                    <div className="flex items-center gap-3">
                      <span>👥 {l.member_count} équipes</span>
                      <span>·</span>
                      <span className="font-mono">🔑 {l.invite_code}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center"
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="bg-slate-800 border border-slate-700 rounded-t-3xl w-full max-w-[480px] p-6 pb-10 space-y-4">
            <h2 className="text-xl font-black text-slate-100">{modal === 'create' ? 'Créer une ligue' : 'Rejoindre une ligue'}</h2>
            {modal === 'create' && (
              <input className="input-field" placeholder="Nom de la ligue (ex: Les Cobras)" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            )}
            {modal === 'join' && (
              <input className="input-field" placeholder="Code d'invitation (ex: A3F2BE8C)" value={form.inviteCode}
                onChange={e => setForm(f => ({ ...f, inviteCode: e.target.value.toUpperCase() }))} maxLength={8} />
            )}
            <input className="input-field" placeholder="Nom de ton équipe" value={form.teamName}
              onChange={e => setForm(f => ({ ...f, teamName: e.target.value }))} />
            {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>}
            <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? '…' : modal === 'create' ? 'Créer la ligue' : 'Rejoindre'}</button>
            <button className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

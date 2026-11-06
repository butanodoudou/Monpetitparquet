'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import { apiFetch } from '@/lib/api-client';
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
  const [loadError, setLoadError] = useState('');

  // Sans session, on passe par /auth en gardant l'URL (et donc un éventuel ?join=CODE)
  useEffect(() => {
    if (!token) router.replace(`/auth?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [token]);

  const load = async () => {
    try {
      const data = await apiFetch<League[]>('/api/leagues');
      setLeagues(Array.isArray(data) ? data : []);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (token) load(); }, [token]);

  // Lien d'invitation /leagues?join=CODE : ouvre « Rejoindre » avec le code pré-rempli
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('join');
    if (!code || !token) return;
    setModal('join');
    setForm({ name: '', teamName: '', inviteCode: code.toUpperCase().slice(0, 8) });
    window.history.replaceState(null, '', '/leagues');
  }, [token]);

  const openModal = (m: Modal) => { setModal(m); setForm({ name: '', teamName: '', inviteCode: '' }); setError(''); };

  const submit = async () => {
    setError(''); setBusy(true);
    const isCreate = modal === 'create';
    const url = isCreate ? '/api/leagues' : '/api/leagues/join';
    const body = isCreate ? { name: form.name, teamName: form.teamName } : { inviteCode: form.inviteCode, teamName: form.teamName };
    try {
      const data = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
      await load();
      setModal(null);
      if (!isCreate && data?.leagueId) router.push(`/leagues/${data.leagueId}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur réseau'); }
    finally { setBusy(false); }
  };

  const statusBadge = (s: string) => {
    if (s === 'completed') return <span className="text-xs bg-green-500/20 text-green-700 font-bold px-2 py-0.5 rounded-full">En saison</span>;
    return <span className="text-xs bg-raised text-ink2 font-bold px-2 py-0.5 rounded-full">Avant le lancement</span>;
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
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card h-28 animate-pulse bg-surface/50" />)}</div>
          ) : loadError ? (
            <div className="text-center py-12">
              <p className="text-red-700 text-sm mb-3">{loadError}</p>
              <button className="btn-secondary max-w-xs" onClick={() => { setLoading(true); load(); }}>Réessayer</button>
            </div>
          ) : leagues.length === 0 ? (
            <div className="text-center py-16 text-muted"><p>Aucune ligue pour l'instant</p></div>
          ) : (
            <div className="space-y-3">
              {leagues.map(l => (
                <Link key={l.id} href={`/leagues/${l.id}`} className="card block active:scale-[0.98] transition-transform">
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-bold text-ink text-base">{l.name}</span>
                    {statusBadge(l.draft_status)}
                  </div>
                  <div className="text-sm text-ink2 space-y-1">
                    <div>Mon équipe : <span className="text-ink">{l.team_name}</span></div>
                    <div className="flex items-center gap-3">
                      <span>{l.member_count} équipes</span>
                      <span>·</span>
                      <span className="font-mono">{l.invite_code}</span>
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
          <div className="bg-surface border border-line rounded-t-3xl w-full max-w-[480px] p-6 pb-10 space-y-4">
            <h2 className="text-xl font-black text-ink">{modal === 'create' ? 'Créer une ligue' : 'Rejoindre une ligue'}</h2>
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
            {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-700 text-sm">{error}</div>}
            <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? '…' : modal === 'create' ? 'Créer la ligue' : 'Rejoindre'}</button>
            <button className="btn-secondary" onClick={() => setModal(null)}>Annuler</button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

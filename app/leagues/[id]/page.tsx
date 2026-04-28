'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';

interface Member { user_id: string; username: string; team_name: string; avatar_color: string; total_score: number; player_count: number; }
interface League { id: string; name: string; invite_code: string; draft_status: string; commissioner_id: string; picks_per_team: number; members: Member[]; draftPicks: any[]; }

export default function LeagueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const router = useRouter();
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'classement' | 'draft' | 'infos'>('classement');
  const [starting, setStarting] = useState(false);

  const load = async () => {
    const r = await fetch(`/api/leagues/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { router.replace('/leagues'); return; }
    setLeague(await r.json());
    setLoading(false);
  };

  useEffect(() => { if (!token) router.replace('/auth'); else load(); }, [token, id]);

  // Subscribe to live draft status changes
  useEffect(() => {
    const channel = supabase
      .channel(`league-status-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${id}` },
        payload => {
          setLeague(prev => prev ? { ...prev, ...(payload.new as any) } : prev);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const startDraft = async () => {
    if (!confirm('Démarrer la draft ?')) return;
    setStarting(true);
    const r = await fetch(`/api/leagues/${id}/start-draft`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) router.push(`/leagues/${id}/draft`);
    else { const d = await r.json(); alert(d.error); }
    setStarting(false);
  };

  if (loading) return <div className="page"><TopBar title="Chargement…" back /><div className="flex-1 flex items-center justify-center"><div className="text-4xl animate-bounce">🏀</div></div></div>;
  if (!league) return null;

  const isCommissioner = user?.id === league.commissioner_id;

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
                <div className="bg-slate-700 rounded-lg px-3 py-1.5 font-mono font-bold text-brand text-base tracking-widest">{league.invite_code}</div>
              </div>
            </div>

            {league.draft_status === 'pending' && (
              <div className="bg-slate-700/50 rounded-xl p-3">
                {isCommissioner ? (
                  <div className="space-y-2">
                    <p className="text-slate-300 text-sm">{league.members.length < 2 ? 'Invite au moins 1 ami avant de lancer la draft.' : 'Lance la draft quand tout le monde est prêt !'}</p>
                    <button className="btn-primary py-2 text-sm" onClick={startDraft} disabled={starting || league.members.length < 2}>
                      {starting ? '…' : '🚀 Lancer la draft'}
                    </button>
                  </div>
                ) : <p className="text-slate-400 text-sm">En attente que le commissaire lance la draft…</p>}
              </div>
            )}

            {league.draft_status === 'in_progress' && (
              <Link href={`/leagues/${id}/draft`} className="btn-primary py-2 text-sm text-center block">🏀 Rejoindre la draft en cours</Link>
            )}

            {league.draft_status === 'completed' && (
              <Link href={`/leagues/${id}/team`} className="btn-secondary py-2 text-sm text-center block">Mon équipe →</Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 mt-4">
          <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
            {(['classement', 'draft', 'infos'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t ? 'bg-brand text-slate-900' : 'text-slate-400'}`}>
                {t === 'classement' ? '🏆 Classement' : t === 'draft' ? '📋 Draft' : 'ℹ️ Infos'}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 mt-4">
          {tab === 'classement' && (
            <div className="space-y-2">
              {league.members.map((m, i) => (
                <div key={m.user_id} className={`card flex items-center gap-3 ${m.user_id === user?.id ? 'border-brand/40' : ''}`}>
                  <div className="text-xl w-6 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-slate-500 text-sm font-bold">{i+1}</span>}</div>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-slate-900 flex-shrink-0" style={{ backgroundColor: m.avatar_color }}>
                    {m.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-100 text-sm">{m.team_name}{m.user_id === user?.id && <span className="text-brand text-xs ml-1">(moi)</span>}</div>
                    <div className="text-xs text-slate-400">{m.username} · {m.player_count} joueurs</div>
                  </div>
                  <div className="text-right"><div className="font-black text-brand">{m.total_score.toFixed(1)}</div><div className="text-[10px] text-slate-500">pts</div></div>
                </div>
              ))}
            </div>
          )}

          {tab === 'draft' && (
            league.draftPicks.length === 0
              ? <div className="text-center py-10 text-slate-500"><div className="text-4xl mb-3">📋</div><p>Draft pas encore effectuée</p></div>
              : <div className="space-y-2">
                  {league.draftPicks.map((pick: any) => (
                    <div key={pick.id} className="flex items-center gap-3 py-2 border-b border-slate-800">
                      <div className="text-slate-500 text-sm font-mono w-6">#{pick.pick_number}</div>
                      <div className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{(pick.player as any)?.position}</div>
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-200 text-sm font-semibold">{(pick.player as any)?.name}</span>
                        <span className="text-slate-500 text-xs ml-1">· {(pick.player as any)?.team}</span>
                      </div>
                      <div className="text-slate-400 text-xs">{(pick.user as any)?.username}</div>
                    </div>
                  ))}
                </div>
          )}

          {tab === 'infos' && (
            <div className="card space-y-3">
              <div className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-2">Membres</div>
              {league.members.map(m => (
                <div key={m.user_id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-slate-900" style={{ backgroundColor: m.avatar_color }}>{m.username[0].toUpperCase()}</div>
                  <div><div className="text-slate-200 text-sm font-semibold">{m.username}</div><div className="text-xs text-slate-500">{m.team_name}</div></div>
                  {m.user_id === league.commissioner_id && <span className="ml-auto text-xs bg-brand/20 text-brand px-2 py-0.5 rounded-full font-bold">Commissaire</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

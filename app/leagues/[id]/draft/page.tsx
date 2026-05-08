'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useAuthStore } from '@/store/authStore';
import { getSupabase } from '@/lib/supabase';
import { PACK_PRICES, DRAFT_BUDGET, TIER_CONFIG, type PlayerTier } from '@/lib/fantasy';

interface Player {
  id: number;
  name: string;
  team: string;
  position: string;
  jersey_number: number | null;
  photo_url: string | null;
  avg_points: number;
  avg_assists: number;
  avg_rebounds: number;
  season_avg_fantasy: number;
  tier: PlayerTier;
}

interface DraftState {
  picks_per_team: number;
  draft_status: string;
  myCredits: number;
  myPlayers: { id: number; name: string; position: string; tier?: PlayerTier }[];
  isCommissioner: boolean;
  hasBots: boolean;
}

type Phase = 'lobby' | 'opening' | 'picking' | 'done';

const TIER_ORDER: PlayerTier[] = ['elite', 'gold', 'silver', 'bronze'];
const TIER_EMOJI: Record<PlayerTier, string> = { elite: '👑', gold: '🥇', silver: '🥈', bronze: '🥉' };

export default function DraftPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const router = useRouter();

  const [state, setState] = useState<DraftState | null>(null);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [offerId, setOfferId] = useState<string | null>(null);
  const [packPlayers, setPackPlayers] = useState<Player[]>([]);
  const [revealed, setRevealed] = useState<boolean[]>([false, false, false]);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [rejectedIds, setRejectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [botDrafting, setBotDrafting] = useState(false);
  const [lastPicked, setLastPicked] = useState<Player | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    const [leagueRes, myTeamRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/teams/${leagueId}/my-team`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const league = await leagueRes.json();
    const myTeam = await myTeamRes.json();

    if (league.draft_status === 'completed') { router.replace(`/leagues/${leagueId}/team`); return; }

    const myMember = league.members?.find((m: any) => m.user_id === user?.id);

    setState({
      picks_per_team: league.picks_per_team ?? 8,
      draft_status: league.draft_status,
      myCredits: myMember?.draft_credits ?? DRAFT_BUDGET,
      myPlayers: myTeam.players ?? [],
      isCommissioner: league.commissioner_id === user?.id,
      hasBots: (league.members ?? []).some((m: any) => m.is_bot),
    });
    setLoading(false);
  }, [token, leagueId, user?.id]);

  useEffect(() => { if (!token) router.replace('/auth'); else load(); }, [token]);

  // Supabase Realtime: listen for draft completion
  useEffect(() => {
    const channel = getSupabase()
      .channel(`draft-mystery-${leagueId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leagues', filter: `id=eq.${leagueId}` },
        payload => {
          if ((payload.new as any).draft_status === 'completed') router.replace(`/leagues/${leagueId}/team`);
        })
      .subscribe();
    return () => { getSupabase().removeChannel(channel); };
  }, [leagueId]);

  const draftBots = async () => {
    if (!token) return;
    setBotDrafting(true);
    setError('');
    const res = await fetch(`/api/leagues/${leagueId}/bot-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setBotDrafting(false);
    if (!res.ok) { setError(data.error); return; }
    if (data.draftComplete) {
      router.replace(`/leagues/${leagueId}/team`);
    } else {
      await load();
    }
  };

  const openPack = async (tier: PlayerTier) => {
    if (!token || !state) return;
    if ((state.myCredits ?? 0) < PACK_PRICES[tier]) { setError('Crédits insuffisants'); return; }
    setError('');
    setLoading(true);

    const res = await fetch(`/api/draft/${leagueId}/open-pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tier }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error); return; }

    setOfferId(data.offerId);
    setPackPlayers(data.players);
    setRevealed([false, false, false]);
    setChosenId(null);
    setRejectedIds(new Set());
    setPhase('opening');

    // Staggered card reveals
    [400, 900, 1400].forEach((delay, i) => {
      setTimeout(() => setRevealed(r => { const n = [...r]; n[i] = true; return n; }), delay);
    });
    setTimeout(() => setPhase('picking'), 1900);
  };

  const pickPlayer = async (player: Player) => {
    if (!token || !offerId || picking) return;
    setPicking(true);
    setChosenId(player.id);
    setRejectedIds(new Set(packPlayers.filter(p => p.id !== player.id).map(p => p.id)));

    await new Promise(r => setTimeout(r, 600));

    const res = await fetch(`/api/draft/${leagueId}/pick-from-pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ offerId, playerId: player.id }),
    });
    const data = await res.json();
    setPicking(false);

    if (!res.ok) { setError(data.error); setPhase('lobby'); load(); return; }

    setLastPicked(player);
    setState(s => s ? {
      ...s,
      myCredits: data.creditsLeft,
      myPlayers: [...s.myPlayers, { id: player.id, name: player.name, position: player.position, tier: player.tier }],
    } : s);

    if (data.draftComplete) { setPhase('done'); return; }
    setTimeout(() => { setPhase('lobby'); setLastPicked(null); }, 2000);
  };

  if (loading && !state) {
    return <div className="page items-center justify-center flex"><div className="text-5xl animate-bounce">🏀</div></div>;
  }
  if (!state) return null;

  const rosterFull = state.myPlayers.length >= state.picks_per_team;

  return (
    <div className="flex flex-col min-h-dvh bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
        <div>
          <div className="text-slate-100 font-black text-base">Draft Mystery</div>
          <div className="text-slate-400 text-xs">{state.myPlayers.length}/{state.picks_per_team} joueurs</div>
        </div>
        <div className="text-right">
          <div className="text-brand font-black text-xl">{state.myCredits}</div>
          <div className="text-slate-500 text-xs">crédits</div>
        </div>
      </div>

      {/* Roster chips */}
      <div className="px-4 pt-3 flex gap-1.5 flex-wrap">
        {state.myPlayers.map(p => (
          <span key={p.id} className={`text-xs px-2 py-1 rounded-lg font-semibold ${TIER_CONFIG[p.tier ?? 'bronze'].color} bg-slate-800`}>
            {TIER_EMOJI[p.tier ?? 'bronze']} {p.name.split(' ').pop()}
          </span>
        ))}
        {Array.from({ length: Math.max(0, state.picks_per_team - state.myPlayers.length) }).map((_, i) => (
          <span key={i} className="text-xs px-3 py-1 rounded-lg bg-slate-800 border border-dashed border-slate-600 text-slate-600">?</span>
        ))}
      </div>

      {error && (
        <div className="mx-4 mt-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 text-red-400 text-xs">{error}</div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-6">

        {/* ── LOBBY ── */}
        {phase === 'lobby' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
            <AnimatePresence>
              {lastPicked && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className={`mb-4 p-3 rounded-xl border text-center bg-gradient-to-br ${TIER_CONFIG[lastPicked.tier].bg} border-slate-600`}>
                  <div className={`font-black text-sm ${TIER_CONFIG[lastPicked.tier].color}`}>
                    {TIER_EMOJI[lastPicked.tier]} {lastPicked.name} drafté !
                  </div>
                  <div className="text-slate-400 text-xs">{lastPicked.team} · {lastPicked.season_avg_fantasy.toFixed(1)} pts fantasy</div>
                </motion.div>
              )}
            </AnimatePresence>

            {rosterFull ? (
              <div className="text-center">
                <div className="text-4xl mb-3">🎉</div>
                <div className="text-slate-100 font-black text-lg mb-1">Roster complet !</div>
                <div className="text-slate-400 text-sm mb-4">En attente des autres managers…</div>
              </div>
            ) : (
              <>
                <div className="text-center mb-5">
                  <div className="text-slate-400 text-sm">Choisis un pack à ouvrir</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {TIER_ORDER.map(tier => {
                    const cfg = TIER_CONFIG[tier];
                    const canAfford = state.myCredits >= PACK_PRICES[tier];
                    return (
                      <motion.button
                        key={tier}
                        whileTap={{ scale: 0.95 }}
                        disabled={!canAfford || loading}
                        onClick={() => openPack(tier)}
                        className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                          canAfford
                            ? `bg-gradient-to-br ${cfg.bg} border-slate-600 active:border-slate-400`
                            : 'bg-slate-800/30 border-slate-700/30 opacity-40'
                        }`}
                      >
                        <div className="text-2xl mb-1">{TIER_EMOJI[tier]}</div>
                        <div className={`font-black text-sm ${cfg.color}`}>{cfg.label}</div>
                        <div className="text-slate-400 text-xs mt-0.5">3 cartes</div>
                        <div className={`absolute top-3 right-3 font-black text-xs ${canAfford ? cfg.color : 'text-slate-600'}`}>
                          {PACK_PRICES[tier]}cr
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
                <div className="mt-4 text-center text-xs text-slate-600">
                  Chaque pack révèle 3 joueurs · Tu en gardes 1
                </div>

                {state.isCommissioner && state.hasBots && (
                  <motion.button
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={draftBots}
                    disabled={botDrafting}
                    className="mt-4 w-full py-2.5 rounded-xl bg-slate-700/60 border border-slate-600 text-slate-300 text-sm font-semibold flex items-center justify-center gap-2 active:bg-slate-700"
                  >
                    {botDrafting
                      ? <><span className="animate-spin">⚙️</span> Bots en train de drafter…</>
                      : '🤖 Faire drafter les bots'}
                  </motion.button>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* ── OPENING / PICKING ── */}
        {(phase === 'opening' || phase === 'picking') && (
          <div className="w-full max-w-sm">
            <div className="text-center mb-4">
              <div className="text-slate-400 text-sm">
                {phase === 'opening' ? 'Révélation en cours…' : 'Choisis ton joueur'}
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              {packPlayers.map((player, i) => {
                const cfg = TIER_CONFIG[player.tier];
                const isChosen = chosenId === player.id;
                const isRejected = rejectedIds.has(player.id);
                return (
                  <motion.div
                    key={player.id}
                    style={{ perspective: 1000 }}
                    className="flex-1"
                    animate={isChosen ? { scale: 1.08 } : isRejected ? { scale: 0.88, opacity: 0.3 } : { scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <motion.div
                      style={{ transformStyle: 'preserve-3d', position: 'relative', height: 180 }}
                      animate={{ rotateY: revealed[i] ? 180 : 0 }}
                      transition={{ duration: 0.55, ease: 'easeInOut' }}
                    >
                      {/* Card back */}
                      <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                        className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 border-2 border-slate-600 flex items-center justify-center overflow-hidden">
                        <motion.div
                          animate={{ opacity: [0.3, 0.8, 0.3] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="text-4xl">🏀</motion.div>
                      </div>
                      {/* Card front */}
                      <div
                        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                        className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${cfg.bg} border-2 flex flex-col p-2 overflow-hidden cursor-pointer ${
                          phase === 'picking' && !chosenId ? 'border-slate-500 hover:border-slate-300' : 'border-slate-700'
                        } ${isChosen ? `shadow-lg ${cfg.glow}` : ''}`}
                        onClick={() => phase === 'picking' && !chosenId && pickPlayer(player)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-black ${cfg.color}`}>{TIER_EMOJI[player.tier]} {cfg.label}</span>
                          <span className="text-[10px] text-slate-500 bg-slate-800/60 px-1 rounded">{player.position}</span>
                        </div>
                        <div className="flex-1 flex items-center justify-center">
                          {player.photo_url
                            ? <Image src={player.photo_url} alt={player.name} width={48} height={48} className="rounded-full object-cover" unoptimized />
                            : <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-xs font-bold">
                                #{player.jersey_number ?? '?'}
                              </div>
                          }
                        </div>
                        <div className="text-center mt-1">
                          <div className="text-slate-100 font-bold text-[11px] leading-tight truncate">{player.name.split(' ').pop()}</div>
                          <div className="text-slate-500 text-[9px] truncate">{player.team}</div>
                          <div className={`font-black text-sm mt-0.5 ${cfg.color}`}>{player.season_avg_fantasy.toFixed(1)}</div>
                          <div className="text-slate-600 text-[9px]">pts/match</div>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
            {phase === 'picking' && !chosenId && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-center text-xs text-slate-500">
                Tape sur une carte pour la choisir
              </motion.div>
            )}
          </div>
        )}

        {/* ── DONE ── */}
        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center px-4">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-3xl font-black text-slate-100 mb-2">Draft terminée !</h1>
            <p className="text-slate-400 mb-6">Ton équipe est prête. Bonne chance !</p>
            <button className="btn-primary max-w-xs" onClick={() => router.push(`/leagues/${leagueId}/team`)}>
              Voir mon équipe
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

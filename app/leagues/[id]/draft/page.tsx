'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import {
  AUCTION_TIER_CONFIG, TIER_MIN_BIDS,
  type AuctionTier, type PositionGroup,
} from '@/lib/fantasy';

const fmt = (n: number) => '$' + n.toLocaleString('fr-FR');

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Expiré';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface AuctionPlayer {
  id: number; name: string; team: string; position: string;
  tier: AuctionTier; photo_url: string | null; jersey_number: number | null;
  season_avg_fantasy: number; avg_points: number; avg_assists: number; avg_rebounds: number;
}

interface PackWinner { userId: string; username: string; amount: number; }

interface CurrentPack {
  id: string; packNumber: number; status: 'bidding' | 'closed';
  players: AuctionPlayer[];
  myBids: Record<number, number>;
  submittedUserIds: string[];
  winners: Record<string, PackWinner | null> | null;
  expiresAt: string | null;
}

interface Member {
  userId: string; username: string; avatarColor: string;
  isBot: boolean; playerCount: number; credits: number; hasSubmitted: boolean;
}

interface AuctionState {
  isCommissioner: boolean;
  myCredits: number;
  myRemainingSlots: Record<PositionGroup, number>;
  members: Member[];
  currentPack: CurrentPack | null;
  draftComplete: boolean;
}

const TIER_EMOJI: Record<AuctionTier, string> = { elite: '💜', star: '⭐', basique: '⚪' };

export default function DraftPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const router = useRouter();

  const [state, setState] = useState<AuctionState | null>(null);
  const [localBids, setLocalBids] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState('');
  const lastPackIdRef = useRef<string | null>(null);
  const autoClosingRef = useRef(false);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/draft/${leagueId}/auction-state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data: AuctionState = await res.json();
    setState(data);

    if (data.currentPack?.id !== lastPackIdRef.current) {
      lastPackIdRef.current = data.currentPack?.id ?? null;
      const serverBids = data.currentPack?.myBids ?? {};
      const hasServerBids = Object.values(serverBids).some(v => v > 0);
      if (!hasServerBids && data.currentPack) {
        const prefilled: Record<number, number> = {};
        for (const p of data.currentPack.players) {
          prefilled[p.id] = TIER_MIN_BIDS[p.tier];
        }
        setLocalBids(prefilled);
      } else {
        setLocalBids(serverBids);
      }
    }

    // Auto-close expired packs (any member can trigger)
    if (
      data.currentPack?.status === 'bidding' &&
      data.currentPack?.expiresAt &&
      new Date(data.currentPack.expiresAt).getTime() < Date.now() &&
      !autoClosingRef.current
    ) {
      autoClosingRef.current = true;
      try {
        await fetch(`/api/draft/${leagueId}/auto-close`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } finally {
        autoClosingRef.current = false;
      }
    }

    setLoading(false);
  }, [token, leagueId]);

  useEffect(() => {
    if (!token) { router.replace('/auth'); return; }
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [token, leagueId]);

  // Live countdown
  useEffect(() => {
    const expiresAt = state?.currentPack?.expiresAt;
    if (!expiresAt || state?.currentPack?.status !== 'bidding') { setCountdown(''); return; }
    const tick = () => setCountdown(fmtCountdown(new Date(expiresAt).getTime() - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [state?.currentPack?.expiresAt, state?.currentPack?.status]);

  const drawPack = async () => {
    if (!token) return;
    setDrawing(true);
    setError('');
    const res = await fetch(`/api/draft/${leagueId}/draw-pack`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setDrawing(false);
    if (!res.ok) { setError(data.error); return; }
    await load();
  };

  const submitBids = async () => {
    if (!token || !state?.currentPack) return;
    setSubmitting(true);
    setError('');
    const bidsToSend: Record<string, number> = {};
    for (const p of state.currentPack.players) {
      bidsToSend[String(p.id)] = localBids[p.id] ?? 0;
    }
    const res = await fetch(`/api/draft/${leagueId}/submit-bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bids: bidsToSend }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error); return; }
    await load();
  };

  const closePack = async () => {
    if (!token) return;
    setClosing(true);
    setError('');
    const res = await fetch(`/api/draft/${leagueId}/close-pack`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setClosing(false);
    if (!res.ok) { setError(data.error); return; }
    if (data.draftComplete) { router.replace(`/leagues/${leagueId}/team`); return; }
    await load();
  };

  if (loading && !state) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-900">
        <div className="text-5xl animate-bounce">🏀</div>
      </div>
    );
  }
  if (!state) return null;

  if (state.draftComplete) {
    return (
      <div className="flex flex-col min-h-dvh bg-slate-900 items-center justify-center px-4 text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-3xl font-black text-slate-100 mb-2">Draft terminée !</h1>
        <p className="text-slate-400 mb-6">Tous les managers ont leur roster complet. Bonne chance !</p>
        <button className="btn-primary max-w-xs" onClick={() => router.push(`/leagues/${leagueId}/team`)}>
          Voir mon équipe →
        </button>
      </div>
    );
  }

  const pack = state.currentPack;
  const myId = user?.id ?? '';
  const hasSubmitted = pack?.submittedUserIds.includes(myId) ?? false;
  const submittedCount = pack?.submittedUserIds.length ?? 0;
  const totalMembers = state.members.length;
  const allSubmitted = submittedCount >= totalMembers;

  const totalBid = Object.values(localBids).reduce((s, v) => s + (v || 0), 0);
  const budgetAfterBids = state.myCredits - totalBid;
  const budgetOk = budgetAfterBids >= 0;

  const isExpired = pack?.status === 'bidding' && pack.expiresAt
    ? new Date(pack.expiresAt).getTime() < Date.now()
    : false;

  return (
    <div className="flex flex-col min-h-dvh bg-slate-900">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
        <div>
          <div className="text-slate-100 font-black text-base">Draft · Enchères</div>
          {pack && (
            <div className="text-slate-400 text-xs flex items-center gap-2">
              <span>Pack #{pack.packNumber}</span>
              {pack.status === 'bidding' && (
                <>
                  <span>· {submittedCount}/{totalMembers} soumis</span>
                  {countdown && (
                    <span className={`font-semibold ${isExpired ? 'text-red-400' : 'text-slate-400'}`}>
                      · ⏱ {countdown}
                    </span>
                  )}
                </>
              )}
              {pack.status === 'closed' && <span>· Résultats</span>}
            </div>
          )}
          {!pack && <div className="text-slate-400 text-xs">Prêt à démarrer</div>}
        </div>
        <div className="text-right">
          <div className="text-brand font-black text-xl">{fmt(state.myCredits)}</div>
          <div className="text-slate-500 text-xs">budget restant</div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 text-red-400 text-xs">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">

        {/* ── NO PACK ── */}
        {!pack && (
          <div>
            <div className="text-center py-8">
              <div className="text-4xl mb-3">📦</div>
              {state.isCommissioner ? (
                <>
                  <div className="text-slate-100 font-bold text-base mb-1">Prêt à tirer un pack ?</div>
                  <div className="text-slate-500 text-sm mb-1">5 joueurs · Enchères silencieuses · 12h pour miser</div>
                  <div className="text-slate-600 text-xs mb-5">
                    Élite min {fmt(30_000)} · Star min {fmt(10_000)} · Basique gratuit
                  </div>
                  <button onClick={drawPack} disabled={drawing} className="btn-primary max-w-xs">
                    {drawing ? '⏳ Tirage…' : '🏄 Tirer le pack #1'}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-slate-300 font-bold text-base mb-1">En attente…</div>
                  <div className="text-slate-500 text-sm">Le commissaire va tirer le premier pack.</div>
                </>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-3">Budgets</div>
              {state.members.map(m => (
                <div key={m.userId} className={`flex items-center gap-3 py-2 px-3 rounded-xl ${m.userId === myId ? 'bg-brand/10 border border-brand/20' : 'bg-slate-800'}`}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-slate-900 flex-shrink-0"
                    style={{ backgroundColor: m.avatarColor }}>
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-xs font-semibold truncate">
                      {m.username}{m.userId === myId && <span className="text-brand ml-1">(moi)</span>}
                    </div>
                    <div className="text-slate-500 text-[10px]">{m.playerCount} joueur{m.playerCount !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-black text-brand">{fmt(m.credits)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PACK OPEN ── */}
        {pack && pack.status === 'bidding' && (
          <div>
            {hasSubmitted ? (
              /* Waiting view */
              <div>
                <div className="text-center py-4 mb-4 bg-green-500/10 border border-green-500/20 rounded-2xl">
                  <div className="text-2xl mb-1">✅</div>
                  <div className="text-slate-100 font-bold text-sm">Enchères soumises !</div>
                  <div className="text-slate-400 text-xs mt-0.5">
                    En attente des autres ({submittedCount}/{totalMembers})
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {pack.players.map(player => {
                    const cfg = AUCTION_TIER_CONFIG[player.tier];
                    const myBid = pack.myBids[player.id] ?? 0;
                    const tierMin = TIER_MIN_BIDS[player.tier];
                    return (
                      <div key={player.id} className={`rounded-xl border p-2.5 flex items-center gap-2.5 ${cfg.bg}`}>
                        <span className={`text-[10px] font-black ${cfg.color} w-14 text-center shrink-0`}>
                          {TIER_EMOJI[player.tier]} {cfg.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-100 font-semibold text-xs truncate">{player.name}</div>
                          <div className="text-slate-500 text-[10px]">{player.position} · {player.team}</div>
                        </div>
                        <div className={`font-black text-sm flex-shrink-0 ${myBid >= tierMin && myBid > 0 ? 'text-brand' : myBid === 0 && tierMin === 0 ? 'text-slate-400' : 'text-slate-600'}`}>
                          {myBid >= tierMin || tierMin === 0 ? fmt(myBid) : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {state.isCommissioner && (
                  <div className="space-y-2">
                    {allSubmitted && (
                      <button onClick={closePack} disabled={closing} className="btn-primary w-full py-3">
                        {closing ? '⏳ Résolution…' : '🔒 Fermer les enchères'}
                      </button>
                    )}
                    {!allSubmitted && (
                      <button onClick={closePack} disabled={closing}
                        className="w-full py-2 rounded-xl bg-slate-700/60 border border-slate-600 text-slate-400 text-sm font-semibold">
                        {closing ? '⏳…' : '⏭ Fermer quand même'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Bid input view */
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-slate-300 text-sm font-semibold">Tes enchères</div>
                  <div className={`text-sm font-black ${budgetOk ? 'text-brand' : 'text-red-400'}`}>
                    {fmt(budgetAfterBids)} restants
                  </div>
                </div>

                <div className="mb-3 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${budgetOk ? 'bg-brand' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, (totalBid / Math.max(1, state.myCredits)) * 100)}%` }}
                  />
                </div>

                <div className="space-y-2.5 mb-4">
                  {pack.players.map(player => {
                    const cfg = AUCTION_TIER_CONFIG[player.tier];
                    const tierMin = TIER_MIN_BIDS[player.tier];
                    const canAfford = state.myCredits >= tierMin || tierMin === 0;
                    const currentBid = localBids[player.id] ?? tierMin;

                    return (
                      <div key={player.id} className={`rounded-2xl border p-3 ${cfg.bg} ${!canAfford ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-800/60 flex items-center justify-center text-xs font-bold text-slate-400 flex-shrink-0">
                            #{player.jersey_number ?? player.position[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <span className={`text-[10px] font-black ${cfg.color}`}>
                                {TIER_EMOJI[player.tier]} {cfg.label}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                min {fmt(tierMin)}
                              </span>
                            </div>
                            <div className="text-slate-100 font-bold text-sm truncate">{player.name}</div>
                            <div className="text-slate-400 text-[11px]">
                              {player.position} · {player.team} · <span className="text-slate-300">{player.season_avg_fantasy.toFixed(1)}</span> pts
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            {!canAfford ? (
                              <div className="text-slate-600 text-xs font-bold text-center w-20">$0<br/><span className="text-[10px]">budget insuf.</span></div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-slate-500 text-xs">$</span>
                                <input
                                  type="number"
                                  min={tierMin}
                                  step={1000}
                                  max={state.myCredits}
                                  value={currentBid || ''}
                                  placeholder={String(tierMin)}
                                  onChange={e => {
                                    const raw = parseInt(e.target.value) || 0;
                                    const val = raw === 0 ? 0 : Math.max(tierMin, Math.min(state.myCredits, raw));
                                    setLocalBids(prev => ({ ...prev, [player.id]: val }));
                                  }}
                                  className="w-20 bg-slate-900/60 border border-slate-600 rounded-lg px-2 py-1.5 text-center text-slate-100 font-bold text-sm focus:outline-none focus:border-brand"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!budgetOk && (
                  <div className="text-center text-red-400 text-xs mb-2">
                    Budget dépassé de {fmt(Math.abs(budgetAfterBids))}
                  </div>
                )}

                <button
                  onClick={submitBids}
                  disabled={submitting || !budgetOk}
                  className={`btn-primary w-full py-3 ${!budgetOk ? 'opacity-40' : ''}`}
                >
                  {submitting ? '⏳ Envoi…' : `Soumettre · ${fmt(totalBid)}`}
                </button>

                {state.isCommissioner && (
                  <button onClick={closePack} disabled={closing}
                    className="mt-2 w-full py-2 rounded-xl bg-slate-700/60 border border-slate-600 text-slate-400 text-sm font-semibold">
                    {closing ? '⏳…' : '⏭ Forcer la fermeture'}
                  </button>
                )}
              </div>
            )}

            {/* Submission progress pills */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {state.members.map(m => (
                <div key={m.userId} className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                  pack.submittedUserIds.includes(m.userId)
                    ? 'bg-green-500/20 text-green-300 border border-green-500/20'
                    : 'bg-slate-700 text-slate-500 border border-slate-700'
                }`}>
                  <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.avatarColor }} />
                  {m.username}{pack.submittedUserIds.includes(m.userId) ? ' ✓' : ' …'}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PACK CLOSED (RESULTS) ── */}
        {pack && pack.status === 'closed' && (
          <div>
            <div className="text-center mb-4">
              <div className="text-2xl mb-1">🏆</div>
              <div className="text-slate-100 font-black text-base">Résultats — Pack #{pack.packNumber}</div>
            </div>

            <div className="space-y-2.5 mb-5">
              {pack.players.map(player => {
                const cfg = AUCTION_TIER_CONFIG[player.tier];
                const winnerInfo = pack.winners?.[String(player.id)];
                const iMeWon = winnerInfo?.userId === myId;

                return (
                  <div key={player.id} className={`rounded-2xl border p-3 ${
                    iMeWon ? 'bg-brand/10 border-brand/40' : winnerInfo ? cfg.bg : 'bg-slate-800/40 border-slate-700 opacity-50'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-800/60 flex items-center justify-center text-xs font-bold text-slate-400 flex-shrink-0">
                        #{player.jersey_number ?? player.position[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[10px] font-black ${cfg.color} mb-0.5`}>
                          {TIER_EMOJI[player.tier]} {cfg.label}
                        </div>
                        <div className="text-slate-100 font-bold text-sm truncate">{player.name}</div>
                        <div className="text-slate-400 text-[11px]">{player.position} · {player.team}</div>
                      </div>
                      <div className="flex-shrink-0 text-right min-w-[80px]">
                        {winnerInfo ? (
                          <>
                            <div className={`font-black text-sm ${iMeWon ? 'text-brand' : 'text-slate-200'}`}>
                              {iMeWon ? '🎉 Toi' : winnerInfo.username}
                            </div>
                            <div className="text-xs text-slate-400">{fmt(winnerInfo.amount)}</div>
                          </>
                        ) : (
                          <div className="text-xs text-slate-600">Non attribué</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {state.isCommissioner ? (
              <button onClick={drawPack} disabled={drawing} className="btn-primary w-full py-3">
                {drawing ? '⏳ Tirage…' : '🏄 Tirer le prochain pack'}
              </button>
            ) : (
              <div className="text-center text-slate-500 text-sm py-2">
                En attente du prochain pack par le commissaire…
              </div>
            )}

            {/* Budgets */}
            <div className="mt-5 space-y-2">
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">Budgets restants</div>
              {state.members.map(m => (
                <div key={m.userId} className={`flex items-center gap-3 py-1.5 px-3 rounded-xl ${m.userId === myId ? 'bg-brand/10 border border-brand/20' : 'bg-slate-800/60'}`}>
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-black text-slate-900"
                    style={{ backgroundColor: m.avatarColor }}>
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 text-slate-300 text-xs font-semibold truncate">
                    {m.username}{m.userId === myId && <span className="text-brand ml-1">(moi)</span>}
                  </div>
                  <div className="text-[10px] text-slate-500 mr-2">{m.playerCount} joueurs</div>
                  <div className="text-xs font-black text-brand">{fmt(m.credits)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

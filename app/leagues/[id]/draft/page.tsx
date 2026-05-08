'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import {
  AUCTION_TIER_CONFIG,
  type AuctionTier, type PositionGroup,
} from '@/lib/fantasy';

const MIN_BID = 10_000;
const fmt = (n: number) => '$' + n.toLocaleString('fr-FR');

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
  const lastPackIdRef = useRef<string | null>(null);

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
      if (!hasServerBids && data.currentPack && data.myCredits >= MIN_BID * data.currentPack.players.length) {
        const prefilled: Record<number, number> = {};
        for (const p of data.currentPack.players) prefilled[p.id] = MIN_BID;
        setLocalBids(prefilled);
      } else {
        setLocalBids(serverBids);
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
        <p className="text-slate-400 mb-6">Plus personne n'a assez de budget. Bonne chance !</p>
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
  const packSize = pack?.players.length ?? 5;
  const canAffordMin = state.myCredits >= MIN_BID * packSize;

  return (
    <div className="flex flex-col min-h-dvh bg-slate-900">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
        <div>
          <div className="text-slate-100 font-black text-base">Draft · Enchères</div>
          {pack && (
            <div className="text-slate-400 text-xs">
              Pack #{pack.packNumber} · {pack.status === 'bidding' ? `${submittedCount}/${totalMembers} soumis` : 'Résultats'}
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
                  <div className="text-slate-500 text-sm mb-5">
                    5 joueurs révélés à tous · Enchères silencieuses · Le plus offrant gagne · Min {fmt(MIN_BID)}/joueur
                  </div>
                  <button onClick={drawPack} disabled={drawing} className="btn-primary max-w-xs">
                    {drawing ? '⏳ Tirage…' : '🎴 Tirer le pack #1'}
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
                    <div className="text-slate-500 text-[10px]">{m.playerCount} joueur{m.playerCount > 1 ? 's' : ''}</div>
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
                    return (
                      <div key={player.id} className={`rounded-xl border p-2.5 flex items-center gap-2.5 ${cfg.bg}`}>
                        <span className={`text-[10px] font-black ${cfg.color} w-12 text-center`}>{TIER_EMOJI[player.tier]} {cfg.label}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-100 font-semibold text-xs truncate">{player.name}</div>
                          <div className="text-slate-500 text-[10px]">{player.position} · {player.team}</div>
                        </div>
                        <div className={`font-black text-sm flex-shrink-0 ${myBid > 0 ? 'text-brand' : 'text-slate-600'}`}>
                          {myBid > 0 ? fmt(myBid) : '—'}
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
                      <button
                        onClick={closePack}
                        disabled={closing}
                        className="w-full py-2 rounded-xl bg-slate-700/60 border border-slate-600 text-slate-400 text-sm font-semibold"
                      >
                        {closing ? '⏳…' : '⏭ Fermer quand même'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Bid input view */
              <div>
                {!canAffordMin ? (
                  /* Budget épuisé */
                  <div className="text-center py-6 mb-4 bg-slate-800 border border-slate-700 rounded-2xl">
                    <div className="text-3xl mb-2">💸</div>
                    <div className="text-slate-300 font-bold text-sm mb-1">Budget insuffisant</div>
                    <div className="text-slate-500 text-xs mb-4">
                      Il faut au moins {fmt(MIN_BID * packSize)} pour enchérir sur ce pack.
                      <br />Vous misez automatiquement 0$ sur tous les joueurs.
                    </div>
                    <button onClick={submitBids} disabled={submitting} className="btn-primary max-w-xs">
                      {submitting ? '⏳…' : 'Confirmer (0$ sur tout)'}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-slate-300 text-sm font-semibold">Tes enchères · min {fmt(MIN_BID)}/joueur</div>
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
                        const currentBid = localBids[player.id] ?? MIN_BID;

                        return (
                          <div key={player.id} className={`rounded-2xl border p-3 ${cfg.bg}`}>
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-slate-800/60 flex items-center justify-center text-xs font-bold text-slate-400 flex-shrink-0">
                                #{player.jersey_number ?? player.position[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={`text-[10px] font-black ${cfg.color}`}>
                                    {TIER_EMOJI[player.tier]} {cfg.label}
                                  </span>
                                </div>
                                <div className="text-slate-100 font-bold text-sm truncate">{player.name}</div>
                                <div className="text-slate-400 text-[11px]">
                                  {player.position} · {player.team} · <span className="text-slate-300">{player.season_avg_fantasy.toFixed(1)}</span> pts
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-500 text-xs">$</span>
                                  <input
                                    type="number"
                                    min={MIN_BID}
                                    step={1000}
                                    max={state.myCredits}
                                    value={currentBid || ''}
                                    placeholder={String(MIN_BID)}
                                    onChange={e => {
                                      const val = Math.max(MIN_BID, Math.min(state.myCredits, parseInt(e.target.value) || MIN_BID));
                                      setLocalBids(prev => ({ ...prev, [player.id]: val }));
                                    }}
                                    className="w-20 bg-slate-900/60 border border-slate-600 rounded-lg px-2 py-1.5 text-center text-slate-100 font-bold text-sm focus:outline-none focus:border-brand"
                                  />
                                </div>
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
                  </>
                )}

                {state.isCommissioner && (
                  <button
                    onClick={closePack}
                    disabled={closing}
                    className="mt-2 w-full py-2 rounded-xl bg-slate-700/60 border border-slate-600 text-slate-400 text-sm font-semibold"
                  >
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
                  <div className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: m.avatarColor }} />
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
                {drawing ? '⏳ Tirage…' : '🎴 Tirer le prochain pack'}
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

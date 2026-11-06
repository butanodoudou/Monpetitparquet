'use client';
import TierPips from '@/components/TierPips';
import { formatPoints } from '@/lib/format';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import { apiFetch } from '@/lib/api-client';
import {
  AUCTION_TIER_CONFIG, TIER_MIN_BIDS, GROUP_LABELS, ROSTER_SLOTS, getPositionGroup,
  type AuctionTier, type PositionGroup,
} from '@/lib/fantasy';

const fmt = (n: number) => `${n.toLocaleString('fr-FR')} €`;

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
  id: string; packNumber: number; status: 'bidding' | 'closing' | 'closed';
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
  const [loadError, setLoadError] = useState('');
  const [countdown, setCountdown] = useState('');
  const lastPackIdRef = useRef<string | null>(null);
  const autoClosingRef = useRef(false);

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Erreur inattendue');

  const load = useCallback(async () => {
    if (!token) return;
    let data: AuctionState;
    try {
      data = await apiFetch<AuctionState>(`/api/draft/${leagueId}/auction-state`);
    } catch (e) {
      // On garde l'état précédent s'il existe ; sinon on affiche l'erreur (plus de spinner infini)
      setLoadError(errMsg(e));
      setLoading(false);
      return;
    }
    if (!data) { setLoadError('Réponse vide du serveur'); setLoading(false); return; }
    setLoadError('');
    setState(data);

    if (data.currentPack?.id !== lastPackIdRef.current) {
      lastPackIdRef.current = data.currentPack?.id ?? null;
      const serverBids = data.currentPack?.myBids ?? {};
      const hasServerBids = Object.values(serverBids).some(v => v > 0);
      if (!hasServerBids && data.currentPack) {
        const prefilled: Record<number, number> = {};
        const sl = data.myRemainingSlots;
        for (const p of data.currentPack.players) {
          const g = getPositionGroup(p.position);
          const ok = !g || (sl?.[g] ?? 0) > 0;
          prefilled[p.id] = ok ? TIER_MIN_BIDS[p.tier] : 0;
        }
        setLocalBids(prefilled);
      } else {
        setLocalBids(serverBids);
      }
    }

    // Auto-close : pack expiré, ou bloqué en résolution (le serveur vérifie le délai de 2 min)
    const pk = data.currentPack;
    const expired = pk?.status === 'bidding' && !!pk.expiresAt && new Date(pk.expiresAt).getTime() < Date.now();
    if ((expired || pk?.status === 'closing') && !autoClosingRef.current) {
      autoClosingRef.current = true;
      try {
        await apiFetch(`/api/draft/${leagueId}/auto-close`, { method: 'POST' });
      } catch {
        // silencieux : le prochain cycle de polling réessaiera
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
    try {
      await apiFetch(`/api/draft/${leagueId}/draw-pack`, { method: 'POST' });
    } catch (e) {
      setError(errMsg(e));
      return;
    } finally {
      setDrawing(false);
    }
    await load();
  };

  const submitBids = async () => {
    if (!token || !state?.currentPack) return;
    setSubmitting(true);
    setError('');
    const bidsToSend: Record<string, number> = {};
    for (const p of state.currentPack.players) {
      const g = getPositionGroup(p.position);
      const ok = !g || (state.myRemainingSlots?.[g] ?? 0) > 0;
      bidsToSend[String(p.id)] = ok ? (localBids[p.id] ?? 0) : 0;
    }
    try {
      await apiFetch(`/api/draft/${leagueId}/submit-bids`, {
        method: 'POST',
        body: JSON.stringify({ bids: bidsToSend }),
      });
    } catch (e) {
      setError(errMsg(e));
      return;
    } finally {
      setSubmitting(false);
    }
    await load();
  };

  const closePack = async () => {
    if (!token) return;
    setClosing(true);
    setError('');
    let data: any;
    try {
      data = await apiFetch(`/api/draft/${leagueId}/close-pack`, { method: 'POST' });
    } catch (e) {
      setError(errMsg(e));
      return;
    } finally {
      setClosing(false);
    }
    if (data?.draftComplete) { router.replace(`/leagues/${leagueId}/team`); return; }
    await load();
  };

  if (loading && !state) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper">
        <div className="w-8 h-8 rounded-full border-2 border-line border-t-brass animate-spin" />
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex flex-col min-h-dvh bg-paper">
        <TopBar title="Draft · Enchères" backHref={`/leagues/${leagueId}`} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-ink2 font-semibold mb-1">Impossible de charger la draft</p>
          <p className="text-muted text-sm mb-5">{loadError || 'Erreur inconnue'}</p>
          <button className="btn-primary max-w-xs" onClick={() => { setLoading(true); load(); }}>Réessayer</button>
        </div>
      </div>
    );
  }

  if (state.draftComplete) {
    return (
      <div className="flex flex-col min-h-dvh bg-paper items-center justify-center px-4 text-center">
        <h1 className="text-3xl font-black text-ink mb-2">Draft terminée !</h1>
        <p className="text-ink2 mb-6">Tous les managers ont leur roster complet. Bonne chance !</p>
        <button className="btn-primary max-w-xs" onClick={() => router.push(`/leagues/${leagueId}/team`)}>
          Voir mon équipe →
        </button>
      </div>
    );
  }

  const pack = state.currentPack;
  const slots = state.myRemainingSlots;
  // Un joueur est éligible s'il reste une place à son poste (poste inconnu : toléré)
  const isEligible = (position: string) => {
    const g = getPositionGroup(position);
    return !g || (slots?.[g] ?? 0) > 0;
  };

  const myId = user?.id ?? '';
  const hasSubmitted = pack?.submittedUserIds.includes(myId) ?? false;
  const submittedCount = pack?.submittedUserIds.length ?? 0;
  const totalMembers = state.members.length;
  const allSubmitted = submittedCount >= totalMembers;

  const totalBid = (pack?.players ?? []).reduce((s, p) => s + (isEligible(p.position) ? (localBids[p.id] || 0) : 0), 0);
  const budgetAfterBids = state.myCredits - totalBid;
  const budgetOk = budgetAfterBids >= 0;

  const isExpired = pack?.status === 'bidding' && pack.expiresAt
    ? new Date(pack.expiresAt).getTime() < Date.now()
    : false;

  return (
    <div className="flex flex-col min-h-dvh bg-paper">
      <TopBar title="Draft · Enchères" backHref={`/leagues/${leagueId}`} />
      {loadError && (
        <div className="mx-4 mt-2 bg-brand/10 border border-brand/30 rounded-xl px-4 py-2 text-brand text-xs">
          Connexion instable : {loadError}. Nouvelle tentative automatique…
        </div>
      )}
      {/* Header */}
      <div className="px-4 py-3 bg-surface/80 border-b border-line flex items-center justify-between">
        <div>
          {pack && (
            <div className="text-ink2 text-xs flex items-center gap-2">
              <span>Pack #{pack.packNumber}</span>
              {pack.status === 'bidding' && (
                <>
                  <span>· {submittedCount}/{totalMembers} soumis</span>
                  {countdown && (
                    <span className={`font-semibold ${isExpired ? 'text-red-700' : 'text-ink2'}`}>
                      · {countdown}
                    </span>
                  )}
                </>
              )}
              {pack.status === 'closing' && <span>· Résolution en cours…</span>}
              {pack.status === 'closed' && <span>· Résultats</span>}
            </div>
          )}
          {!pack && <div className="text-ink2 text-xs">Prêt à démarrer</div>}
        </div>
        <div className="text-right">
          <div className="text-brand font-black text-xl">{fmt(state.myCredits)}</div>
          <div className="text-muted text-xs">budget restant</div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 text-red-700 text-xs">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">

        {/* Places restantes par poste */}
        <div className="mb-3 flex gap-1.5">
          {(Object.keys(ROSTER_SLOTS) as PositionGroup[]).map(g => (
            <div key={g} className={`flex-1 rounded-xl px-2 py-1.5 text-center border ${
              (slots?.[g] ?? 0) > 0 ? 'bg-surface border-line' : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className={`text-sm font-black ${(slots?.[g] ?? 0) > 0 ? 'text-ink' : 'text-red-700'}`}>
                {slots?.[g] ?? 0}/{ROSTER_SLOTS[g]}
              </div>
              <div className="text-[10px] text-muted">{GROUP_LABELS[g]} libres</div>
            </div>
          ))}
        </div>

        {/* ── RÉSOLUTION EN COURS ── */}
        {pack && pack.status === 'closing' && (
          <div className="text-center py-12">
            <div className="w-8 h-8 rounded-full border-2 border-line border-t-brass animate-spin" />
            <div className="text-ink font-bold text-base mb-1">Résolution en cours…</div>
            <div className="text-muted text-sm">Les enchères du pack #{pack.packNumber} sont en train d'être attribuées.</div>
          </div>
        )}

        {/* ── NO PACK ── */}
        {!pack && (
          <div>
            <div className="text-center py-8">
              {state.isCommissioner ? (
                <>
                  <div className="text-ink font-bold text-base mb-1">Prêt à tirer un pack ?</div>
                  <div className="text-muted text-sm mb-1">5 joueurs · Enchères silencieuses · 12h pour miser</div>
                  <div className="text-muted text-xs mb-5">
                    Élite min {fmt(30_000)} · Star min {fmt(10_000)} · Basique gratuit
                  </div>
                  <button onClick={drawPack} disabled={drawing} className="btn-primary max-w-xs">
                    {drawing ? 'Tirage…' : 'Tirer le pack #1'}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-ink2 font-bold text-base mb-1">En attente…</div>
                  <div className="text-muted text-sm">Le commissaire va tirer le premier pack.</div>
                </>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-xs text-muted font-semibold mb-3">Budgets</div>
              {state.members.map(m => (
                <div key={m.userId} className={`flex items-center gap-3 py-2 px-3 rounded-xl ${m.userId === myId ? 'bg-brand/10 border border-brand/20' : 'bg-surface'}`}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-ink flex-shrink-0"
                    style={{ backgroundColor: m.avatarColor }}>
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-ink text-xs font-semibold truncate">
                      {m.username}{m.userId === myId && <span className="text-brand ml-1">(moi)</span>}
                    </div>
                    <div className="text-muted text-[10px]">{m.playerCount} joueur{m.playerCount !== 1 ? 's' : ''}</div>
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
                  <div className="text-ink font-bold text-sm">Enchères soumises !</div>
                  <div className="text-ink2 text-xs mt-0.5">
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
                          <TierPips tier={player.tier} showLabel={false} /> {cfg.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-ink font-semibold text-xs truncate">{player.name}</div>
                          <div className="text-muted text-[10px]">{player.position} · {player.team}</div>
                        </div>
                        <div className={`font-black text-sm flex-shrink-0 ${myBid >= tierMin && myBid > 0 ? 'text-brand' : myBid === 0 && tierMin === 0 ? 'text-ink2' : 'text-muted'}`}>
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
                        {closing ? 'Résolution…' : 'Fermer les enchères'}
                      </button>
                    )}
                    {!allSubmitted && (
                      <button onClick={closePack} disabled={closing}
                        className="w-full py-2 rounded-xl bg-raised/60 border border-line-strong text-ink2 text-sm font-semibold">
                        {closing ? '…' : 'Fermer quand même'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Bid input view */
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-ink2 text-sm font-semibold">Tes enchères</div>
                  <div className={`text-sm font-black ${budgetOk ? 'text-brand' : 'text-red-700'}`}>
                    {fmt(budgetAfterBids)} restants
                  </div>
                </div>

                <div className="mb-3 bg-surface rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${budgetOk ? 'bg-brand' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, (totalBid / Math.max(1, state.myCredits)) * 100)}%` }}
                  />
                </div>

                <div className="space-y-2.5 mb-4">
                  {pack.players.map(player => {
                    const cfg = AUCTION_TIER_CONFIG[player.tier];
                    const tierMin = TIER_MIN_BIDS[player.tier];
                    const eligible = isEligible(player.position);
                    const canAfford = eligible && (state.myCredits >= tierMin || tierMin === 0);
                    const currentBid = eligible ? (localBids[player.id] ?? tierMin) : 0;

                    return (
                      <div key={player.id} className={`rounded-2xl border p-3 ${cfg.bg} ${!canAfford ? 'opacity-50 grayscale' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-surface/60 flex items-center justify-center text-xs font-bold text-ink2 flex-shrink-0">
                            #{player.jersey_number ?? player.position[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <span className={`text-[10px] font-black ${cfg.color}`}>
                                <TierPips tier={player.tier} showLabel={false} /> {cfg.label}
                              </span>
                              <span className="text-[10px] text-muted">
                                min {fmt(tierMin)}
                              </span>
                            </div>
                            <div className="text-ink font-bold text-sm truncate">{player.name}</div>
                            <div className="text-ink2 text-[11px]">
                              {player.position} · {player.team} · <span className="text-ink2">{formatPoints(player.season_avg_fantasy)}</span> pts
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            {!canAfford ? (
                              <div className="text-muted text-xs font-bold text-center w-20">$0<br/><span className="text-[10px]">{eligible ? 'budget insuf.' : 'poste complet'}</span></div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-muted text-xs">€</span>
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
                                  className="w-20 bg-paper/60 border border-line-strong rounded-lg px-2 py-1.5 text-center text-ink font-bold text-sm focus:outline-none focus:border-brand"
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
                  <div className="text-center text-red-700 text-xs mb-2">
                    Budget dépassé de {fmt(Math.abs(budgetAfterBids))}
                  </div>
                )}

                <button
                  onClick={submitBids}
                  disabled={submitting || !budgetOk}
                  className={`btn-primary w-full py-3 ${!budgetOk ? 'opacity-40' : ''}`}
                >
                  {submitting ? 'Envoi…' : `Soumettre · ${fmt(totalBid)}`}
                </button>

                {state.isCommissioner && (
                  <button onClick={closePack} disabled={closing}
                    className="mt-2 w-full py-2 rounded-xl bg-raised/60 border border-line-strong text-ink2 text-sm font-semibold">
                    {closing ? '…' : 'Forcer la fermeture'}
                  </button>
                )}
              </div>
            )}

            {/* Submission progress pills */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {state.members.map(m => (
                <div key={m.userId} className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                  pack.submittedUserIds.includes(m.userId)
                    ? 'bg-green-500/20 text-green-700 border border-green-500/20'
                    : 'bg-raised text-muted border border-line'
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
              <div className="text-ink font-black text-base">Résultats — Pack #{pack.packNumber}</div>
            </div>

            <div className="space-y-2.5 mb-5">
              {pack.players.map(player => {
                const cfg = AUCTION_TIER_CONFIG[player.tier];
                const winnerInfo = pack.winners?.[String(player.id)];
                const iMeWon = winnerInfo?.userId === myId;

                return (
                  <div key={player.id} className={`rounded-2xl border p-3 ${
                    iMeWon ? 'bg-brand/10 border-brand/40' : winnerInfo ? cfg.bg : 'bg-surface/40 border-line opacity-50'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-surface/60 flex items-center justify-center text-xs font-bold text-ink2 flex-shrink-0">
                        #{player.jersey_number ?? player.position[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[10px] font-black ${cfg.color} mb-0.5`}>
                          <TierPips tier={player.tier} showLabel={false} /> {cfg.label}
                        </div>
                        <div className="text-ink font-bold text-sm truncate">{player.name}</div>
                        <div className="text-ink2 text-[11px]">{player.position} · {player.team}</div>
                      </div>
                      <div className="flex-shrink-0 text-right min-w-[80px]">
                        {winnerInfo ? (
                          <>
                            <div className={`font-black text-sm ${iMeWon ? 'text-brand' : 'text-ink'}`}>
                              {iMeWon ? 'Toi' : winnerInfo.username}
                            </div>
                            <div className="text-xs text-ink2">{fmt(winnerInfo.amount)}</div>
                          </>
                        ) : (
                          <div className="text-xs text-muted">Non attribué</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {state.isCommissioner ? (
              <button onClick={drawPack} disabled={drawing} className="btn-primary w-full py-3">
                {drawing ? 'Tirage…' : 'Tirer le prochain pack'}
              </button>
            ) : (
              <div className="text-center text-muted text-sm py-2">
                En attente du prochain pack par le commissaire…
              </div>
            )}

            {/* Budgets */}
            <div className="mt-5 space-y-2">
              <div className="text-xs text-muted font-semibold mb-2">Budgets restants</div>
              {state.members.map(m => (
                <div key={m.userId} className={`flex items-center gap-3 py-1.5 px-3 rounded-xl ${m.userId === myId ? 'bg-brand/10 border border-brand/20' : 'bg-surface/60'}`}>
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-black text-ink"
                    style={{ backgroundColor: m.avatarColor }}>
                    {m.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 text-ink2 text-xs font-semibold truncate">
                    {m.username}{m.userId === myId && <span className="text-brand ml-1">(moi)</span>}
                  </div>
                  <div className="text-[10px] text-muted mr-2">{m.playerCount} joueurs</div>
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

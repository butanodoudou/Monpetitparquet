'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Barlow_Condensed } from 'next/font/google';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import { apiFetch } from '@/lib/api-client';
import { orderRevealDurationMs } from '@/lib/lottery';
import type { LotteryEvent } from '@/lib/lottery-types';
import { useLottery, useRemainingMs } from '@/components/lottery/useLottery';
import TicketOdds from '@/components/lottery/TicketOdds';
import DrawOrderList from '@/components/lottery/DrawOrderList';
import TurnTimer from '@/components/lottery/TurnTimer';
import PackGrid from '@/components/lottery/PackGrid';
import EventFeed from '@/components/lottery/EventFeed';
import Recap from '@/components/lottery/Recap';
import PickSheet from '@/components/lottery/PickSheet';
import { tierLabel, tierText } from '@/components/lottery/shared';

// Police des chiffres, chargée uniquement sur cette page
const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-barlow', display: 'swap' });

/** Lundi suivant (ou aujourd'hui si on est lundi avant 8h UTC, heure du cron), en français. */
function nextMondayLabel(): string {
  const d = new Date();
  const dow = d.getUTCDay(); // 1 = lundi
  let add = (8 - dow) % 7;
  if (add === 0 && d.getUTCHours() >= 8) add = 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
}

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function LotteryPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const router = useRouter();
  const { state, error, refetch, now } = useLottery(id);

  const [chosenPackId, setChosenPackId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [autoNotice, setAutoNotice] = useState<LotteryEvent | null>(null);

  useEffect(() => { if (!token) router.replace('/auth'); }, [token, router]);

  const session = state?.session ?? null;
  const live = session?.status === 'live';
  const meId = user?.id;
  const total = session?.total_picks ?? 0;

  // Révélation de l'ordre : le premier timer inclut sa durée, jouée chez tous les clients en même temps
  const revealEndIso = live && session && session.current_pick === 1 && session.started_at
    ? new Date(new Date(session.started_at).getTime() + orderRevealDurationMs(total)).toISOString()
    : null;
  const revealMs = useRemainingMs(revealEndIso, now);
  const remainingMs = useRemainingMs(live ? session?.pick_deadline : null, now);
  const revealing = live && revealMs > 0;

  // L'animation de glissement de l'ordre ne se joue que si on arrive pendant la révélation
  const staggerRef = useRef<{ id: string; stagger: boolean } | null>(null);
  if (live && session && staggerRef.current?.id !== session.id) {
    staggerRef.current = { id: session.id, stagger: revealMs > 0 };
  }

  const myTurn = live && !revealing && !!state && state.current_user_id === meId;
  const sheetOpen = !!state && myTurn && (!!state.my_open_pack || chosenPackId !== null);
  const currentPick = session?.current_pick;

  // Nouveau pick : on oublie le pack choisi au tour précédent
  useEffect(() => { setChosenPackId(null); }, [currentPick, session?.id]);

  // ── Pick automatique ─────────────────────────────────────────
  // À l'expiration du timer (tour d'un humain) ou juste après la révélation (tour d'un bot), n'importe quel
  // client appelle /auto. Le serveur déduplique sur current_pick ; on réessaie si l'horloge est en avance.
  const botTurn = !!state && state.members.some(m => m.user_id === state.current_user_id && m.is_bot);
  const deadline = session?.pick_deadline ?? null;
  useEffect(() => {
    if (!live || !currentPick || !deadline) return;
    let cancelled = false;
    const reveal = revealEndIso ? new Date(revealEndIso).getTime() - now() : 0;
    const wait = botTurn
      ? Math.max(1500, reveal + 600)
      : Math.max(0, new Date(deadline).getTime() - now()) + 400;

    const run = async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        try {
          await apiFetch(`/api/lottery/${id}/auto`, { method: 'POST', body: JSON.stringify({ pick: currentPick }) });
          break;
        } catch {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
      if (!cancelled) refetch();
    };
    const t = setTimeout(run, wait);
    return () => { cancelled = true; clearTimeout(t); };
  // revealEndIso change quand la session démarre ; now est stable
  }, [live, currentPick, deadline, botTurn, id, refetch, revealEndIso, now]);

  // ── Pick fait à ma place (timer expiré) ──────────────────────
  const myPickRef = useRef<number | null>(null);
  const confirmedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!state || !session) return;
    if (myTurn) { myPickRef.current = session.current_pick; return; }
    const was = myPickRef.current;
    if (was !== null && (session.current_pick !== was || session.status !== 'live')) {
      myPickRef.current = null;
      if (confirmedRef.current !== was) {
        const ev = state.events.find(e => e.user_id === meId);
        if (ev) setAutoNotice(ev);
      }
    }
  }, [state, session, myTurn, meId]);

  const start = useCallback(async () => {
    setStarting(true);
    setStartError('');
    try {
      await apiFetch(`/api/lottery/${id}/start`, { method: 'POST' });
      await refetch();
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Erreur inattendue');
    } finally {
      setStarting(false);
    }
  }, [id, refetch]);

  const backHref = `/leagues/${id}`;
  const status = session?.status;

  if (!token) return null;

  const header = (right?: React.ReactNode) => <TopBar title="Loterie du lundi" backHref={backHref} right={right} />;

  // ── Chargement / erreur ──────────────────────────────────────
  if (!state) {
    return (
      <div className={`page ${barlow.variable}`}>
        {header()}
        <div className="px-4 pt-5">
          {error ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4" role="alert">
              <p className="font-semibold text-red-300">Impossible de charger la loterie</p>
              <p className="text-sm text-slate-300 mt-1">{error}</p>
              <button type="button" onClick={refetch} className="mt-3 h-10 px-4 rounded-lg bg-slate-800 text-slate-100 text-sm font-semibold">Réessayer</button>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 animate-pulse" aria-busy>
              <div className="h-3 w-28 bg-slate-700 rounded" />
              <div className="h-5 w-52 bg-slate-700 rounded mt-3" />
              <div className="h-3 w-40 bg-slate-800 rounded mt-3" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Pas de loterie ───────────────────────────────────────────
  if (!session || status === 'cancelled') {
    return (
      <div className={`page ${barlow.variable}`}>
        {header()}
        <div className="px-4 pt-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="font-semibold">Pas de loterie cette semaine</p>
            <p className="text-sm text-slate-400 mt-1 leading-snug">
              {status === 'cancelled'
                ? 'Il ne reste pas assez de joueurs libres pour remplir les packs. '
                : "Aucun match de LNB Élite n'a été joué, ou la ligue n'a pas encore terminé sa draft. "}
              La prochaine loterie aura lieu {nextMondayLabel()}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const me = state.members.find(m => m.user_id === meId);
  const currentMember = state.members.find(m => m.user_id === state.current_user_id);
  const closedCount = state.packs.filter(p => !p.opened).length;
  const openedCount = state.packs.length - closedCount;
  const subtitle = `Journée ${session.week}`;

  const statusBadge = status === 'live'
    ? <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400"><i className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden />En direct</span>
    : status === 'done'
      ? <span className="text-xs font-semibold text-emerald-400">Terminée</span>
      : null;

  return (
    <div className={`page ${barlow.variable}`}>
      {header(statusBadge)}
      <div className="page-scroll !pb-8">
        <p className="px-4 pt-3 text-xs text-slate-400">{subtitle}</p>

        {/* ── PROGRAMMÉE ── */}
        {status === 'scheduled' && (
          <>
            <section className="px-4 pt-3 pb-4">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-200">{upperFirst(new Date(session.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }))}</p>
                <p className="mt-1 text-[15px] text-slate-200 leading-snug">
                  Chaque manager a des tickets selon son classement de la semaine. Plus tu en as, plus tu as de chances de piocher tôt. Le dernier du classement en a le plus.
                </p>
              </div>
              <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-300">Chances de passer en premier</h2>
              <TicketOdds members={state.members} meId={meId} />
              <p className="mt-3 text-xs text-slate-500 leading-snug">
                {state.total_tickets} tickets au total. Chaque pack contient 1 Élite, 2 Star et 2 Basique. Tu gardes un joueur et tu en relâches un si ton équipe est complète.
              </p>
            </section>
            <div className="sticky bottom-0 px-4 py-4 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent">
              {startError && <p className="mb-2 text-sm text-red-300 text-center" role="alert">{startError}</p>}
              {state.can_start ? (
                <button type="button" onClick={start} disabled={starting}
                  className="w-full h-12 rounded-xl bg-amber-500 text-slate-950 font-bold active:scale-[.98] transition disabled:opacity-60">
                  {starting ? 'Lancement…' : 'Lancer le tirage'}
                </button>
              ) : (
                <p className="text-center text-sm text-slate-400">En attente du commissaire pour lancer le tirage.</p>
              )}
              <p className="mt-2 text-center text-xs text-slate-500">
                {state.can_start && !state.is_commissioner
                  ? "Le commissaire n'a pas lancé : tout membre peut le faire depuis midi (UTC)."
                  : "Bouton réservé au commissaire. À partir de midi (UTC), n'importe quel membre peut lancer."}
              </p>
            </div>
          </>
        )}

        {/* ── EN DIRECT ── */}
        {status === 'live' && (
          <>
            <TurnTimer remainingMs={revealing ? 60_000 : remainingMs} pick={session.current_pick} total={total}
              myTurn={myTurn} currentName={myTurn ? (me?.username ?? '') : (currentMember?.username ?? '')}
              isBot={botTurn} revealing={revealing} />

            {autoNotice && <AutoNotice event={autoNotice} onClose={() => setAutoNotice(null)} />}

            <section className="px-4 mt-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-2">Ordre de passage</h2>
              <DrawOrderList state={state} meId={meId} stagger={staggerRef.current?.stagger ?? false} />
            </section>

            <section className="px-4 mt-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-2">
                Packs <span className="text-slate-500 font-normal">- {closedCount} fermé{closedCount > 1 ? 's' : ''}, {openedCount} ouvert{openedCount > 1 ? 's' : ''}</span>
              </h2>
              <PackGrid state={state} canPick={myTurn && !state.my_open_pack} onPick={setChosenPackId} />
            </section>

            <section className="px-4 mt-6 pb-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-2">Ce qui vient de se passer</h2>
              <EventFeed state={state} nowMs={now()} />
            </section>
          </>
        )}

        {/* ── TERMINÉE ── */}
        {status === 'done' && (
          <section className="px-4 pt-3">
            {autoNotice && <AutoNotice event={autoNotice} onClose={() => setAutoNotice(null)} />}
            <p className="text-[15px] text-slate-300 leading-snug">
              Les {total} picks sont faits et les nouveaux joueurs sont déjà dans les équipes. Vérifie ton cinq de départ.
            </p>
            <div className="mt-4"><Recap state={state} meId={meId} /></div>
            <div className="py-5">
              <Link href={`/leagues/${id}/team`}
                className="block w-full h-12 leading-[48px] text-center rounded-xl border border-amber-500/60 text-amber-400 font-semibold">
                Voir mon équipe
              </Link>
            </div>
          </section>
        )}
      </div>

      {sheetOpen && (
        <PickSheet key={`${session.id}-${session.current_pick}`} leagueId={id} state={state} packId={chosenPackId} now={now}
          onClose={() => { setChosenPackId(null); refetch(); }}
          onConfirmed={pick => { confirmedRef.current = pick; setChosenPackId(null); refetch(); }} />
      )}
    </div>
  );
}

function AutoNotice({ event, onClose }: { event: LotteryEvent; onClose: () => void }) {
  return (
    <div className="mx-4 mt-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center" role="status">
      <p className="font-semibold">Temps écoulé</p>
      <p className="text-sm text-slate-400 mt-1 leading-snug">
        Le jeu a choisi à ta place :{' '}
        {event.chosen
          ? <span className={`font-semibold ${tierText(event.chosen.tier)}`}>{event.chosen.name} ({tierLabel(event.chosen.tier)})</span>
          : 'un joueur'}
        .{event.released ? ` ${event.released.name} est relâché.` : ''}
      </p>
      <button type="button" onClick={onClose} className="mt-4 h-11 px-5 rounded-xl bg-slate-800 font-semibold text-sm">Fermer</button>
    </div>
  );
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Barlow_Condensed } from 'next/font/google';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import { apiFetch } from '@/lib/api-client';
import { silverCount } from '@/lib/lottery';
import { useLottery, useRemainingMs } from '@/components/lottery/useLottery';
import TicketOdds from '@/components/lottery/TicketOdds';
import DrawOrderList from '@/components/lottery/DrawOrderList';
import { QUALITY_LABEL, QualityBadge } from '@/components/lottery/shared';

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
const rankLabel = (n: number) => (n === 1 ? '1er' : `${n}e`);

export default function LotteryPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuthStore();
  const router = useRouter();
  const { state, error, refetch, now } = useLottery(id);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');

  useEffect(() => { if (!token) router.replace('/auth'); }, [token, router]);

  const session = state?.session ?? null;
  const drawn = session?.status === 'done';
  const meId = user?.id;

  // Révélation collective : la durée part de started_at, jouée au même moment chez tous les clients
  const revealEndIso = drawn && session?.started_at && state
    ? new Date(new Date(session.started_at).getTime() + state.reveal_ms).toISOString()
    : null;
  const revealMs = useRemainingMs(revealEndIso, now);
  const revealing = drawn && revealMs > 0;

  // L'animation de glissement ne se joue que si on arrive pendant la révélation
  const staggerRef = useRef<{ id: string; stagger: boolean } | null>(null);
  if (drawn && session && staggerRef.current?.id !== session.id) {
    staggerRef.current = { id: session.id, stagger: revealMs > 0 };
  }

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
            <div className="rounded-2xl border border-siren/40 bg-siren/10 p-4" role="alert">
              <p className="font-semibold text-siren">Impossible de charger la loterie</p>
              <p className="text-sm text-ink2 mt-1">{error}</p>
              <button type="button" onClick={refetch} className="mt-3 h-10 px-4 rounded-lg bg-surface border border-line text-ink text-sm font-semibold">Réessayer</button>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-4 animate-pulse" aria-busy>
              <div className="h-3 w-28 bg-raised rounded" />
              <div className="h-5 w-52 bg-raised rounded mt-3" />
              <div className="h-3 w-40 bg-raised rounded mt-3" />
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
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="font-semibold">Pas de loterie cette semaine</p>
            <p className="text-sm text-ink2 mt-1 leading-snug">
              Aucun match de LNB Élite n’a été joué, ou ta ligue n’a pas encore été lancée.
              La prochaine loterie aura lieu {nextMondayLabel()}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const n = state.members.length;
  const silver = silverCount(n);
  const myEntry = state.order.find(e => e.user_id === meId);
  const myPack = state.my_pack;
  const betterElsewhere = !!(myEntry && myPack && myPack.quality !== myEntry.quality);

  return (
    <div className={`page ${barlow.variable}`}>
      {header(status === 'done' ? <span className="text-xs font-semibold text-ink2">Terminée</span> : null)}
      <div className="page-scroll !pb-8">
        <p className="px-4 pt-3 text-xs text-ink2">Journée {session.week}</p>

        {/* ── PROGRAMMÉE ── */}
        {status === 'scheduled' && (
          <>
            <section className="px-4 pt-3 pb-4">
              <div className="rounded-2xl border border-brass/40 bg-brand-light p-4">
                <p className="text-sm text-brand">{upperFirst(new Date(session.created_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }))}</p>
                <p className="mt-1 text-[15px] text-ink leading-snug">
                  Chaque manager reçoit un paquet. Le tirage décide de sa qualité : plus ton rang au classement est bas, plus tu as de tickets, et plus tu as de chances d’être tiré tôt.
                </p>
              </div>

              <h2 className="mt-6 mb-2 font-display text-lg font-semibold">Ce que tu peux gagner</h2>
              <ul className="rounded-2xl border border-line bg-surface divide-y divide-line text-sm">
                {n > 0 && (
                  <>
                    <li className="flex items-center justify-between px-3 py-2.5"><span>Le 1er tiré</span><QualityBadge quality="or" /></li>
                    {n >= 2 && (
                      <li className="flex items-center justify-between px-3 py-2.5">
                        <span>{Math.min(silver + 1, n) === 2 ? 'Le 2e tiré' : `Du 2e au ${Math.min(silver + 1, n)}e tiré`}</span>
                        <QualityBadge quality="argent" />
                      </li>
                    )}
                    {n > silver + 1 && (
                      <li className="flex items-center justify-between px-3 py-2.5">
                        <span>{n === silver + 2 ? `Le ${silver + 2}e tiré` : `Du ${silver + 2}e au ${n}e tiré`}</span><QualityBadge quality="standard" />
                      </li>
                    )}
                  </>
                )}
              </ul>

              <h2 className="mt-6 mb-2 font-display text-lg font-semibold">Chances d’être tiré en premier</h2>
              <TicketOdds members={state.members} meId={meId} />
              <p className="mt-3 text-xs text-muted leading-snug">
                {state.total_tickets} tickets au total. Ton paquet s’ouvre dans la page Paquets.
              </p>
            </section>
            <div className="sticky bottom-0 px-4 py-4 bg-gradient-to-t from-paper via-paper to-transparent">
              {startError && <p className="mb-2 text-sm text-siren text-center" role="alert">{startError}</p>}
              {state.can_start ? (
                <button type="button" onClick={start} disabled={starting}
                  className="w-full h-12 rounded-xl bg-ink text-on-accent font-bold active:scale-[.98] transition disabled:opacity-60">
                  {starting ? 'Tirage en cours…' : 'Lancer le tirage'}
                </button>
              ) : (
                <p className="text-center text-sm text-ink2">Le commissaire doit lancer le tirage.</p>
              )}
              <p className="mt-2 text-center text-xs text-muted">
                {state.can_start && !state.is_commissioner
                  ? 'Le commissaire n’a pas lancé : tu peux le faire depuis midi (UTC).'
                  : 'Le bouton est réservé au commissaire. À partir de midi (UTC), n’importe quel membre peut lancer.'}
              </p>
            </div>
          </>
        )}

        {/* ── TIRAGE FAIT ── */}
        {status === 'done' && (
          <section className="px-4 pt-3">
            <h2 className="font-display text-xl font-semibold">
              {revealing ? 'Le tirage est en cours' : 'Voici l’ordre du tirage'}
            </h2>
            <p className="mt-1 mb-3 text-sm text-ink2 leading-snug">
              Le premier tiré reçoit un paquet Or, les {silver === 1 ? 'suivant' : `${silver} suivants`} un paquet Argent, les autres un paquet Standard.
            </p>
            <DrawOrderList state={state} meId={meId} stagger={staggerRef.current?.stagger ?? false} />

            {/* Après la révélation seulement, pour ne rien dévoiler avant les autres */}
            {!revealing && (
              <div className="mt-6 rounded-2xl border border-brass/40 bg-brand-light p-4" role="status">
                {myEntry ? (
                  <>
                    <p className="font-display text-lg font-semibold">
                      Tu es {rankLabel(myEntry.pick)} au tirage
                    </p>
                    <p className="mt-1 text-sm text-ink2 leading-snug">
                      {myPack
                        ? <>Ton paquet du jour est un <span className="font-semibold">{QUALITY_LABEL[myPack.quality].toLowerCase()}</span>.</>
                        : 'Ton paquet arrive, recharge la page dans un instant.'}
                      {betterElsewhere && ' Une autre de tes ligues t’a donné mieux : c’est ce paquet que tu gardes.'}
                    </p>
                    {myPack && (
                      <Link href="/packs"
                        className="mt-4 block w-full h-12 leading-[48px] text-center rounded-xl bg-ink text-on-accent font-semibold">
                        {myPack.opened ? 'Voir mes paquets' : 'Ouvrir mon paquet'}
                      </Link>
                    )}
                    {!myPack && (
                      <button type="button" onClick={start} disabled={starting}
                        className="mt-4 w-full h-11 rounded-xl border border-line bg-surface font-semibold disabled:opacity-60">
                        {starting ? 'Vérification…' : 'Réessayer'}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ink2 leading-snug">Tu n’étais pas dans la ligue au moment du tirage.</p>
                )}
              </div>
            )}
            <div className="py-5">
              <Link href={backHref} className="block w-full h-12 leading-[48px] text-center rounded-xl border border-line bg-surface font-semibold">
                Retour à la ligue
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

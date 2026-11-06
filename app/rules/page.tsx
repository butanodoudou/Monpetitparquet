'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import ScoringGrid from '@/components/ScoringGrid';
import { MODIFIERS } from '@/lib/fantasy';
import { CARDS_PER_PACK, LINEUP_SLOTS, PACK_ODDS, POSITION_MULTIPLIERS, RARITIES, RARITY_CONFIG, STARTER_PACKS } from '@/lib/cards';
import { percent } from '@/components/cards/labels';

/** 1.1 -> "1,1" ; 8 -> "8". */
const fr = (n: number) => String(n).replace('.', ',');
const minDef = 1 - MODIFIERS.defenseMaxReduction;
const pct = (n: number) => `${Math.round(n * 100)} %`;
const effect = (m: number) => (m === 1 ? 'aucun effet' : `${percent(m)} sur les points`);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 mt-7">
      <h2 className="font-display text-xl font-bold text-ink mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function RulesPage() {
  const { token } = useAuthStore();
  const router = useRouter();
  useEffect(() => { if (!token) router.replace('/auth'); }, [token, router]);
  if (!token) return null;

  const nBack = LINEUP_SLOTS.filter(s => s === 'arriere').length;
  const nWing = LINEUP_SLOTS.filter(s => s === 'sf').length;
  const nBig = LINEUP_SLOTS.filter(s => s === 'grand').length;

  return (
    <div className="page">
      <TopBar title="Règles" back />
      <div className="page-scroll">
        <p className="px-4 pt-5 text-ink2 leading-relaxed">
          Tu collectionnes des cartes de joueurs de la LNB Élite, tu en alignes cinq chaque semaine et tu affrontes un ami en duel. Les points viennent des vrais matchs.
        </p>

        <Section title="Tes cartes">
          <div className="card text-sm text-ink2 leading-relaxed space-y-3">
            <p>
              Une carte, c’est un joueur et une rareté. Elle t’appartient, pas à une ligue : tu peux la jouer dans plusieurs ligues à la fois.
              Les doublons existent, chez toi comme chez tes amis.
            </p>
            <p>La rareté change les points que la carte rapporte :</p>
            <ul className="list-none divide-y divide-line -mx-1">
              {RARITIES.slice().reverse().map(r => (
                <li key={r} className="flex items-baseline justify-between gap-3 px-1 py-2">
                  <span className="font-semibold text-ink">{RARITY_CONFIG[r].label}</span>
                  <span className="flex-1 text-right">{effect(RARITY_CONFIG[r].multiplier)}</span>
                  <span className="w-20 text-right">{pct(PACK_ODDS.standard[r])} des cartes</span>
                </li>
              ))}
            </ul>
            <p>Le niveau réel du joueur reste secret : la carte te montre sa rareté et sa moyenne.</p>
          </div>
        </Section>

        <Section title="Gagner des paquets">
          <ul className="card text-sm text-ink2 leading-relaxed space-y-2 list-none">
            <li>À ton inscription, tu reçois {STARTER_PACKS} paquets de bienvenue.</li>
            <li>Chaque lundi, la loterie te donne un paquet. Plus tu es bas au classement, plus il a de chances d’être beau.</li>
            <li>Chaque victoire en duel t’en rapporte un.</li>
            <li>Un paquet contient {CARDS_PER_PACK} cartes, toutes pour toi.</li>
          </ul>
        </Section>

        <Section title="Ton cinq">
          <div className="card text-sm text-ink2 leading-relaxed space-y-2">
            <p>
              Chaque journée, tu choisis {LINEUP_SLOTS.length} cartes de ta collection, en {nBack}-{nWing}-{nBig} : {nBack} arrières, {nWing} ailier et {nBig} intérieurs.
              Un même joueur ne peut être aligné qu’une fois.
            </p>
            <p>
              Tu peux poser n’importe quel joueur à n’importe quelle place, mais un joueur hors de son poste joue moins bien :
              {' '}<b className="text-ink">{percent(POSITION_MULTIPLIERS[1])}</b> à un poste d’écart,
              {' '}<b className="text-ink">{percent(POSITION_MULTIPLIERS[2])}</b> à deux postes d’écart (un pivot à la mène, par exemple).
              Ce malus s’ajoute à l’effet de la rareté. Tu le vois avant de valider.
            </p>
            <p>Ton cinq est verrouillé au premier coup d’envoi de la journée.</p>
          </div>
        </Section>

        <Section title="Les points">
          <p className="text-sm text-ink2 leading-relaxed mb-3">
            Chaque joueur marque selon ce qu’il fait sur le terrain. Ce total est ensuite multiplié par l’effet de sa rareté et par son malus de poste éventuel.
          </p>
          <ScoringGrid />
        </Section>

        <Section title="Bonus et malus du duel">
          <div className="card text-sm text-ink2 leading-relaxed space-y-3">
            <p>
              <b className="text-ink">Chimie</b> : +{MODIFIERS.chemistryClubPair} points par paire de titulaires du même club,
              +{MODIFIERS.chemistryNationalityPair} par paire de même nationalité, plafonné à +{MODIFIERS.chemistryCap}.
            </p>
            <p>
              <b className="text-ink">Week-end</b> : ×{fr(MODIFIERS.weekendMultiplier)} sur ton score si au moins {MODIFIERS.weekendMinWinningTeams} clubs
              différents de tes titulaires gagnent.
            </p>
            <p>
              <b className="text-ink">Défense</b> : les contres et interceptions de tes titulaires réduisent le score de ton adversaire,
              jusqu’à ×{fr(minDef)} à partir de {MODIFIERS.defenseFullAtRaw} au total.
            </p>
          </div>
        </Section>

        <Section title="Les duels et le classement">
          <ul className="card text-sm text-ink2 leading-relaxed space-y-2 list-none">
            <li>Chaque journée, tu affrontes un ami de ta ligue : celui qui a le plus de points gagne.</li>
            <li>Le classement compte les victoires, puis le total de points marqués.</li>
            <li>Le commissaire lance la ligue quand tout le monde est là. Ensuite, plus personne ne peut la rejoindre.</li>
          </ul>
        </Section>
        <div className="h-4" />
      </div>
      <BottomNav />
    </div>
  );
}

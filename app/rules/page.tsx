'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import TopBar from '@/components/TopBar';
import BottomNav from '@/components/BottomNav';
import ScoringGrid from '@/components/ScoringGrid';
import { MODIFIERS, ROSTER_SIZE, ROSTER_SLOTS, STARTER_SLOTS } from '@/lib/fantasy';

/** 1.1 -> "1,1" ; 8 -> "8". */
const fr = (n: number) => String(n).replace('.', ',');
const minDef = 1 - MODIFIERS.defenseMaxReduction;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-4 mt-6">
      <h2 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function RulesPage() {
  const { token } = useAuthStore();
  const router = useRouter();
  useEffect(() => { if (!token) router.replace('/auth'); }, [token, router]);
  if (!token) return null;

  return (
    <div className="page">
      <TopBar title="Règles" back />
      <div className="page-scroll">
        <Section title="Barème">
          <ScoringGrid />
        </Section>

        <Section title="Ton cinq de départ">
          <div className="card text-sm text-slate-300 leading-snug space-y-1.5">
            <p>
              Ton équipe compte {ROSTER_SIZE} joueurs : {ROSTER_SLOTS.arriere} arrières, {ROSTER_SLOTS.sf} ailiers et {ROSTER_SLOTS.grand} intérieurs.
              Tu alignes 5 titulaires en 2-1-2 : {STARTER_SLOTS.arriere} arrières, {STARTER_SLOTS.sf} ailier, {STARTER_SLOTS.grand} intérieurs.
            </p>
            <p className="text-slate-400">Le cinq est verrouillé au premier coup d&apos;envoi de la journée.</p>
          </div>
        </Section>

        <Section title="Modificateurs">
          <div className="card text-sm text-slate-300 leading-snug space-y-3">
            <p>
              <b className="text-slate-100">Chimie</b> : +{MODIFIERS.chemistryClubPair} points par paire de titulaires du même club,
              +{MODIFIERS.chemistryNationalityPair} par paire de même nationalité, plafonné à +{MODIFIERS.chemistryCap}.
            </p>
            <p>
              <b className="text-slate-100">Weekend</b> : ×{fr(MODIFIERS.weekendMultiplier)} sur ton score si au moins {MODIFIERS.weekendMinWinningTeams} clubs
              différents de tes titulaires gagnent.
            </p>
            <p>
              <b className="text-slate-100">Malus défensif</b> : les contres et interceptions de tes titulaires réduisent le score de ton adversaire,
              jusqu&apos;à ×{fr(minDef)} à partir de {MODIFIERS.defenseFullAtRaw} au total.
            </p>
          </div>
        </Section>

        <Section title="Loterie du lundi">
          <ul className="card text-sm text-slate-300 leading-snug space-y-1.5 list-none">
            <li>Chaque lundi, une loterie récompense la semaine écoulée.</li>
            <li>Plus ton classement de la semaine est bas, plus tu as de tickets (de 1 à 10) et de chances de piocher tôt.</li>
            <li>Chacun son tour, tu ouvres un pack fermé de 5 joueurs (1 Élite, 2 Star, 2 Basique) et tu en gardes un.</li>
            <li>Si ton poste est complet, tu relâches un joueur du même poste : il redevient libre.</li>
          </ul>
        </Section>
        <div className="h-4" />
      </div>
      <BottomNav />
    </div>
  );
}

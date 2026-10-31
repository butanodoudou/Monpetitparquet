import { SCORING } from '@/lib/fantasy';

/** 1.5 -> "1,5" ; le signe est géré par l'appelant. */
const num = (n: number) => String(Math.abs(n)).replace('.', ',');

interface Item { label: string; value: string; negative: boolean }

/** Lignes du barème, construites depuis SCORING (lib/fantasy.ts) : rien n'est écrit en dur ici. */
export function scoringItems(): Item[] {
  const mult = (label: string, v: number): Item => ({ label, value: `${v < 0 ? '−' : '+'}${num(v)} pt`, negative: v < 0 });
  return [
    mult('Point', SCORING.point),
    mult('Passe', SCORING.assist),
    mult('Rebond offensif', SCORING.offensiveRebound),
    mult('Rebond défensif', SCORING.defensiveRebound),
    mult('Interception', SCORING.steal),
    mult('Contre', SCORING.block),
    mult('Perte de balle', SCORING.turnover),
    mult('Tir manqué', SCORING.missedFieldGoal),
    mult('Lancer manqué', SCORING.missedFreeThrow),
    { label: '3 pts réussi', value: `${SCORING.threePointerMade < 0 ? '−' : '+'}${num(SCORING.threePointerMade)} pt`, negative: SCORING.threePointerMade < 0 },
  ];
}

export default function ScoringGrid() {
  return (
    <>
      <div className="card grid grid-cols-3 gap-x-3 gap-y-4 text-center">
        {scoringItems().map(i => (
          <div key={i.label}>
            <div className={`font-black text-lg ${i.negative ? 'text-red-400' : 'text-brand'}`}>{i.value}</div>
            <div className="text-xs text-slate-500">{i.label}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 text-center mt-2">Aucun bonus double-double ni triple-double.</p>
    </>
  );
}

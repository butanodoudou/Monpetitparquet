// Libellés français des cartes : postes, places du cinq, malus. Les chiffres viennent de lib/cards.ts.
import { RARITY_CONFIG, cardMultiplier, positionMultiplier, type Rarity } from '@/lib/cards';
import type { PositionGroup } from '@/lib/fantasy';
import { formatPoints } from '@/lib/format';

const POSITION_NAMES: Record<string, string> = {
  PG: 'Meneur', SG: 'Arrière', SF: 'Ailier', PF: 'Ailier fort', C: 'Pivot',
};

export const positionName = (position: string | null | undefined): string => POSITION_NAMES[position ?? ''] ?? 'Ailier';

export const GROUP_SINGULAR: Record<PositionGroup, string> = { arriere: 'Arrière', sf: 'Ailier', grand: 'Intérieur' };
export const GROUP_PLURAL: Record<PositionGroup, string> = { arriere: 'Arrières', sf: 'Ailiers', grand: 'Intérieurs' };
/** « à la mène », « à l’aile », « dans la raquette » */
const SLOT_PHRASE: Record<PositionGroup, string> = { arriere: 'à la mène', sf: 'à l’aile', grand: 'dans la raquette' };

/** « −35 % » ou « +10 % » à partir d'un multiplicateur. */
export function percent(mult: number): string {
  const p = Math.round((mult - 1) * 100);
  return `${p < 0 ? '−' : '+'}${Math.abs(p)} %`;
}

/** Multiplicateur en chiffres français : ×0,72 */
export const times = (mult: number): string => `×${mult.toFixed(2).replace('.', ',')}`;

/** Texte clair du malus de poste, affiché avant de valider : « Pivot à la mène, −35 % ». */
export function positionText(position: string | null, natural: PositionGroup, slot: PositionGroup): string {
  const m = positionMultiplier(natural, slot);
  if (m === 1) return `${positionName(position)} à son poste, aucun malus`;
  return `${positionName(position)} ${SLOT_PHRASE[slot]}, ${percent(m)}`;
}

/** « Gold +10 % », « Silver, aucun effet ». */
export function rarityText(rarity: Rarity): string {
  const m = RARITY_CONFIG[rarity].multiplier;
  return m === 1 ? `${RARITY_CONFIG[rarity].label}, sans effet` : `${RARITY_CONFIG[rarity].label} ${percent(m)}`;
}

/** Points estimés d'une carte à une place : sa moyenne × le multiplicateur total. */
export function estimate(avg: number, rarity: Rarity, natural: PositionGroup, slot: PositionGroup): number {
  return avg * cardMultiplier(rarity, natural, slot);
}

export const pts = (n: number): string => `${formatPoints(n)} pts`;

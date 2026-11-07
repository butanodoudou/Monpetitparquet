// Économie des cartes : règles pures (revente, amélioration, cartes verrouillées), sûres côté navigateur.
// Les appels base (fonctions Postgres sell_cards, buy_pack, upgrade_card) sont dans lib/economy-server.ts.
// Les montants viennent de lib/cards.ts, jamais du client.
import { RARITIES, RARITY_CONFIG, UPGRADE_COST, nextRarity, type Rarity } from '@/lib/cards';
import { cardsAt, resolveLineup, type ScoringCard } from '@/lib/card-scoring';

/** Prix de revente par rareté, tels que les reçoit sell_cards. */
export function sellValues(): Record<Rarity, number> {
  const out = {} as Record<Rarity, number>;
  for (const r of RARITIES) out[r] = RARITY_CONFIG[r].sellValue;
  return out;
}

/** Pièces rapportées par la vente de ces raretés (aperçu côté interface et contrôle côté serveur). */
export function sellTotal(rarities: Rarity[]): number {
  return rarities.reduce((sum, r) => sum + RARITY_CONFIG[r].sellValue, 0);
}

/** Gold et Platine demandent une confirmation avant la vente. */
export const needsSellConfirmation = (r: Rarity): boolean => r === 'gold' || r === 'platine';

/** Rareté d'arrivée et nombre de sacrifices pour améliorer une carte, ou null si elle ne peut plus monter. */
export function upgradePlan(r: Rarity): { to: Rarity; cost: number } | null {
  if (r === 'platine') return null;
  const to = nextRarity(r);
  return to ? { to, cost: UPGRADE_COST[r] } : null;
}

/** Une carte qui s'améliore ne peut pas servir de sacrifice, et un sacrifice ne compte qu'une fois. */
export function upgradeSelectionError(cardId: string, sacrificeIds: string[]): string | null {
  if (sacrificeIds.indexOf(cardId) !== -1) return 'La carte à améliorer ne peut pas être sacrifiée';
  if (new Set(sacrificeIds).size !== sacrificeIds.length) return 'Une carte ne peut être choisie qu’une fois';
  return null;
}

export const LOCKED_MESSAGE = 'Une de ces cartes joue dans la journée en cours : elle est verrouillée jusqu’à la fin des matchs';

/**
 * Cartes qui jouent dans une journée verrouillée, dans toutes les ligues du compte. Pour chaque ligue,
 * le cinq est celui du calcul des scores : la composition de la journée, sinon la dernière enregistrée,
 * sinon le cinq par défaut (resolveLineup). Les cartes comptées sont celles possédées au verrou.
 */
export function lockedCardIds(
  savedByLeague: (string[] | null | undefined)[],
  cards: ScoringCard[],
  lockMs: number
): Set<string> {
  const available = cardsAt(cards, lockMs);
  const locked = new Set<string>();
  for (const saved of savedByLeague) {
    for (const card of resolveLineup(saved, available)) locked.add(card.id);
  }
  return locked;
}

/** Message d'erreur si une des cartes est verrouillée, sinon null. */
export function lockedError(cardIds: string[], locked: Set<string>): string | null {
  return cardIds.some(id => locked.has(id)) ? LOCKED_MESSAGE : null;
}

/** Erreur renvoyée par une fonction SQL → statut HTTP et message pour le joueur. */
export function economyError(code: string | undefined): { status: number; message: string } {
  switch (code) {
    case 'cartes_invalides': return { status: 400, message: 'Sélection de cartes invalide' };
    case 'sacrifices_invalides': return { status: 400, message: 'Nombre de cartes à sacrifier incorrect' };
    case 'cartes_en_double': return { status: 400, message: 'Une carte ne peut être choisie qu’une fois' };
    case 'rarete_differente': return { status: 400, message: 'Les cartes sacrifiées doivent avoir la même rareté' };
    case 'carte_indisponible': return { status: 409, message: 'Une de ces cartes n’est plus disponible' };
    case 'carte_verrouillee': return { status: 423, message: LOCKED_MESSAGE };
    case 'solde_insuffisant': return { status: 402, message: 'Tu n’as pas assez de pièces' };
    case 'compte_introuvable': return { status: 404, message: 'Compte introuvable' };
    default: return { status: 500, message: 'Opération impossible pour l’instant' };
  }
}

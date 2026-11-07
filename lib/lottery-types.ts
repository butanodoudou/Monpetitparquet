// Types partagés entre les routes /api/lottery et l'interface (client et serveur).

import type { PackQuality } from '@/lib/cards';

export interface LotteryMember {
  user_id: string;
  username: string;
  team_name: string | null;
  avatar_color: string;
  is_bot: boolean;
  tickets: number;
  rank: number;
  /** Chance de passer en premier, en %. */
  odds: number;
}

export interface LotteryOrderEntry {
  user_id: string;
  pick: number;
  tickets: number;
  /** Qualité du paquet gagné, fixée par l'ordre tiré. */
  quality: PackQuality;
}

export interface LotterySessionView {
  id: string;
  week: number;
  /** « done » : le tirage a eu lieu. La révélation se joue pendant `reveal_ms` après `started_at`. */
  status: 'scheduled' | 'done' | 'cancelled';
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  total_picks: number;
}

/** Paquet de la journée du joueur, toutes ligues confondues (le meilleur résultat compte). */
export interface LotteryMyPack {
  id: string;
  quality: PackQuality;
  opened: boolean;
}

export interface LotteryState {
  /** Heure serveur, pour caler la révélation sur started_at malgré l'horloge du téléphone. */
  server_now: string;
  session: LotterySessionView | null;
  is_commissioner: boolean;
  can_start: boolean;
  members: LotteryMember[];
  total_tickets: number;
  /** Ordre tiré avec la qualité de chacun. Vide avant le tirage. */
  order: LotteryOrderEntry[];
  /** Durée de la révélation de l'ordre en ms (0 avant le tirage). */
  reveal_ms: number;
  my_pack: LotteryMyPack | null;
}

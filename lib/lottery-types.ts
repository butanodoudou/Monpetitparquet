// Types partagés entre les routes /api/lottery et l'interface (client et serveur).

import type { AuctionTier, PositionGroup } from '@/lib/fantasy';

export interface LotteryPlayer {
  id: number;
  name: string;
  team: string;
  position: string | null;
  group: PositionGroup | null;
  photo_url: string | null;
  jersey_number: number | null;
  season_avg_fantasy: number;
  tier: AuctionTier;
}

/** Joueur d'une équipe (pour choisir qui relâcher). Le tier n'est pas calculé ici. */
export interface LotteryRosterPlayer {
  id: number;
  name: string;
  team: string;
  position: string | null;
  group: PositionGroup | null;
  season_avg_fantasy: number;
}

export interface LotteryOpenedPack {
  id: string;
  pack_number: number;
  players: LotteryPlayer[];
}

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

export interface LotteryPackView {
  id: string;
  pack_number: number;
  opened: boolean;
  /** Manager qui a ouvert le pack (null si fermé). */
  opened_by: string | null;
  taken_by: string | null;
  /** Renseignés seulement une fois le pick fait. */
  chosen: LotteryPlayer | null;
  released: LotteryRosterPlayer | null;
}

export interface LotteryEvent {
  pick: number;
  user_id: string;
  username: string;
  pack_number: number;
  chosen: LotteryPlayer | null;
  released: LotteryRosterPlayer | null;
  taken_at: string | null;
}

export interface LotterySessionView {
  id: string;
  week: number;
  status: 'scheduled' | 'live' | 'done' | 'cancelled';
  current_pick: number;
  pick_deadline: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  total_picks: number;
}

export interface LotteryState {
  /** Heure serveur, pour caler le timer sur pick_deadline malgré l'horloge du téléphone. */
  server_now: string;
  session: LotterySessionView | null;
  is_commissioner: boolean;
  can_start: boolean;
  members: LotteryMember[];
  total_tickets: number;
  /** [{ user_id, pick, tickets }] une fois le direct lancé. */
  order: { user_id: string; pick: number; tickets: number }[];
  /** Manager dont c'est le tour (null hors direct). */
  current_user_id: string | null;
  packs: LotteryPackView[];
  /** Pack déjà ouvert par moi mais pas encore pris (reprise après un rechargement). Jamais celui d'un autre. */
  my_open_pack: LotteryOpenedPack | null;
  my_roster: LotteryRosterPlayer[];
  events: LotteryEvent[];
}

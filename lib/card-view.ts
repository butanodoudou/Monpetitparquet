// Forme d'une carte échangée entre l'API et l'interface. Voir .claude/specs/cartes.md.
import type { PackQuality, PackSource, Rarity } from '@/lib/cards';
import type { PositionGroup } from '@/lib/fantasy';

export interface CardView {
  id: string;
  rarity: Rarity;
  obtained_at: string;
  player: {
    id: number;
    name: string;
    team: string;
    position: string | null;
    group: PositionGroup;
    photo_url: string | null;
    jersey_number: number | null;
    season_avg_fantasy: number;
  };
}

export interface PackView { id: string; source: PackSource; quality: PackQuality }

export interface Collection { coins: number; cards: CardView[]; packs: PackView[] }

export interface LineupState {
  currentWeek: number;
  isLocked: boolean;
  lockAt: string | null;
  cards: CardView[];
  starterCardIds: string[];
}

export interface DuelStarter { card: CardView; slot: PositionGroup; points: number; multiplier: number }

export interface StandingRow {
  user_id: string;
  username: string;
  team_name: string;
  avatar_color: string;
  wins: number;
  losses: number;
  draws: number;
  points_for: number;
}

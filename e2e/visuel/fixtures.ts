// Données réalistes pour contrôler le rendu de chaque écran sans base de données.
export const LEAGUE_ID = '11111111-1111-4111-8111-111111111111';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ALEX = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SARAH = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export const USER = { id: ME, username: 'Yanis', avatarColor: '#3B82F6' };

const person = (user_id: string, username: string, team_name: string, avatar_color: string) => ({ user_id, username, team_name, avatar_color });
const yanis = person(ME, 'Yanis', 'Pick & Roll Royce', '#3B82F6');
const alex = person(ALEX, 'Alex', 'Dunk & Pastis', '#EF4444');
const sarah = person(SARAH, 'Sarah', 'Les Ch’tis du Rebond', '#10B981');
const tom = person(TOM, 'Tom', 'Air Limoges', '#8B5CF6');

const player = (id: number, name: string, team: string, position: string, avg: number, pts: number, ast: number, reb: number) => ({
  id, name, team, position, jersey_number: id % 40, photo_url: null,
  avg_points: pts, avg_assists: ast, avg_rebounds: reb, avg_steals: 1.1, avg_blocks: .4, avg_turnovers: 1.8,
  season_avg_fantasy: avg, total_fantasy: avg * 7, last_week_fantasy: avg + 3, games_played: 7, nationality: 'France',
});

export const PLAYERS = [
  player(1, 'Karim Benaïssa', 'Cholet Basket', 'PG', 27.4, 16.2, 6.8, 3.1),
  player(2, 'Marcus Delacroix', 'Limoges CSP', 'SG', 22.8, 17.1, 3.2, 3.4),
  player(3, 'Théo Lemaire', 'BCM Gravelines-Dunkerque', 'PG', 15.3, 9.8, 4.4, 2.2),
  player(4, 'Jordan Okafor', 'JL Bourg Basket', 'SF', 24.1, 14.9, 2.6, 6.1),
  player(5, 'Hugo Marchand', 'ESSM Le Portel', 'SF', 13.2, 8.2, 1.9, 3.8),
  player(6, 'Malick Traoré', 'Élan Chalon', 'C', 26.6, 13.4, 1.7, 9.2),
  player(7, 'Ivan Petrović', 'Nanterre 92', 'C', 18.4, 10.1, 1.3, 7.2),
  player(8, 'Dimitri Roux', 'SIG Strasbourg', 'C', 9.7, 5.2, .8, 4.1),
];

const side = (p: ReturnType<typeof person>, score: number, starters?: unknown[]) => ({ ...p, weekScore: score, baseScore: score, chemBonus: 4, weekendMult: 1.1, defMultApplied: .94, starters });

export const WEEK = (phase: string, lockInHours: number, scores: [number, number]) => ({
  currentWeek: 8,
  scheduleGenerated: true,
  phase,
  lockAt: new Date(Date.now() + lockInHours * 3_600_000).toISOString(),
  matchups: [
    { id: 'm1', home: side(yanis, scores[0], STARTERS_ME), away: side(alex, scores[1], STARTERS_ALEX), leadingUserId: scores[0] === scores[1] ? null : scores[0] > scores[1] ? ME : ALEX },
    { id: 'm2', home: side(sarah, 74.2), away: side(tom, 68.9), leadingUserId: SARAH },
  ],
  weekScores: { [ME]: scores[0], [ALEX]: scores[1], [SARAH]: 74.2, [TOM]: 68.9 },
  wld: {
    [ME]: { wins: 5, losses: 2, draws: 0 },
    [ALEX]: { wins: 4, losses: 3, draws: 0 },
    [SARAH]: { wins: 4, losses: 2, draws: 1 },
    [TOM]: { wins: 1, losses: 6, draws: 0 },
  },
});

const member = (p: ReturnType<typeof person>, total_score: number, player_count = 8, is_bot = false) => ({ ...p, total_score, player_count, is_bot });
const MEMBERS = [member(yanis, 612.4), member(sarah, 588.1), member(alex, 571.8), member(tom, 433.2)];

export const LEAGUE = (draft_status: string) => ({
  id: LEAGUE_ID, name: 'Les fans du soleil', invite_code: 'K7PLQ2', draft_status,
  commissioner_id: ME, members: MEMBERS,
});

const lotteryMember = (p: ReturnType<typeof person>, tickets: number, rank: number, odds: number) => ({ ...p, is_bot: false, tickets, rank, odds });

const session = (status: string) => ({
  id: 's1', week: 7, status, current_pick: 2,
  pick_deadline: new Date(Date.now() + 40_000).toISOString(),
  started_at: new Date(Date.now() - 120_000).toISOString(),
  ended_at: null, created_at: new Date().toISOString(), total_picks: 4,
});

const lotteryPlayer = (p: (typeof PLAYERS)[number], tier: string) => ({ ...p, group: 'arriere', tier });

export const LOTTERY = (status: 'scheduled' | 'live') => ({
  server_now: new Date().toISOString(),
  session: session(status),
  is_commissioner: true,
  can_start: status === 'scheduled',
  members: [lotteryMember(yanis, 3, 1, 15), lotteryMember(sarah, 4, 2, 20), lotteryMember(alex, 5, 3, 25), lotteryMember(tom, 8, 4, 40)],
  total_tickets: 20,
  order: [{ user_id: TOM, pick: 1, tickets: 8 }, { user_id: ME, pick: 2, tickets: 3 }, { user_id: ALEX, pick: 3, tickets: 5 }, { user_id: SARAH, pick: 4, tickets: 4 }],
  current_user_id: status === 'live' ? ME : null,
  packs: [1, 2, 3, 4].map(n => ({
    id: `lp${n}`, pack_number: n, opened: n === 1, opened_by: n === 1 ? TOM : null, taken_by: n === 1 ? TOM : null,
    chosen: n === 1 ? lotteryPlayer(PLAYERS[1], 'star') : null, released: null,
  })),
  my_open_pack: null,
  my_roster: PLAYERS.map(p => ({ id: p.id, name: p.name, team: p.team, position: p.position, group: 'arriere', season_avg_fantasy: p.season_avg_fantasy })),
  events: status === 'live' ? [{ pick: 1, user_id: TOM, username: 'Tom', pack_number: 1, chosen: lotteryPlayer(PLAYERS[1], 'star'), released: null, taken_at: new Date().toISOString() }] : [],
});

export const LOTTERY_PACK = () => ({
  ...LOTTERY('live'),
  my_open_pack: {
    id: 'lp2', pack_number: 2,
    players: [
      lotteryPlayer(PLAYERS[0], 'elite'), lotteryPlayer(PLAYERS[3], 'star'), lotteryPlayer(PLAYERS[5], 'star'),
      lotteryPlayer(PLAYERS[4], 'basique'), lotteryPlayer(PLAYERS[7], 'basique'),
    ],
  },
});

export const MATCHES = [
  { id: 1, home_team: 'Cholet Basket', away_team: 'Limoges CSP', home_score: null, away_score: null, status: 'scheduled', match_date: new Date(Date.now() + 26 * 3_600_000).toISOString() },
  { id: 2, home_team: 'ESSM Le Portel', away_team: 'BCM Gravelines-Dunkerque', home_score: null, away_score: null, status: 'scheduled', match_date: new Date(Date.now() + 28 * 3_600_000).toISOString() },
];

export const LEAGUES = [{ id: LEAGUE_ID, name: 'Les fans du soleil', draft_status: 'completed', member_count: 4, team_name: 'Pick & Roll Royce' }];


// ─── Cartes ───────────────────────────────────────────────────

// Photo simulée (silhouette), pour contrôler la fenêtre en arche sans réseau
const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#c9b79c'/><circle cx='50' cy='38' r='17' fill='#584a3a'/><path d='M12 100c2-30 18-40 38-40s36 10 38 40z' fill='#584a3a'/></svg>");

const GROUP: Record<string, 'arriere' | 'sf' | 'grand'> = { PG: 'arriere', SG: 'arriere', SF: 'sf', PF: 'grand', C: 'grand' };
type Rarity = 'bronze' | 'silver' | 'gold' | 'platine';

export const card = (id: string, playerIndex: number, rarity: Rarity, photo = false) => {
  const p = PLAYERS[playerIndex];
  return {
    id, rarity, obtained_at: new Date(Date.now() - playerIndex * 86_400_000).toISOString(),
    player: {
      id: p.id, name: p.name, team: p.team, position: p.position, group: GROUP[p.position],
      photo_url: photo ? PHOTO : null, jersey_number: p.jersey_number, season_avg_fantasy: p.season_avg_fantasy,
    },
  };
};

export const CARDS = [
  card('c1', 0, 'platine', true), card('c2', 1, 'gold', true), card('c3', 3, 'silver'), card('c4', 5, 'gold'),
  card('c5', 6, 'bronze'), card('c6', 2, 'bronze'), card('c7', 4, 'silver'), card('c8', 7, 'bronze'),
  card('c9', 0, 'bronze'), card('c10', 5, 'silver'),
];

export const PACKS = [
  { id: 'pk1', source: 'starter', quality: 'standard' },
  { id: 'pk2', source: 'starter', quality: 'standard' },
  { id: 'pk3', source: 'lundi', quality: 'or' },
];

export const COLLECTION = { coins: 1240, cards: CARDS, packs: PACKS };
export const COLLECTION_EMPTY = { coins: 0, cards: [], packs: [] };

/** Contenu d'un paquet, volontairement dans le désordre : l'écran doit trier du moins rare au plus rare. */
export const PACK_CARDS = {
  cards: [card('n1', 3, 'silver', true), card('n2', 0, 'platine', true), card('n3', 6, 'bronze'), card('n4', 1, 'gold', true), card('n5', 4, 'bronze')],
};
export const PACK_CARDS_BRONZE = {
  cards: [card('b1', 3, 'bronze'), card('b2', 6, 'bronze'), card('b3', 4, 'silver'), card('b4', 7, 'bronze'), card('b5', 2, 'silver')],
};

const starter = (c: ReturnType<typeof card>, slot: string, mult: number) => ({ card: c, slot, multiplier: mult, points: Math.round(c.player.season_avg_fantasy * mult * 10) / 10 });
const STARTERS_ME = [starter(CARDS[0], 'arriere', 1.2), starter(CARDS[1], 'arriere', 1.1), starter(CARDS[2], 'sf', 1), starter(CARDS[3], 'grand', 1.1), starter(CARDS[4], 'grand', 0.9)];
const STARTERS_ALEX = [starter(card('a1', 2, 'silver'), 'arriere', 1), starter(card('a2', 7, 'bronze'), 'arriere', 0.9 * 0.65), starter(card('a3', 4, 'gold'), 'sf', 1.1), starter(card('a4', 5, 'silver'), 'grand', 1), starter(card('a5', 6, 'bronze'), 'grand', 0.9)];

export const STANDINGS = [
  { ...yanis, wins: 5, losses: 2, draws: 0, points_for: 612.4 },
  { ...sarah, wins: 4, losses: 2, draws: 1, points_for: 588.1 },
  { ...alex, wins: 4, losses: 3, draws: 0, points_for: 571.8 },
  { ...tom, wins: 1, losses: 6, draws: 0, points_for: 433.2 },
];

export const LINEUP = (locked = false) => ({
  currentWeek: 8, isLocked: locked,
  lockAt: new Date(Date.now() + (locked ? -2 : 26) * 3_600_000).toISOString(),
  cards: CARDS, starterCardIds: ['c1', 'c2', 'c3', 'c4', 'c5'],
});
export const LINEUP_EMPTY = { ...LINEUP(), starterCardIds: [] as string[] };

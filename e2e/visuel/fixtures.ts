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

const side = (p: ReturnType<typeof person>, score: number) => ({ ...p, weekScore: score, baseScore: score, chemBonus: 4, weekendMult: 1.1, defMultApplied: .94 });

export const WEEK = (phase: string, lockInHours: number, scores: [number, number]) => ({
  currentWeek: 8,
  scheduleGenerated: true,
  phase,
  lockAt: new Date(Date.now() + lockInHours * 3_600_000).toISOString(),
  matchups: [
    { id: 'm1', home: side(yanis, scores[0]), away: side(alex, scores[1]), leadingUserId: scores[0] === scores[1] ? null : scores[0] > scores[1] ? ME : ALEX },
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
  commissioner_id: ME, picks_per_team: 8, members: MEMBERS,
  draftPicks: [{ id: 'p1', pick_number: 1, player: PLAYERS[0], user: { username: 'Yanis' } }],
});

const auctionPlayer = (p: (typeof PLAYERS)[number], tier: string) => ({ ...p, tier });

export const AUCTION = {
  isCommissioner: true,
  myCredits: 342_000,
  myRemainingSlots: { arriere: 2, sf: 1, grand: 2 },
  members: [
    { userId: ME, username: 'Yanis', avatarColor: '#3B82F6', isBot: false, playerCount: 3, credits: 342_000, hasSubmitted: false },
    { userId: ALEX, username: 'Alex', avatarColor: '#EF4444', isBot: false, playerCount: 3, credits: 298_000, hasSubmitted: true },
    { userId: SARAH, username: 'Sarah', avatarColor: '#10B981', isBot: false, playerCount: 2, credits: 410_000, hasSubmitted: false },
  ],
  currentPack: {
    id: 'pack1', packNumber: 4, status: 'bidding',
    players: [auctionPlayer(PLAYERS[0], 'elite'), auctionPlayer(PLAYERS[3], 'star'), auctionPlayer(PLAYERS[7], 'basique')],
    myBids: {}, submittedUserIds: [ALEX], winners: null,
    expiresAt: new Date(Date.now() + 7 * 3_600_000).toISOString(),
  },
  draftComplete: false,
};

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

export const TEAM = { players: PLAYERS, totalScore: 612.4 };
export const STANDINGS = MEMBERS;
export const LINEUP = { players: PLAYERS, starterIds: [1, 2, 4, 6, 7], currentWeek: 8, isLocked: false, lockAt: new Date(Date.now() + 26 * 3_600_000).toISOString() };

import { Server, Socket } from 'socket.io';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'monpetitparquet_secret_2024';
const PICK_TIMEOUT_MS = 45_000;
const PICKS_PER_TEAM = 5;

interface DraftState {
  leagueId: number;
  numTeams: number;
  picksPerTeam: number;
  totalPicks: number;
  currentPickIndex: number;
  pickOrder: number[]; // userId at each pick slot (snake order)
  pickedPlayerIds: Set<number>;
  timer: ReturnType<typeof setTimeout> | null;
  timeLeft: number;
  tickInterval: ReturnType<typeof setInterval> | null;
}

const draftStates = new Map<number, DraftState>();

function buildSnakeOrder(positions: { user_id: number; draft_position: number }[], rounds: number): number[] {
  const sorted = [...positions].sort((a, b) => a.draft_position - b.draft_position);
  const order: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const round = r % 2 === 0 ? sorted : [...sorted].reverse();
    order.push(...round.map(m => m.user_id));
  }
  return order;
}

function getAvailablePlayers(db: Database.Database, leagueId: number): any[] {
  return db.prepare(`
    SELECT * FROM players
    WHERE id NOT IN (
      SELECT player_id FROM team_players WHERE league_id = ?
    )
    ORDER BY (avg_points + avg_assists * 2 + avg_rebounds * 1.5 + avg_steals * 3 + avg_blocks * 3) DESC
  `).all(leagueId);
}

function autoPick(db: Database.Database, state: DraftState, io: Server): void {
  const available = getAvailablePlayers(db, state.leagueId);
  if (!available.length) return;
  const player = available[0] as any;
  executePick(db, state, player.id, io);
}

function executePick(db: Database.Database, state: DraftState, playerId: number, io: Server): void {
  if (state.timer) clearTimeout(state.timer);
  if (state.tickInterval) clearInterval(state.tickInterval);

  const userId = state.pickOrder[state.currentPickIndex];
  const round = Math.floor(state.currentPickIndex / state.numTeams) + 1;
  const pickNumber = state.currentPickIndex + 1;

  const alreadyOwned = db.prepare(
    'SELECT id FROM team_players WHERE league_id = ? AND player_id = ?'
  ).get(state.leagueId, playerId);
  if (alreadyOwned) {
    io.to(`draft:${state.leagueId}`).emit('pick-error', { error: 'Joueur déjà drafté' });
    startPickTimer(db, state, io);
    return;
  }

  db.prepare(
    'INSERT INTO team_players (league_id, user_id, player_id) VALUES (?, ?, ?)'
  ).run(state.leagueId, userId, playerId);

  db.prepare(
    'INSERT INTO draft_picks (league_id, user_id, player_id, pick_number, round) VALUES (?, ?, ?, ?, ?)'
  ).run(state.leagueId, userId, playerId, pickNumber, round);

  state.pickedPlayerIds.add(playerId);
  state.currentPickIndex++;

  db.prepare('UPDATE leagues SET current_draft_pick = ? WHERE id = ?').run(state.currentPickIndex + 1, state.leagueId);

  const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as any;

  io.to(`draft:${state.leagueId}`).emit('player-picked', {
    pickNumber,
    round,
    userId,
    playerId,
    playerName: player?.name,
    playerTeam: player?.team,
    playerPosition: player?.position,
  });

  if (state.currentPickIndex >= state.totalPicks) {
    db.prepare("UPDATE leagues SET draft_status = 'completed' WHERE id = ?").run(state.leagueId);
    draftStates.delete(state.leagueId);
    io.to(`draft:${state.leagueId}`).emit('draft-complete');
    return;
  }

  const nextUserId = state.pickOrder[state.currentPickIndex];
  io.to(`draft:${state.leagueId}`).emit('next-pick', {
    pickNumber: state.currentPickIndex + 1,
    userId: nextUserId,
    timeLeft: PICK_TIMEOUT_MS / 1000,
  });

  startPickTimer(db, state, io);
}

function startPickTimer(db: Database.Database, state: DraftState, io: Server): void {
  state.timeLeft = PICK_TIMEOUT_MS / 1000;

  state.tickInterval = setInterval(() => {
    state.timeLeft -= 1;
    io.to(`draft:${state.leagueId}`).emit('timer-tick', { timeLeft: state.timeLeft });
  }, 1000);

  state.timer = setTimeout(() => {
    if (state.tickInterval) clearInterval(state.tickInterval);
    autoPick(db, state, io);
  }, PICK_TIMEOUT_MS);
}

function initDraftState(db: Database.Database, leagueId: number): DraftState | null {
  const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId) as any;
  if (!league || league.draft_status !== 'in_progress') return null;

  const members = db.prepare(
    'SELECT user_id, draft_position FROM league_members WHERE league_id = ? ORDER BY draft_position ASC'
  ).all(leagueId) as { user_id: number; draft_position: number }[];

  const picksPerTeam = league.picks_per_team || PICKS_PER_TEAM;
  const pickOrder = buildSnakeOrder(members, picksPerTeam);
  const totalPicks = members.length * picksPerTeam;

  const pickedRows = db.prepare(
    'SELECT player_id FROM team_players WHERE league_id = ?'
  ).all(leagueId) as { player_id: number }[];

  const state: DraftState = {
    leagueId,
    numTeams: members.length,
    picksPerTeam,
    totalPicks,
    currentPickIndex: league.current_draft_pick - 1,
    pickOrder,
    pickedPlayerIds: new Set(pickedRows.map(r => r.player_id)),
    timer: null,
    timeLeft: PICK_TIMEOUT_MS / 1000,
    tickInterval: null,
  };

  return state;
}

export function setupDraftSocket(io: Server, db: Database.Database): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) return next(new Error('Authentification requise'));
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
      (socket as any).userId = payload.userId;
      (socket as any).username = payload.username;
      next();
    } catch {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as number;

    socket.on('join-draft', ({ leagueId }: { leagueId: number }) => {
      const member = db.prepare(
        'SELECT id FROM league_members WHERE league_id = ? AND user_id = ?'
      ).get(leagueId, userId);
      if (!member) {
        socket.emit('error', { message: 'Accès refusé' });
        return;
      }

      socket.join(`draft:${leagueId}`);

      let state = draftStates.get(leagueId);
      if (!state) {
        state = initDraftState(db, leagueId) ?? undefined;
        if (state) {
          draftStates.set(leagueId, state);
          startPickTimer(db, state, io);
        }
      }

      if (!state) {
        socket.emit('error', { message: 'Draft non active' });
        return;
      }

      const available = getAvailablePlayers(db, leagueId);
      const picks = db.prepare(`
        SELECT dp.*, u.username, p.name as player_name, p.position, p.team
        FROM draft_picks dp
        JOIN users u ON u.id = dp.user_id
        JOIN players p ON p.id = dp.player_id
        WHERE dp.league_id = ?
        ORDER BY dp.pick_number ASC
      `).all(leagueId);

      socket.emit('draft-state', {
        currentPickIndex: state.currentPickIndex,
        currentUserId: state.pickOrder[state.currentPickIndex],
        pickOrder: state.pickOrder,
        totalPicks: state.totalPicks,
        numTeams: state.numTeams,
        picksPerTeam: state.picksPerTeam,
        timeLeft: state.timeLeft,
        availablePlayers: available,
        picks,
      });
    });

    socket.on('make-pick', ({ leagueId, playerId }: { leagueId: number; playerId: number }) => {
      const state = draftStates.get(leagueId);
      if (!state) {
        socket.emit('pick-error', { error: 'Draft non active' });
        return;
      }

      const currentUserId = state.pickOrder[state.currentPickIndex];
      if (currentUserId !== userId) {
        socket.emit('pick-error', { error: 'Ce n\'est pas votre tour' });
        return;
      }

      if (state.pickedPlayerIds.has(playerId)) {
        socket.emit('pick-error', { error: 'Joueur déjà drafté' });
        return;
      }

      executePick(db, state, playerId, io);
    });

    socket.on('leave-draft', ({ leagueId }: { leagueId: number }) => {
      socket.leave(`draft:${leagueId}`);
    });
  });
}

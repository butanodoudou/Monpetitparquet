import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initializeDatabase } from './db/database';
import { seedDatabase } from './db/seed';
import authRouter from './routes/auth';
import leaguesRouter from './routes/leagues';
import playersRouter from './routes/players';
import teamsRouter from './routes/teams';
import matchesRouter from './routes/matches';
import { setupDraftSocket } from './routes/draft';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

const db = initializeDatabase();
seedDatabase(db);

app.use('/api/auth', authRouter(db));
app.use('/api/leagues', leaguesRouter(db));
app.use('/api/players', playersRouter(db));
app.use('/api/teams', teamsRouter(db));
app.use('/api/matches', matchesRouter(db));

setupDraftSocket(io, db);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🏀 Mon Petit Parquet backend – port ${PORT}`);
});

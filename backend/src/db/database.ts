import Database from 'better-sqlite3';
import path from 'path';

export function initializeDatabase(): Database.Database {
  const dbPath = path.join(__dirname, '../../data.db');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#F59E0B',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      team TEXT NOT NULL,
      position TEXT NOT NULL,
      jersey_number INTEGER,
      nationality TEXT,
      avg_points REAL DEFAULT 0,
      avg_assists REAL DEFAULT 0,
      avg_rebounds REAL DEFAULT 0,
      avg_steals REAL DEFAULT 0,
      avg_blocks REAL DEFAULT 0,
      avg_turnovers REAL DEFAULT 0,
      avg_three_pointers REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      commissioner_id INTEGER REFERENCES users(id),
      max_teams INTEGER DEFAULT 8,
      picks_per_team INTEGER DEFAULT 5,
      draft_status TEXT DEFAULT 'pending',
      current_draft_pick INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS league_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      team_name TEXT,
      draft_position INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(league_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS team_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      player_id INTEGER REFERENCES players(id),
      acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(league_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      match_date DATETIME NOT NULL,
      week INTEGER NOT NULL,
      status TEXT DEFAULT 'scheduled'
    );

    CREATE TABLE IF NOT EXISTS player_performances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER REFERENCES players(id),
      match_id INTEGER REFERENCES matches(id),
      points INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      rebounds INTEGER DEFAULT 0,
      steals INTEGER DEFAULT 0,
      blocks INTEGER DEFAULT 0,
      turnovers INTEGER DEFAULT 0,
      three_pointers INTEGER DEFAULT 0,
      minutes_played INTEGER DEFAULT 0,
      fantasy_score REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS draft_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      player_id INTEGER REFERENCES players(id),
      pick_number INTEGER NOT NULL,
      round INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

export function computeFantasyScore(
  points: number,
  assists: number,
  rebounds: number,
  steals: number,
  blocks: number,
  turnovers: number,
  threePts: number
): number {
  let score =
    points * 1 +
    assists * 2 +
    rebounds * 1.5 +
    steals * 3 +
    blocks * 3 -
    turnovers * 2 +
    threePts * 0.5;

  const doubleDigs = [points >= 10, assists >= 10, rebounds >= 10].filter(Boolean).length;
  if (doubleDigs >= 3) score += 10;
  else if (doubleDigs >= 2) score += 5;

  return Math.round(score * 10) / 10;
}

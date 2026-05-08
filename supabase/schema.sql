-- ============================================================
-- Mon Petit Parquet – Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -------------------------------------------------------
-- Users (custom auth, not Supabase Auth)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#F59E0B',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Real Betclic Élite teams (from Sofascore)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS betclic_teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  city TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Real players (from Sofascore)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  team TEXT NOT NULL,
  team_id INTEGER REFERENCES betclic_teams(id),
  position TEXT,
  jersey_number INTEGER,
  nationality TEXT,
  height TEXT,
  weight TEXT,
  birth_date TEXT,
  photo_url TEXT,
  avg_points REAL DEFAULT 0,
  avg_assists REAL DEFAULT 0,
  avg_rebounds REAL DEFAULT 0,
  avg_steals REAL DEFAULT 0,
  avg_blocks REAL DEFAULT 0,
  avg_turnovers REAL DEFAULT 0,
  avg_three_pointers REAL DEFAULT 0,
  avg_minutes REAL DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  season_avg_fantasy REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Matches (from Sofascore)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  home_team TEXT NOT NULL,
  home_team_id INTEGER,
  away_team TEXT NOT NULL,
  away_team_id INTEGER,
  home_score INTEGER,
  away_score INTEGER,
  match_date TIMESTAMPTZ NOT NULL,
  week INTEGER,
  status TEXT DEFAULT 'scheduled',
  season TEXT DEFAULT '2025-2026',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Player performances per match
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_performances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id INTEGER REFERENCES players(id),
  match_id INTEGER REFERENCES matches(id),
  team_id INTEGER,
  points INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  rebounds INTEGER DEFAULT 0,
  steals INTEGER DEFAULT 0,
  blocks INTEGER DEFAULT 0,
  turnovers INTEGER DEFAULT 0,
  three_pointers INTEGER DEFAULT 0,
  minutes_played INTEGER DEFAULT 0,
  fantasy_score REAL DEFAULT 0,
  UNIQUE(player_id, match_id)
);

-- -------------------------------------------------------
-- Fantasy Leagues
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  commissioner_id UUID REFERENCES users(id),
  max_teams INTEGER DEFAULT 8,
  picks_per_team INTEGER DEFAULT 5,
  draft_status TEXT DEFAULT 'pending',
  draft_type TEXT DEFAULT 'mystery',
  current_draft_pick INTEGER DEFAULT 1,
  pick_deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- League Members
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS league_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  team_name TEXT,
  draft_position INTEGER,
  draft_credits INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);

-- -------------------------------------------------------
-- Team Players (drafted)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  player_id INTEGER REFERENCES players(id),
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, player_id)
);

-- -------------------------------------------------------
-- Draft Picks history
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS draft_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  player_id INTEGER REFERENCES players(id),
  pick_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Mystery Draft Pack Offers
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS draft_pack_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('elite', 'gold', 'silver', 'bronze')),
  player_ids INTEGER[] NOT NULL,
  chosen_player_id INTEGER REFERENCES players(id),
  credits_spent INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Weekly Matchups (head-to-head fantasy duels)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  home_user_id UUID NOT NULL REFERENCES users(id),
  away_user_id UUID NOT NULL REFERENCES users(id),
  home_score FLOAT DEFAULT 0,
  away_score FLOAT DEFAULT 0,
  winner_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Indexes
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_fantasy ON players(season_avg_fantasy DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status, match_date);
CREATE INDEX IF NOT EXISTS idx_perf_player ON player_performances(player_id);
CREATE INDEX IF NOT EXISTS idx_perf_match ON player_performances(match_id);
CREATE INDEX IF NOT EXISTS idx_members_league ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_team_players_league ON team_players(league_id, user_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_league ON draft_picks(league_id);
CREATE INDEX IF NOT EXISTS idx_pack_offers_league_user ON draft_pack_offers(league_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matchups_week_home ON weekly_matchups(league_id, week, home_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matchups_week_away ON weekly_matchups(league_id, week, away_user_id);
CREATE INDEX IF NOT EXISTS idx_matchups_league ON weekly_matchups(league_id);

-- -------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE betclic_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_performances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_pack_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_matchups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read players" ON players FOR SELECT USING (true);
CREATE POLICY "anon read teams" ON betclic_teams FOR SELECT USING (true);
CREATE POLICY "anon read matches" ON matches FOR SELECT USING (true);
CREATE POLICY "anon read performances" ON player_performances FOR SELECT USING (true);
CREATE POLICY "anon read leagues" ON leagues FOR SELECT USING (true);
CREATE POLICY "anon read members" ON league_members FOR SELECT USING (true);
CREATE POLICY "anon read team_players" ON team_players FOR SELECT USING (true);
CREATE POLICY "anon read draft_picks" ON draft_picks FOR SELECT USING (true);
CREATE POLICY "anon read pack_offers" ON draft_pack_offers FOR SELECT USING (true);
CREATE POLICY "anon read matchups" ON weekly_matchups FOR SELECT USING (true);
-- service_role bypasses RLS for all writes

-- -------------------------------------------------------
-- Migration statements (run separately if schema exists)
-- -------------------------------------------------------
-- ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_type TEXT DEFAULT 'mystery';
-- ALTER TABLE league_members ADD COLUMN IF NOT EXISTS draft_credits INTEGER DEFAULT 100;

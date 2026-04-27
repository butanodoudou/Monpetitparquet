import Database from 'better-sqlite3';
import { computeFantasyScore } from './database';

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function genStat(rand: () => number, avg: number, variance = 0.35): number {
  const v = avg * (1 + (rand() - 0.5) * 2 * variance);
  return Math.max(0, Math.round(v));
}

const PLAYERS = [
  // ASVEL Lyon-Villeurbanne
  { name: 'Matthew Strazel', team: 'ASVEL', position: 'PG', jersey: 0, nationality: 'France', pts: 14.2, ast: 5.1, reb: 3.2, stl: 1.4, blk: 0.3, tov: 2.1, thr: 1.8 },
  { name: 'Moustapha Fall', team: 'ASVEL', position: 'C', jersey: 35, nationality: 'France', pts: 16.8, ast: 1.2, reb: 8.4, stl: 0.6, blk: 2.4, tov: 1.8, thr: 0.2 },
  { name: 'Charles Kahudi', team: 'ASVEL', position: 'SF', jersey: 21, nationality: 'France', pts: 11.3, ast: 2.8, reb: 5.6, stl: 1.2, blk: 0.6, tov: 1.4, thr: 1.2 },
  { name: 'Jordan Harper', team: 'ASVEL', position: 'SG', jersey: 7, nationality: 'USA', pts: 12.6, ast: 3.4, reb: 2.8, stl: 1.3, blk: 0.2, tov: 1.6, thr: 1.6 },
  { name: 'Wade Baldwin', team: 'ASVEL', position: 'PG', jersey: 4, nationality: 'USA', pts: 13.4, ast: 6.2, reb: 3.0, stl: 1.1, blk: 0.2, tov: 2.4, thr: 1.4 },
  { name: 'Adrien Moerman', team: 'ASVEL', position: 'PF', jersey: 13, nationality: 'France', pts: 9.8, ast: 1.6, reb: 7.2, stl: 0.8, blk: 0.9, tov: 1.2, thr: 0.8 },
  { name: 'Vincent Sanford', team: 'ASVEL', position: 'SF', jersey: 15, nationality: 'USA', pts: 10.2, ast: 1.8, reb: 4.8, stl: 1.0, blk: 0.4, tov: 1.1, thr: 1.0 },
  { name: 'Léo Cavalière', team: 'ASVEL', position: 'SG', jersey: 11, nationality: 'France', pts: 8.4, ast: 2.1, reb: 2.4, stl: 0.9, blk: 0.1, tov: 1.0, thr: 0.9 },

  // Paris Basketball
  { name: 'TJ Shorts', team: 'Paris Basketball', position: 'PG', jersey: 5, nationality: 'USA', pts: 20.4, ast: 8.3, reb: 4.2, stl: 1.8, blk: 0.4, tov: 3.2, thr: 1.6 },
  { name: 'Maodo Lo', team: 'Paris Basketball', position: 'SG', jersey: 11, nationality: 'Allemagne', pts: 15.7, ast: 4.6, reb: 3.1, stl: 1.2, blk: 0.3, tov: 1.8, thr: 2.1 },
  { name: 'Juhann Begarin', team: 'Paris Basketball', position: 'SG', jersey: 2, nationality: 'France', pts: 12.8, ast: 2.9, reb: 3.8, stl: 1.6, blk: 0.4, tov: 1.4, thr: 1.3 },
  { name: 'Olek Balcerowski', team: 'Paris Basketball', position: 'C', jersey: 33, nationality: 'Pologne', pts: 14.1, ast: 1.4, reb: 9.2, stl: 0.7, blk: 2.1, tov: 2.0, thr: 0.4 },
  { name: 'Travis Lester', team: 'Paris Basketball', position: 'PF', jersey: 21, nationality: 'USA', pts: 11.6, ast: 1.7, reb: 6.8, stl: 0.9, blk: 1.2, tov: 1.6, thr: 0.6 },
  { name: 'Hugo Robineau', team: 'Paris Basketball', position: 'PG', jersey: 14, nationality: 'France', pts: 8.1, ast: 4.8, reb: 2.2, stl: 1.0, blk: 0.1, tov: 1.8, thr: 0.8 },
  { name: 'Marc Débastard', team: 'Paris Basketball', position: 'SF', jersey: 8, nationality: 'France', pts: 7.8, ast: 1.9, reb: 3.6, stl: 0.8, blk: 0.3, tov: 0.9, thr: 0.7 },
  { name: 'Femi Oluseun', team: 'Paris Basketball', position: 'SF', jersey: 17, nationality: 'France', pts: 9.3, ast: 2.2, reb: 4.1, stl: 1.1, blk: 0.5, tov: 1.2, thr: 0.9 },

  // Monaco
  { name: 'Mike James', team: 'Monaco', position: 'PG', jersey: 13, nationality: 'USA', pts: 22.1, ast: 6.8, reb: 3.4, stl: 1.6, blk: 0.3, tov: 3.4, thr: 2.4 },
  { name: 'Donatas Motiejunas', team: 'Monaco', position: 'PF', jersey: 41, nationality: 'Lituanie', pts: 16.3, ast: 2.4, reb: 8.7, stl: 0.8, blk: 1.4, tov: 2.0, thr: 1.2 },
  { name: 'Donta Hall', team: 'Monaco', position: 'C', jersey: 24, nationality: 'USA', pts: 12.4, ast: 0.8, reb: 10.2, stl: 0.6, blk: 2.8, tov: 1.6, thr: 0.0 },
  { name: 'Jordan Loyd', team: 'Monaco', position: 'SG', jersey: 5, nationality: 'USA', pts: 17.6, ast: 3.9, reb: 3.2, stl: 1.4, blk: 0.3, tov: 2.1, thr: 2.2 },
  { name: 'Élie Okobo', team: 'Monaco', position: 'PG', jersey: 2, nationality: 'France', pts: 13.2, ast: 5.4, reb: 2.8, stl: 1.3, blk: 0.2, tov: 2.2, thr: 1.6 },
  { name: 'Yakuba Ouattara', team: 'Monaco', position: 'SF', jersey: 7, nationality: 'France', pts: 10.8, ast: 1.6, reb: 4.4, stl: 1.1, blk: 0.6, tov: 1.2, thr: 1.0 },
  { name: 'Alpha Diallo', team: 'Monaco', position: 'SF', jersey: 21, nationality: 'France', pts: 9.6, ast: 2.1, reb: 5.1, stl: 1.0, blk: 0.5, tov: 1.3, thr: 0.8 },
  { name: 'Norris Cole', team: 'Monaco', position: 'PG', jersey: 30, nationality: 'USA', pts: 11.4, ast: 4.2, reb: 3.6, stl: 1.5, blk: 0.2, tov: 1.8, thr: 1.2 },

  // JL Bourg
  { name: 'Rihards Lomazs', team: 'JL Bourg', position: 'PG', jersey: 4, nationality: 'Lettonie', pts: 16.2, ast: 5.8, reb: 3.1, stl: 1.2, blk: 0.2, tov: 2.4, thr: 1.8 },
  { name: 'Zoran Dragić', team: 'JL Bourg', position: 'SG', jersey: 11, nationality: 'Slovénie', pts: 14.8, ast: 3.2, reb: 3.7, stl: 1.1, blk: 0.3, tov: 1.6, thr: 2.0 },
  { name: 'Rasheed Sulaimon', team: 'JL Bourg', position: 'SF', jersey: 14, nationality: 'USA', pts: 13.6, ast: 2.6, reb: 4.2, stl: 1.3, blk: 0.4, tov: 1.4, thr: 1.4 },
  { name: 'Antoine Diot', team: 'JL Bourg', position: 'SG', jersey: 9, nationality: 'France', pts: 10.4, ast: 4.3, reb: 2.9, stl: 1.0, blk: 0.1, tov: 1.6, thr: 1.2 },
  { name: 'Khadim Sy', team: 'JL Bourg', position: 'C', jersey: 31, nationality: 'France', pts: 11.2, ast: 0.9, reb: 8.6, stl: 0.5, blk: 1.8, tov: 1.4, thr: 0.1 },
  { name: 'Ivan Février', team: 'JL Bourg', position: 'PF', jersey: 22, nationality: 'France', pts: 8.9, ast: 1.4, reb: 6.4, stl: 0.7, blk: 0.8, tov: 1.1, thr: 0.4 },
  { name: 'Loïc Schwartz', team: 'JL Bourg', position: 'PF', jersey: 8, nationality: 'France', pts: 9.4, ast: 1.8, reb: 5.8, stl: 0.6, blk: 0.6, tov: 1.2, thr: 0.6 },
  { name: 'Cyril Akpomedah', team: 'JL Bourg', position: 'SF', jersey: 3, nationality: 'France', pts: 8.2, ast: 2.4, reb: 3.9, stl: 0.9, blk: 0.3, tov: 1.0, thr: 0.8 },

  // Strasbourg IG
  { name: 'Kenny Chery', team: 'Strasbourg', position: 'PG', jersey: 3, nationality: 'Canada', pts: 17.4, ast: 6.1, reb: 3.3, stl: 1.4, blk: 0.2, tov: 2.6, thr: 1.9 },
  { name: 'Bonzie Colson', team: 'Strasbourg', position: 'PF', jersey: 11, nationality: 'USA', pts: 15.8, ast: 2.2, reb: 8.4, stl: 0.9, blk: 0.8, tov: 1.8, thr: 0.8 },
  { name: 'Thomas Scrubb', team: 'Strasbourg', position: 'SG', jersey: 5, nationality: 'Canada', pts: 13.6, ast: 3.4, reb: 4.2, stl: 1.2, blk: 0.4, tov: 1.6, thr: 1.6 },
  { name: 'Marcus Landry', team: 'Strasbourg', position: 'SF', jersey: 8, nationality: 'USA', pts: 12.4, ast: 1.8, reb: 4.6, stl: 1.0, blk: 0.5, tov: 1.4, thr: 1.1 },
  { name: 'Mathieu Wojciechowski', team: 'Strasbourg', position: 'C', jersey: 42, nationality: 'France', pts: 9.8, ast: 1.2, reb: 7.4, stl: 0.4, blk: 1.6, tov: 1.2, thr: 0.2 },
  { name: 'Axel Bouteille', team: 'Strasbourg', position: 'SG', jersey: 15, nationality: 'France', pts: 10.2, ast: 2.8, reb: 2.6, stl: 0.9, blk: 0.2, tov: 1.1, thr: 1.4 },
  { name: 'Ousmane Camara', team: 'Strasbourg', position: 'SF', jersey: 7, nationality: 'France', pts: 11.8, ast: 2.6, reb: 5.2, stl: 1.1, blk: 0.6, tov: 1.3, thr: 1.0 },
  { name: 'Kilian Douessin', team: 'Strasbourg', position: 'PG', jersey: 1, nationality: 'France', pts: 7.8, ast: 3.6, reb: 2.1, stl: 0.8, blk: 0.1, tov: 1.4, thr: 0.7 },

  // Nanterre 92
  { name: 'Dee Bost', team: 'Nanterre 92', position: 'PG', jersey: 10, nationality: 'USA', pts: 18.6, ast: 7.2, reb: 3.8, stl: 1.6, blk: 0.2, tov: 3.0, thr: 1.8 },
  { name: 'Stefan Moody', team: 'Nanterre 92', position: 'PG', jersey: 4, nationality: 'USA', pts: 15.4, ast: 4.8, reb: 2.6, stl: 1.3, blk: 0.2, tov: 2.2, thr: 2.0 },
  { name: 'Amine Noua', team: 'Nanterre 92', position: 'SF', jersey: 22, nationality: 'France', pts: 12.8, ast: 2.2, reb: 5.4, stl: 1.1, blk: 0.8, tov: 1.4, thr: 1.2 },
  { name: 'Rasheed Thomas', team: 'Nanterre 92', position: 'SF', jersey: 15, nationality: 'USA', pts: 13.2, ast: 3.1, reb: 4.8, stl: 1.4, blk: 0.4, tov: 1.6, thr: 1.4 },
  { name: 'Yoan Makoundou', team: 'Nanterre 92', position: 'C', jersey: 33, nationality: 'France', pts: 11.4, ast: 1.1, reb: 8.8, stl: 0.6, blk: 2.0, tov: 1.6, thr: 0.2 },
  { name: 'François Réau', team: 'Nanterre 92', position: 'PF', jersey: 19, nationality: 'France', pts: 9.2, ast: 1.6, reb: 6.2, stl: 0.7, blk: 0.7, tov: 1.2, thr: 0.6 },
  { name: 'Hugo Invernizzi', team: 'Nanterre 92', position: 'SG', jersey: 2, nationality: 'France', pts: 10.6, ast: 2.4, reb: 2.8, stl: 1.0, blk: 0.2, tov: 1.2, thr: 1.4 },
  { name: 'Dewan Hernandez', team: 'Nanterre 92', position: 'PF', jersey: 21, nationality: 'USA', pts: 10.8, ast: 1.4, reb: 7.1, stl: 0.6, blk: 1.4, tov: 1.4, thr: 0.3 },

  // Le Mans Sarthe Basket
  { name: 'David Holston', team: 'Le Mans', position: 'PG', jersey: 7, nationality: 'USA', pts: 19.2, ast: 7.8, reb: 3.6, stl: 1.8, blk: 0.2, tov: 3.2, thr: 2.0 },
  { name: 'Mam Jaiteh', team: 'Le Mans', position: 'C', jersey: 44, nationality: 'Gambie', pts: 14.6, ast: 1.4, reb: 9.8, stl: 0.6, blk: 2.6, tov: 2.0, thr: 0.1 },
  { name: 'William Howard', team: 'Le Mans', position: 'PF', jersey: 10, nationality: 'France', pts: 11.8, ast: 2.1, reb: 7.2, stl: 0.8, blk: 1.0, tov: 1.4, thr: 0.6 },
  { name: 'Sofiane Fofana', team: 'Le Mans', position: 'SF', jersey: 12, nationality: 'France', pts: 10.8, ast: 2.4, reb: 4.2, stl: 1.0, blk: 0.4, tov: 1.2, thr: 1.0 },
  { name: 'Dylan Osetkowski', team: 'Le Mans', position: 'PF', jersey: 23, nationality: 'USA', pts: 12.6, ast: 1.9, reb: 6.4, stl: 0.7, blk: 0.8, tov: 1.6, thr: 0.8 },
  { name: 'Nicolas Lang', team: 'Le Mans', position: 'SG', jersey: 6, nationality: 'France', pts: 9.4, ast: 2.6, reb: 2.8, stl: 1.0, blk: 0.2, tov: 1.1, thr: 1.2 },
  { name: 'Théodore Thivillon', team: 'Le Mans', position: 'PG', jersey: 1, nationality: 'France', pts: 8.2, ast: 4.6, reb: 2.4, stl: 0.9, blk: 0.1, tov: 1.8, thr: 0.8 },
  { name: 'DaJuan Coleman', team: 'Le Mans', position: 'C', jersey: 55, nationality: 'USA', pts: 10.4, ast: 0.8, reb: 8.6, stl: 0.5, blk: 1.8, tov: 1.4, thr: 0.0 },

  // Limoges CSP
  { name: 'Gabriel Lundberg', team: 'Limoges CSP', position: 'PG', jersey: 14, nationality: 'Danemark', pts: 16.4, ast: 5.8, reb: 3.2, stl: 1.3, blk: 0.2, tov: 2.4, thr: 2.0 },
  { name: 'Jarvis Williams', team: 'Limoges CSP', position: 'SG', jersey: 3, nationality: 'USA', pts: 17.8, ast: 4.2, reb: 3.6, stl: 1.6, blk: 0.4, tov: 2.0, thr: 2.2 },
  { name: 'Marcus Thornton', team: 'Limoges CSP', position: 'SG', jersey: 8, nationality: 'USA', pts: 14.6, ast: 2.8, reb: 3.2, stl: 1.2, blk: 0.3, tov: 1.6, thr: 2.0 },
  { name: 'Thibaut Petit-Frère', team: 'Limoges CSP', position: 'C', jersey: 30, nationality: 'France', pts: 12.8, ast: 1.2, reb: 8.4, stl: 0.6, blk: 2.2, tov: 1.8, thr: 0.2 },
  { name: 'Jérémy Nzeulie', team: 'Limoges CSP', position: 'SF', jersey: 6, nationality: 'France', pts: 10.2, ast: 1.8, reb: 4.6, stl: 1.0, blk: 0.5, tov: 1.2, thr: 0.9 },
  { name: 'Anthony Labanca', team: 'Limoges CSP', position: 'PF', jersey: 22, nationality: 'France', pts: 9.6, ast: 1.6, reb: 6.8, stl: 0.7, blk: 0.8, tov: 1.2, thr: 0.5 },
  { name: 'Léo Legendre', team: 'Limoges CSP', position: 'SF', jersey: 15, nationality: 'France', pts: 8.4, ast: 2.2, reb: 3.8, stl: 0.8, blk: 0.3, tov: 1.0, thr: 0.8 },
  { name: 'Lamine Sambe', team: 'Limoges CSP', position: 'C', jersey: 42, nationality: 'France', pts: 10.8, ast: 0.9, reb: 7.6, stl: 0.5, blk: 1.6, tov: 1.4, thr: 0.1 },
];

const SCHEDULE = [
  // Week 1 (finished) - April 6, 2026
  { week: 1, home: 'ASVEL', away: 'Paris Basketball', homeScore: 84, awayScore: 79, date: '2026-04-06 20:00' },
  { week: 1, home: 'Monaco', away: 'JL Bourg', homeScore: 91, awayScore: 76, date: '2026-04-06 20:00' },
  { week: 1, home: 'Strasbourg', away: 'Nanterre 92', homeScore: 78, awayScore: 82, date: '2026-04-07 20:00' },
  { week: 1, home: 'Le Mans', away: 'Limoges CSP', homeScore: 88, awayScore: 93, date: '2026-04-07 20:00' },

  // Week 2 (finished) - April 9, 2026
  { week: 2, home: 'ASVEL', away: 'Monaco', homeScore: 79, awayScore: 88, date: '2026-04-09 20:00' },
  { week: 2, home: 'Paris Basketball', away: 'JL Bourg', homeScore: 96, awayScore: 84, date: '2026-04-09 20:00' },
  { week: 2, home: 'Strasbourg', away: 'Le Mans', homeScore: 81, awayScore: 77, date: '2026-04-10 20:00' },
  { week: 2, home: 'Nanterre 92', away: 'Limoges CSP', homeScore: 74, awayScore: 80, date: '2026-04-10 20:00' },

  // Week 3 (finished) - April 13, 2026
  { week: 3, home: 'ASVEL', away: 'Strasbourg', homeScore: 86, awayScore: 80, date: '2026-04-13 20:00' },
  { week: 3, home: 'Paris Basketball', away: 'Nanterre 92', homeScore: 89, awayScore: 83, date: '2026-04-13 20:00' },
  { week: 3, home: 'Monaco', away: 'Le Mans', homeScore: 94, awayScore: 82, date: '2026-04-14 20:00' },
  { week: 3, home: 'JL Bourg', away: 'Limoges CSP', homeScore: 77, awayScore: 85, date: '2026-04-14 20:00' },

  // Week 4 (finished) - April 16, 2026
  { week: 4, home: 'ASVEL', away: 'Nanterre 92', homeScore: 82, awayScore: 75, date: '2026-04-16 20:00' },
  { week: 4, home: 'Paris Basketball', away: 'Monaco', homeScore: 88, awayScore: 91, date: '2026-04-16 20:00' },
  { week: 4, home: 'Strasbourg', away: 'JL Bourg', homeScore: 79, awayScore: 83, date: '2026-04-17 20:00' },
  { week: 4, home: 'Le Mans', away: 'Limoges CSP', homeScore: 91, awayScore: 87, date: '2026-04-17 20:00' },

  // Week 5 (scheduled) - April 23, 2026
  { week: 5, home: 'ASVEL', away: 'JL Bourg', homeScore: null, awayScore: null, date: '2026-04-23 20:00' },
  { week: 5, home: 'Paris Basketball', away: 'Limoges CSP', homeScore: null, awayScore: null, date: '2026-04-23 20:00' },
  { week: 5, home: 'Monaco', away: 'Nanterre 92', homeScore: null, awayScore: null, date: '2026-04-24 20:00' },
  { week: 5, home: 'Strasbourg', away: 'Le Mans', homeScore: null, awayScore: null, date: '2026-04-24 20:00' },

  // Week 6 (scheduled) - April 30, 2026
  { week: 6, home: 'ASVEL', away: 'Le Mans', homeScore: null, awayScore: null, date: '2026-04-30 20:00' },
  { week: 6, home: 'Paris Basketball', away: 'Strasbourg', homeScore: null, awayScore: null, date: '2026-04-30 20:00' },
  { week: 6, home: 'Monaco', away: 'Limoges CSP', homeScore: null, awayScore: null, date: '2026-05-01 20:00' },
  { week: 6, home: 'Nanterre 92', away: 'JL Bourg', homeScore: null, awayScore: null, date: '2026-05-01 20:00' },

  // Week 7 (scheduled) - May 7, 2026
  { week: 7, home: 'ASVEL', away: 'Limoges CSP', homeScore: null, awayScore: null, date: '2026-05-07 20:00' },
  { week: 7, home: 'Paris Basketball', away: 'Le Mans', homeScore: null, awayScore: null, date: '2026-05-07 20:00' },
  { week: 7, home: 'Monaco', away: 'Strasbourg', homeScore: null, awayScore: null, date: '2026-05-08 20:00' },
  { week: 7, home: 'Nanterre 92', away: 'JL Bourg', homeScore: null, awayScore: null, date: '2026-05-08 20:00' },

  // Week 8 (scheduled) - May 14, 2026
  { week: 8, home: 'ASVEL', away: 'JL Bourg', homeScore: null, awayScore: null, date: '2026-05-14 20:00' },
  { week: 8, home: 'Paris Basketball', away: 'Monaco', homeScore: null, awayScore: null, date: '2026-05-14 20:00' },
  { week: 8, home: 'Strasbourg', away: 'Limoges CSP', homeScore: null, awayScore: null, date: '2026-05-15 20:00' },
  { week: 8, home: 'Nanterre 92', away: 'Le Mans', homeScore: null, awayScore: null, date: '2026-05-15 20:00' },
];

export function seedDatabase(db: Database.Database): void {
  const existingPlayers = db.prepare('SELECT COUNT(*) as count FROM players').get() as { count: number };
  if (existingPlayers.count > 0) return;

  const insertPlayer = db.prepare(`
    INSERT INTO players (name, team, position, jersey_number, nationality,
      avg_points, avg_assists, avg_rebounds, avg_steals, avg_blocks, avg_turnovers, avg_three_pointers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMatch = db.prepare(`
    INSERT INTO matches (home_team, away_team, home_score, away_score, match_date, week, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPerf = db.prepare(`
    INSERT INTO player_performances (player_id, match_id, points, assists, rebounds, steals, blocks, turnovers, three_pointers, minutes_played, fantasy_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    // Insert players
    for (const p of PLAYERS) {
      insertPlayer.run(p.name, p.team, p.position, p.jersey, p.nationality,
        p.pts, p.ast, p.reb, p.stl, p.blk, p.tov, p.thr);
    }

    // Build player lookup by team
    const allPlayers = db.prepare('SELECT id, team FROM players').all() as { id: number; team: string }[];
    const playersByTeam = new Map<string, number[]>();
    for (const p of allPlayers) {
      if (!playersByTeam.has(p.team)) playersByTeam.set(p.team, []);
      playersByTeam.get(p.team)!.push(p.id);
    }

    const playerMap = new Map<number, typeof PLAYERS[0]>();
    const dbPlayers = db.prepare('SELECT id, name FROM players').all() as { id: number; name: string }[];
    for (const dp of dbPlayers) {
      const p = PLAYERS.find(pl => pl.name === dp.name);
      if (p) playerMap.set(dp.id, p);
    }

    // Insert matches and performances
    for (const m of SCHEDULE) {
      const isFinished = m.homeScore !== null;
      const result = insertMatch.run(
        m.home, m.away, m.homeScore, m.awayScore, m.date, m.week,
        isFinished ? 'finished' : 'scheduled'
      );
      const matchId = result.lastInsertRowid as number;

      if (!isFinished) continue;

      const homePlayerIds = playersByTeam.get(m.home) || [];
      const awayPlayerIds = playersByTeam.get(m.away) || [];
      const allMatchPlayerIds = [...homePlayerIds, ...awayPlayerIds];

      const rand = rng(matchId * 31337);

      for (const pid of allMatchPlayerIds) {
        const pdata = playerMap.get(pid);
        if (!pdata) continue;

        const pts = genStat(rand, pdata.pts);
        const ast = genStat(rand, pdata.ast);
        const reb = genStat(rand, pdata.reb);
        const stl = genStat(rand, pdata.stl);
        const blk = genStat(rand, pdata.blk);
        const tov = genStat(rand, pdata.tov);
        const thr = Math.min(genStat(rand, pdata.thr), Math.floor(pts / 3));
        const mins = 20 + Math.floor(rand() * 18);
        const fs = computeFantasyScore(pts, ast, reb, stl, blk, tov, thr);

        insertPerf.run(pid, matchId, pts, ast, reb, stl, blk, tov, thr, mins, fs);
      }
    }
  });

  seedAll();
}

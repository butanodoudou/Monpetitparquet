# Mon Petit Parquet — Design & Architecture

## Structure des dossiers
```
app/
  api/                     # API Routes Next.js (serverless)
    auth/login|register|me/  # Auth JWT
    leagues/[id]/            # CRUD ligue + start-draft
    draft/[id]/pick/         # Logique de draft
    players/                 # Liste joueurs (avec drafted_by par ligue)
    teams/[leagueId]/        # Mon équipe, classement
    matches/                 # Matchs du moment
    sync/players|results/    # Sync depuis api-sports.io (cron)
  auth/                    # Page login/register
  home/                    # Dashboard
  leagues/[id]/draft/      # Salle de draft live
  leagues/[id]/team/       # Mon équipe
  leagues/[id]/            # Détail ligue
  leagues/                 # Liste ligues
  players/                 # Catalogue joueurs
components/
  BottomNav.tsx            # Navigation bas de page mobile
  TopBar.tsx               # Barre du haut avec titre
  PlayerCard.tsx           # Carte joueur réutilisable
lib/
  supabase.ts              # getSupabase() anon (Realtime) + db() service role (API)
  auth.ts                  # signToken / verifyToken / getAuth
  fantasy.ts               # computeFantasyScore + buildSnakeOrder
  sports-api.ts            # Wrapper api-sports.io + normalizers
store/
  authStore.ts             # Zustand : user + token (persisté en localStorage)
supabase/
  schema.sql               # Schéma complet à appliquer dans Supabase
```

## Schéma base de données (Supabase / PostgreSQL)

### Tables principales
| Table | Rôle |
|---|---|
| `users` | Auth maison (pas Supabase Auth) |
| `betclic_teams` | Équipes réelles Pro A |
| `players` | Joueurs réels + moyennes saison |
| `matches` | Matchs Pro A |
| `player_performances` | Stats par match (base du calcul fantasy) |
| `leagues` | Ligues fantasy |
| `league_members` | Membres d'une ligue (draft_position) |
| `team_players` | Joueurs draftés par user dans une ligue |
| `draft_picks` | Historique des picks de draft |

## Calcul du score fantasy
Défini dans `lib/fantasy.ts:computeFantasyScore` :
```
pts×1 + ast×2 + reb×1.5 + stl×3 + blk×3 - to×2 + 3pts×0.5
+ bonus double-double (+5) ou triple-double (+10)
```

## Draft en serpent (snake draft)
`lib/fantasy.ts:buildSnakeOrder` — les rounds pairs inversent l'ordre des pickers.
- Chaque pick a 45s, timer côté client
- Realtime via Supabase `postgres_changes` sur `draft_picks` et `leagues`
- Auto-pick déclenché par n'importe quel client quand timer = 0, le serveur déduplique via `current_draft_pick`

## Auth
- JWT custom signé avec `JWT_SECRET`, expiration 30j
- Stocké en `localStorage` via Zustand (`store/authStore.ts`)
- Transmis en header `Authorization: Bearer <token>` sur toutes les API Routes
- `getAuth(req)` dans `lib/auth.ts` extrait et vérifie le token côté serveur

## Clients Supabase (deux cas d'usage)
- `getSupabase()` — anon key, pour les subscriptions Realtime côté browser, lazy init
- `db()` — service_role key, pour toutes les écritures en API Routes (contourne RLS)

## Sync données sportives
- `POST /api/sync/players` — charge tous les joueurs + moyennes depuis api-sports.io
- `POST /api/sync/results` — synchronise les matchs + performances du jour, recalcule `season_avg_fantasy`
- Exécuté via Vercel Cron (`vercel.json`) chaque soir à 23h UTC

## Patterns UI
- Mobile-first, max-width 480px centré
- Palette sombre : slate-900 / slate-800 / slate-700
- Couleur accent : `--brand` (#F59E0B, ambre)
- Polices : Inter (Google Fonts)
- Pas de bibliothèque de composants — Tailwind pur

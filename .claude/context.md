# Mon Petit Parquet — Contexte projet

## Vue d'ensemble
Application mobile-first de **fantasy basketball** basée sur la **Betclic Élite** (Pro A, France).
Les joueurs drafte de vrais joueurs NBA… pardon, Pro A, et accumulent des points fantasy basés sur leurs performances réelles.

## Stack technique
- **Frontend** : Next.js 14 (App Router), React 18, Tailwind CSS, Zustand
- **Backend** : Next.js API Routes (serverless), JWT maison
- **Base de données** : Supabase (PostgreSQL + Realtime)
- **Données sportives** : Sofascore (API non officielle) — pas de clé, via ScraperAPI pour contourner Cloudflare
- **Déploiement** : Vercel (avec cron job Vercel)
- **Auth** : JWT custom (pas Supabase Auth), bcryptjs pour le hash

## Flux principal
1. Inscription / connexion → JWT stocké en `localStorage` via Zustand
2. Créer ou rejoindre une ligue (code d'invitation)
3. Le commissaire lance le draft → draft en serpent en temps réel via Supabase Realtime
4. Les scores fantasy sont calculés automatiquement chaque soir par le cron

## URLs importantes
- `/auth` — Connexion / inscription
- `/home` — Dashboard
- `/leagues` — Liste des ligues
- `/leagues/[id]` — Détail d'une ligue
- `/leagues/[id]/draft` — Salle de draft live
- `/leagues/[id]/team` — Mon équipe dans cette ligue
- `/players` — Catalogue des joueurs

## Variables d'environnement requises
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET
SCRAPER_API_KEY        ← ScraperAPI (proxy Cloudflare pour Sofascore)
CRON_SECRET
```

## Cron job
- `/api/sync/results` — exécuté chaque jour à 23h UTC (Vercel cron) — synchronise les matchs des 48h et calcule les scores fantasy
- Backfill manuel : `POST /api/sync/results?secret=CRON_SECRET&round=N` — synchronise une journée spécifique

## Données sportives — Sofascore
- Tournament ID : 156 (Pro A / Betclic Élite)
- Season ID : 79100 (2025-2026)
- Endpoints clés :
  - Équipes : `/unique-tournament/156/season/79100/teams`
  - Matchs récents : `/unique-tournament/156/season/79100/events/last/0`
  - Matchs par journée : `/unique-tournament/156/season/79100/events/round/{N}`
  - Stats joueurs : `/event/{id}/lineups`
- IDs en base = IDs Sofascore (joueurs, équipes, matchs)
- **Attention** : le champ round dans les events s'appelle `roundInfo.round` (pas `round.round`)
- Données en base : J25 à J28 backfillées (32 matchs, 693 performances)

## Points d'attention
- Sofascore est derrière Cloudflare : bloque Node.js et Edge Runtime Vercel → proxy via ScraperAPI obligatoire en prod
- Le client Supabase est initialisé en **lazy** pour éviter les erreurs au build Vercel
- Le `serviceKey` (service_role) contourne la RLS → uniquement utilisé dans les API Routes server-side
- La RLS est activée sur toutes les tables mais les reads sont ouverts (anon) pour les subscriptions Realtime
- Timer de draft côté client (45s) : tous les clients peuvent déclencher l'auto-pick, le serveur déduplique
- `authStore` : le `user` ET le `token` sont persistés en localStorage — une session sans `user` est purgée automatiquement au démarrage

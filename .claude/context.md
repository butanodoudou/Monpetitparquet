# Mon Petit Parquet — Contexte projet

## Vue d'ensemble
Application mobile-first de **fantasy basketball** basée sur la **LNB Élite** (ex Pro A / Betclic Élite, France).
**Saison en cours : 2026-2027** (démarrée fin septembre 2026).
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
   - Barème (révisé 2026-10-08) : `pts×1 + ast×1.5 + reb_off×1.5 + reb_def×1 + stl×2 + blk×2 − TO×1.5 − tir_manqué×0.5 − LF_manqué×0.5 + 3PM×0.5`
   - Plus de bonus double-double / triple-double. Barème dans `SCORING` (`lib/fantasy.ts`)
5. Chaque semaine, un duel oppose deux managers — le score final intègre trois modificateurs : chimie, bonus weekend, malus défensif adverse

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
- `/api/sync/players?secret=...` — effectifs de la saison en cours + désactive (`is_active = false`) les joueurs qui ont quitté la ligue
- `/api/sync/averages` — recalcule les `avg_*` sur la **saison en cours uniquement** (jointure `matches.season`) ; remet tout à 0 avant recalcul. **Dans le cron à 23h30 UTC** (après `sync/results`), et lançable à la main avec `?secret=`

## Données sportives — Sofascore
- Tournament ID : 156 (LNB Élite, ex Pro A / Betclic Élite)
- Season ID : **102568** (2026-2027) — défini dans `lib/sports-api.ts` avec `CURRENT_SEASON = '2026-2027'`
- Saisons précédentes : 79100 (25/26), 64004 (24/25), 53266 (23/24)
- Seul endroit à changer à l'intersaison : les deux constantes de `lib/sports-api.ts`
- Endpoints clés :
  - Équipes : `/unique-tournament/156/season/79100/teams`
  - Matchs récents : `/unique-tournament/156/season/79100/events/last/0`
  - Matchs par journée : `/unique-tournament/156/season/79100/events/round/{N}`
  - Stats joueurs : `/event/{id}/lineups`
- IDs en base = IDs Sofascore (joueurs, équipes, matchs)
- **Attention** : le champ round dans les events s'appelle `roundInfo.round` (pas `round.round`)
- Saison 2025-2026 en base : J25 à J28 (32 matchs, 693 performances) — conservées comme historique, exclues des moyennes
- Saison 2026-2027 : migration SQL + syncs à exécuter (voir `supabase/migrations/2026-10-08_saison-2026-2027.sql`)

## Points d'attention
- Sofascore est derrière Cloudflare : bloque Node.js et Edge Runtime Vercel → proxy via ScraperAPI obligatoire en prod
- Le client Supabase est initialisé en **lazy** pour éviter les erreurs au build Vercel
- Le `serviceKey` (service_role) contourne la RLS → uniquement utilisé dans les API Routes server-side
- La RLS est activée sur toutes les tables mais les reads sont ouverts (anon) pour les subscriptions Realtime
- Timer de draft côté client (45s) : tous les clients peuvent déclencher l'auto-pick, le serveur déduplique
- Les moyennes joueurs sont **par saison** : toute requête sur `season_avg_fantasy` doit filtrer `is_active = true`, sinon les joueurs partis (moyennes à 0) faussent les percentiles de tiers
- `authStore` : le `user` ET le `token` sont persistés en localStorage — une session sans `user` est purgée automatiquement au démarrage

## Outillage Claude Code (depuis 2026-10-15)
- Agents dans `.claude/agents/` : `dev` (implémentation, de préférence dans un worktree), `designer` (maquettes HTML, ne touche pas au code de l'app), `veille` (recherche externe sourcée). Le chef d'orchestre est la session principale.
- Skills dans `.claude/skills/` : `supabase-postgres-best-practices` (Supabase, MIT) et `frontend-design` (Anthropic). Ils ont été relus avant l'installation : texte uniquement, aucun script.
- Planning : beta mi-janvier 2027 (drafts le 16-17 janv., duels à partir du 18 janv.).

## État au 2026-10-30 : v0 beta prête côté code (non commitée, migrations non appliquées)
- **Loterie du lundi** : spec `.claude/specs/loterie.md`, maquette `design/loterie.html`, page `/leagues/[id]/lottery`, routes `app/api/lottery/**`, logique `lib/lottery*.ts`, tests `npx tsx scripts/check-lottery.ts` (52 cas).
- **Cœur de jeu** : `lib/week-scoring.ts` est le seul endroit où l'on calcule un duel (journée jouable, verrou de compo, clôture `settleFinishedWeeks`, V-N-D `loadRecords`). Les duels portent une `season`.
- **Client** : tous les appels authentifiés passent par `lib/api-client.ts` (`apiFetch`, déconnexion sur 401).
- **Nouvelles pages** : `/rules`, `/leagues/[id]/lottery`. Lien d'invitation `/leagues?join=CODE`, qui survit au passage par `/auth?next=`.
- **Crons** : `sync/results` 23h UTC (résultats + matchs à venir + clôture des duels), `sync/averages` 23h30, `lottery/run` lundi 8h UTC.
- **Migrations à appliquer dans l'ordre** : 2026-10-31_prod-drift (EN PREMIER : matches.season était integer en prod), 2026-10-08 (NE PAS rejouer), 2026-10-15_auction-tables, 2026-10-30_core-fixes, 2026-10-30_draft-fixes, 2026-10-30_lottery, 2026-10-31_v0-fixes.
- Coupé de la beta : marché des transferts, trades, In Form, capitaine ×2, notifications push.
- Après la beta, inspirations Sorare (2026-11-05, voir decisions.md) : plafond sur le cinq, puis rareté via In Form, puis marché en monnaie virtuelle. Pas d'argent réel ni de NFT.

## État au 2026-11-06
- Sofascore passe par `www.sofascore.com`, `api.sofascore.com` étant bloqué via ScraperAPI.
- Calendrier des duels : `createLeagueSchedule`, à partir de la prochaine journée jouable.
- Direction visuelle validée : clair et haut de gamme, maquette `design/cartes-raretes.html`. L'app reste sombre tant que le thème n'est pas intégré. Les sections « Patterns UI » de `design.md` décrivent encore l'ancien thème.
- `.claude/settings.local.json` contient une ancienne clé en clair : ne pas le commiter.
- Connexion par pseudo et lien personnel : migration `2026-11-06_login-link.sql` à appliquer AVANT de déployer ce code.
- Agents : `designer` refondu sur `PRODUCT.md` et `DESIGN.md`, nouvel agent `testeur`. Tests navigateur : `npm run test:e2e`.

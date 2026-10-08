# Mon Petit Parquet — Décisions architecturales

---

## [2024] Auth maison (JWT) plutôt que Supabase Auth

**Contexte** : Le projet nécessite une auth simple, orientée username/password, pour une app entre amis.

**Décision** : Auth custom avec `bcryptjs` + `jsonwebtoken`, table `users` dédiée.

**Alternatives écartées** :
- Supabase Auth : trop de complexité (magic links, OAuth), et couplage fort avec la table `auth.users` qui complique les relations FK.

**Raison** : Contrôle total, simplicité, pas de dépendance à l'email de vérification pour des parties entre amis.

---

## [2024] Deux clients Supabase distincts

**Contexte** : Supabase RLS activée sur toutes les tables. Les API Routes doivent écrire sans contrainte ; le frontend a besoin des subscriptions Realtime.

**Décision** : `getSupabase()` (anon key, lazy, browser) pour Realtime. `db()` (service_role, server-only) pour toutes les écritures en API Routes.

**Alternatives écartées** :
- Un seul client anon partout : impossible d'écrire depuis le serveur sans contourner RLS autrement.
- Désactiver RLS : risqué si l'API key anon est exposée côté client.

**Raison** : Séparation claire browser/server, RLS active mais contournée de façon explicite côté server uniquement.

---

## [2024] Initialisation lazy du client Supabase

**Contexte** : Next.js évalue les modules au build time (Vercel). `process.env` n'est pas disponible pour `NEXT_PUBLIC_*` à ce stade dans certains contextes.

**Décision** : `getSupabase()` utilise des lambdas (`() => process.env.NEXT_PUBLIC_SUPABASE_URL!`) et un singleton `_supabase` initialisé uniquement au premier appel.

**Alternatives écartées** :
- Init au module-level (`const supabase = createClient(...)`) : provoque des erreurs de build Vercel.

**Raison** : Fix concret d'un bug Vercel (commit `8c28070`).

---

## [2024] Draft en serpent avec timer côté client

**Contexte** : La salle de draft doit être temps-réel, résiliente aux déconnexions, sans backend dédié (serverless).

**Décision** :
- Timer de 45s calculé **côté client** à partir du champ `pick_deadline` (timestamptz) en base.
- N'importe quel client peut déclencher l'auto-pick quand le timer expire (`auto: true`).
- Le serveur déduplique : il vérifie que `current_draft_pick` n'a pas déjà avancé avant d'appliquer l'auto-pick.

**Alternatives écartées** :
- Timer côté serveur (setInterval dans un worker) : incompatible avec l'architecture serverless Vercel.
- Un seul client "maître" déclenche l'auto-pick : fragile en cas de déconnexion.

**Raison** : Résilience maximale sans infrastructure serveur persistante.

---

## [2024] Vercel Cron pour la sync des données sportives

**Contexte** : Cron nightly pour calculer les scores fantasy à partir des performances réelles du soir.

**Décision** : Un seul cron Vercel (`vercel.json`) qui appelle `/api/sync/results` chaque soir à 23h UTC.

**Alternatives écartées** :
- Cron plus fréquent : inutile, les matchs Pro A se jouent le soir.

**Raison** : Données fraîches chaque matin, coût zéro.

---

## [2024] next.config.mjs plutôt que next.config.ts

**Contexte** : Vercel échouait au build avec `next.config.ts`.

**Décision** : Remplacement par `next.config.mjs` (ES module, sans TypeScript).

**Alternatives écartées** :
- `next.config.js` : fonctionne aussi mais moins explicite sur le format ESM.

**Raison** : Fix de compatibilité Vercel (commit `39c1636`).

---

## [2024] Pas de bibliothèque de composants UI

**Contexte** : App mobile-first simple, équipe solo, besoin de rapidité.

**Décision** : Tailwind CSS pur, pas de Shadcn/Radix/MUI.

**Alternatives écartées** :
- Shadcn/ui : overhead de setup et de customisation pour une UI aussi spécifique.

**Raison** : Velocité, bundle minimal, contrôle total sur le design sombre/mobile.

---

## [2025-05] Migration api-sports.io → Sofascore

**Contexte** : api-sports.io free tier limité à 100 req/jour, insuffisant pour syncer toute la saison. Sofascore couvre Pro A avec toutes les stats nécessaires au calcul fantasy (pts, ast, reb, stl, blk, to, 3pts) et ne nécessite pas de clé API.

**Décision** : Remplacement complet de `lib/sports-api.ts` par des appels Sofascore. IDs en base = IDs Sofascore (rupture : reseed DB nécessaire).

**Alternatives écartées** :
- Rester sur api-sports.io payant : coût non justifié pour un projet perso.
- LNB.fr / altRstat : API non documentée publiquement, endpoints non découvrables sans reverse-engineering.

**Raison** : Gratuit, données complètes, 18 saisons d'historique disponibles.

---

## [2025-05] Persistance du user en localStorage (authStore)

**Contexte** : Après un refresh de page, `token` était récupéré depuis `localStorage` mais `user` était toujours `null`. La page `/home` fait `if (!token || !user) return null`, ce qui donnait un écran sombre vide.

**Décision** : Sauvegarder l'objet `user` en JSON dans `localStorage` au moment du `setAuth`. Au chargement du store, si `token` existe sans `user`, purger le token pour forcer un nouveau login.

**Alternatives écartées** :
- Endpoint `/api/auth/me` pour re-fetcher le user : requête réseau supplémentaire au démarrage, plus complexe.
- Supprimer le guard `!user` dans home/page : le user est nécessaire pour afficher le dashboard (nom, avatar).

**Raison** : Fix simple, zéro requête réseau, sessions incomplètes auto-purgées.

---

## [2025-05] Système de modificateurs de score de match

**Contexte** : Le score brut (somme des fantasy scores des 5 titulaires) ne suffisait pas — on voulait récompenser les synergies de roster (même club, même nationalité), la stratégie défensive, et les bons résultats du weekend.

**Décision** : Trois modificateurs cumulés, appliqués dans cet ordre :

1. **Bonus chimie** : calculé sur les titulaires
   - Même équipe réelle : **+3 pts** par paire
   - Même nationalité : **+1.5 pts** par paire
   - Cap à **+12 pts** total pour éviter l'abus de roster monoclubiste
   - Paires comptées en combinaisons (pas permutations)

2. **Bonus victoire weekend** : **×1.10** si ≥3 équipes réelles *distinctes* parmi tes titulaires gagnent le Samedi ou Dimanche de la semaine en cours
   - Seuil à 3 (pas 4) : permet de stacker 3 joueurs d'un même club et de viser le bonus avec 2 autres clubs

3. **Multiplicateur défensif** : appliqué sur le score de l'adversaire (pas le tien)
   - `defensive_raw` = Σ(blocks + steals) des titulaires sur la semaine
   - Formule : `mult = 1.0 – 0.20 × clamp(defensive_raw / 30, 0, 1)`
   - De ×1.00 (pas de défense) à ×0.80 (≥30 blk+stl, cas extrême)

**Ordre de calcul** :
```
score_final = (base + chimie) × weekend_mult
puis : score_final_adverse *= ton_defensive_mult
```

**Fichiers** :
- `lib/fantasy.ts` — `computeChemistryBonus`, `computeWeekendMultiplier`, `computeDefensiveMultiplier`
- `app/api/leagues/[id]/week/route.ts` — application des 3 modificateurs, retour des détails dans le payload
- `app/leagues/[id]/page.tsx` — composant `MatchupModifiers`, badges sous chaque score dans l'onglet Duels

**Alternatives écartées** :
- Seuil weekend à 4 équipes différentes : trop contraignant avec des rosters monoclubistes
- Defensive mult absolu (paliers fixes) : formule smooth plus élégante et continue

**Raison** : Enrichir le gameplay sans casser la lisibilité, récompenser la stratégie de construction de roster.

---

## [2025-05] ScraperAPI comme proxy pour Sofascore

**Contexte** : Sofascore est protégé par Cloudflare qui bloque toutes les requêtes serveur (Node.js et Edge Runtime Vercel) avec des challenges TLS/JS. Les headers seuls ne suffisent pas.

**Décision** : Utiliser ScraperAPI (free tier : 1000 req/mois) comme proxy. L'URL Sofascore est encodée en paramètre : `https://api.scraperapi.com/?api_key={key}&url={sofascoreUrl}`. Usage estimé : ~160 req/mois (8 matchs × ~20 appels).

**Alternatives écartées** :
- Edge Runtime Vercel : même résultat, 403 challenge Cloudflare.
- Proxy maison : maintenance, coût serveur.
- Puppeteer/headless : trop lourd pour Vercel serverless.
- GitHub Actions cron : complexité supplémentaire, moins intégré.

**Raison** : Solution la plus simple, free tier largement suffisant, aucune maintenance.

---

## [2026-10-08] Bascule saison 2026-2027 et pool draftable par saison

**Contexte** : La saison LNB Élite 2026-2027 a démarré fin septembre (J1 et J2 jouées, J3 en cours au 8 octobre), mais l'app pointait toujours sur `SEASON_ID = 79100` (2025-2026). Le cron resynchronisait donc les journées de la saison passée. Par ailleurs `player_performances` n'a pas de colonne `season` : `/api/sync/averages` moyennait toutes les perfs, saisons confondues.

**Décision** :

1. **Un seul point de vérité pour la saison** — `lib/sports-api.ts` exporte `SEASON_ID = 102568` (Sofascore) et `CURRENT_SEASON = '2026-2027'` (libellé base). `sync/results` écrit `matches.season = CURRENT_SEASON` au lieu de la constante en dur. Les anciens IDs sont gardés en commentaire pour les backfills historiques.

2. **Moyennes scopées par saison via jointure** — `/api/sync/averages` filtre sur `matches!inner(season) = CURRENT_SEASON`. Les perfs des saisons passées restent en base mais ne comptent plus dans `season_avg_fantasy`.

3. **Reset systématique avant recalcul** — la route remet à 0 les `avg_*` / `games_played` de *tous* les joueurs avant de recalculer. Sans ça, un joueur sans match cette saison garderait ses moyennes 2025-26, ce qui faussait les percentiles de tiers (calculés sur toute la table `players`).

4. **Colonne `players.is_active`** — un joueur absent de tous les effectifs de la saison en cours (club relégué, départ à l'étranger, retraite) sort du pool draftable sans être supprimé. `sync/players` repose les flags à chaque passage ; toutes les requêtes du pool (`/api/players`, draw-pack, open-pack, close-pack, bot-draft, auto-pick) filtrent sur `is_active = true`.

5. **Garde-fou anti-désactivation massive** — `sync/players` ne désactive personne si moins de 120 joueurs ont été récupérés (16 clubs × ~12 ≈ 190 attendus). Protège contre une réponse Sofascore partielle qui viderait le pool.

6. **Renommage LNB Élite** — la compétition a perdu le naming Betclic. Libellés UI mis à jour. La table `betclic_teams` garde son nom : renommer casserait les FK pour un gain cosmétique.

**Alternatives écartées** :
- Ajouter une colonne `season` sur `player_performances` : dénormalisation redondante, `matches.season` suffit via jointure. (Rejoint la migration vers des views `player_stats` déjà notée comme à faire.)
- Vider `player_performances` / `matches` à chaque nouvelle saison : perte de l'historique, et on veut pouvoir afficher les saisons passées plus tard.
- Supprimer les joueurs partis : casse les FK depuis `player_performances` et `team_players`.
- `DELETE` puis re-`INSERT` des joueurs dans `sync/players` : mêmes problèmes de FK, et perd les IDs Sofascore utilisés comme clés primaires.

**Raison** : Un seul endroit à changer chaque intersaison, historique préservé, pool de draft propre dès la première ouverture de ligue.

**Fichiers** : `lib/sports-api.ts`, `app/api/sync/{results,players,averages}/route.ts`, `app/api/players/route.ts`, `app/api/draft/[id]/{draw-pack,open-pack,pick,auction-state}/route.ts`, `app/api/leagues/[id]/bot-draft/route.ts`, `lib/execute-close-pack.ts`, `supabase/schema.sql`, `supabase/migrations/2026-10-08_saison-2026-2027.sql`

---

## [2026-10-08] Révision du barème fantasy : l'adresse compte

**Contexte** : L'utilisateur n'était pas convaincu par le barème depuis plusieurs mois sans pouvoir mettre le doigt dessus. Diagnostic sur des données réelles J1 26/27 — Justin Bibbins (Dijon) : 7 points à **2/9 au tir**, 8 passes, 6 rebonds → **35 points fantasy**. Le barème récompensait le volume et ignorait totalement l'efficacité : aucun tir manqué ne coûtait quoi que ce soit, parce qu'on ne mappait que 8 stats du box score Sofascore.

**Décision** : Nouveau barème, `computeFantasyScore` prend désormais un objet `FantasyStatLine` (13 champs) au lieu de 7 arguments positionnels.

| Stat | Avant | Après |
|---|---|---|
| Point | 1 | 1 |
| Passe | 2 | 1.5 |
| Rebond | 1.5 (total) | 1.5 offensif / 1.0 défensif |
| Interception | 3 | 2 |
| Contre | 3 | 2 |
| Perte de balle | −2 | −1.5 |
| **Tir manqué** | — | **−0.5** |
| **Lancer manqué** | — | **−0.5** |
| 3 pts réussi | +0.5 | +0.5 |
| Bonus DD / TD | +5 / +10 | **supprimés** |

Points clés :
- Les tentatives à 3 pts étant déjà incluses dans `fieldGoalAttempts` côté Sofascore, un seul calcul de tirs manqués couvre 2 pts et 3 pts.
- Split rebond offensif/défensif : plus rare et plus créateur de valeur. Repli au tarif défensif si Sofascore ne donne pas le split.
- Bonus DD/TD supprimés : effet de seuil brutal (9 vs 10 rebonds = 5 points d'écart) et le triple-double est quasi inexistant en LNB Élite (matchs de 40 min, rythme plus lent) — le bonus +10 était du poids mort.
- Interceptions et contres ramenés de 3 à 2 : ce sont les stats les plus bruitées du box score et c'étaient les mieux payées.
- Box score complet désormais stocké (`field_goal_attempts`, `free_throws_*`, `offensive_rebounds`, `personal_fouls`, `plus_minus`…) : permet d'afficher l'adresse en front plus tard sans re-sync.

**Effet mesuré** (6 profils types, script de comparaison) : tous les scores baissent de ~30%, mais **l'ordre relatif change** — le scoreur efficace (22pts à 8/12) passe de 4e à 1er, l'intérieur à double-double et le chasseur de stats reculent.

**Timing** : appliqué à la J3, avant la synchro de J1 et J2 → **aucun `fantasy_score` à recalculer**. Les perfs 2025-2026 gardent l'ancien barème, assumé : elles sont exclues des moyennes et des totaux de ligue par le filtre `matches.season`.

**Alternatives écartées** :
- **Multiplicateur d'efficacité (True Shooting)** sur l'ancien barème : moins de rupture pour la ligue, mais un manager ne peut pas calculer son score de tête — illisible.
- **Utiliser le `rating` Sofascore** comme base : boîte noire, aucun contrôle sur la pondération, et ça retire tout levier de game design.
- **Correctif minimal** (juste enlever le bonus TD et lisser les DD) : ne traitait pas la cause, à savoir l'absence totale de pénalité sur l'adresse.
- **Normaliser par les minutes** : avantagerait les joueurs de banc productifs, mais on draft 5 titulaires — le volume de minutes *est* une information pertinente à conserver.

**À arbitrer (non tranché)** : les modificateurs de match (chimie, weekend, défensif) ont été calibrés sur les anciennes magnitudes. Le bonus chimie étant **additif en points absolus** (cap +12), son poids relatif passe de ~6.9% à ~9.6% du score d'un cinq majeur. Recalibrer le cap à ~8 (et les paires à 2 / 1) rendrait la chimie neutre par rapport à avant.

**Fichiers** : `lib/fantasy.ts`, `lib/sports-api.ts` (mapping étendu), `app/api/sync/results/route.ts`, `supabase/schema.sql`, `supabase/migrations/2026-10-08_saison-2026-2027.sql`


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


---

## Mode de décision du projet (2026-10-15)

**Contexte** : Objectif beta mi-janvier 2027. Les décisions de game design restaient ouvertes pendant des semaines et bloquaient l'avancement. L'utilisateur a proposé de créer un agent chargé de trancher.

**Décision** : Pas d'agent décideur. Claude, en tant que chef d'orchestre, tranche par défaut, consigne chaque décision ici avec la mention **[veto possible]**, et code la décision. L'utilisateur garde un droit de veto à tout moment.
- Décisions techniques : Claude tranche sans demander.
- Game design : Claude tranche par défaut, l'utilisateur peut opposer son veto.
- Ce que seul l'utilisateur sait ou peut faire (accès Supabase, testeurs, temps disponible) : on demande.

**Alternatives écartées** :
- Un agent « décideur » séparé : il repartirait de zéro sans contexte, et décider à la place de l'utilisateur revient au même que si Claude le fait, avec moins d'information.
- Attendre une validation explicite à chaque fois : c'est ce qui bloquait.

**Raison** : Garder le rythme jusqu'à la beta sans retirer la main à l'utilisateur.

---

## [veto possible] Recalibrage de la chimie (2026-10-15)

**Contexte** : Le nouveau barème a fait baisser les scores d'environ 30 %. Comme la chimie est un bonus additif en points, son poids relatif est passé de ~6.9 % à ~9.6 % du score d'un cinq majeur.

**Décision** : Paire même club +2 (au lieu de +3), paire même nationalité +1 (au lieu de +1.5), plafond à +8 (au lieu de +12). La chimie retrouve son poids d'avant.

**Alternatives écartées** : Garder les anciennes valeurs, ce qui pousse encore plus vers les rosters d'un seul club et les cinq 100 % français, très courants en LNB.

**Raison** : Le dosage avait été pensé en mai. On le restaure plutôt que de le changer sans l'avoir décidé.

---

## [veto possible] Contenu des packs de la loterie (2026-10-15)

**Décision** : Pour la beta, les packs contiennent uniquement des **free agents**, c'est-à-dire des joueurs non draftés de la ligue. Les cartes *In Form* sont reportées après la beta.

**Alternatives écartées** : Des cartes *In Form* (une version boostée d'un joueur qui appartient déjà à quelqu'un) dès la beta. Il faudrait gérer le doublon de propriété, l'affichage de deux versions d'un même joueur et l'équilibrage des boosts : trop pour le délai.

**Raison** : Réduire le périmètre pour tenir janvier. Les free agents suffisent à créer le rituel du lundi et à faire vivre le roster.

---

## [veto possible] Semaines sans championnat LNB (2026-10-15)

**Décision** : Le calendrier des duels saute les semaines sans journée LNB (en 26/27 : 28 déc.-3 janv., 15-21 fév., 22-28 fév.). Ces semaines-là, pas de duel et pas de loterie.

**Alternatives écartées** : Une loterie ou un mercato spécial pendant la coupure de février. Bonne idée, mais pour après la beta.

**Raison** : Un duel à 0-0 tue l'engagement. Le plus simple qui marche.

---

## Outillage : quels skills et agents externes on adopte (2026-10-15)

**Contexte** : Une veille a repéré 13 dépôts GitHub de skills et d'agents Claude Code. L'utilisateur m'a délégué le choix.

**Décision** : Installation minimale, uniquement depuis des sources officielles, et relue avant l'installation. On copie les fichiers dans `.claude/skills/` ; on n'installe pas de plugin entier.
- Retenus : `supabase-postgres-best-practices` (supabase/agent-skills) et `frontend-design` (anthropics/skills). Ce sont du texte et des références SQL, sans script ni hook.
- Méthode reprise de obra/superpowers sans l'installer : le chef d'orchestre délègue avec un brief écrit et exige une preuve (tsc, build) avant de considérer une tâche terminée.

**Alternatives écartées** :
- Le skill `supabase` général : il est centré sur Supabase Auth et le MCP Supabase, qu'on n'utilise pas (on a une auth JWT maison), et il imposerait de lire le changelog avant chaque tâche.
- `vercel-labs/web-design-guidelines` : il télécharge ses règles à chaque exécution, donc le contenu peut changer sans qu'on le relise. Option à reconsidérer au S4 en figeant les règles localement.
- Les marketplaces entières (wshobson/agents, ECC, superpowers en plugin) : surface d'audit trop grande, hooks exécutés à chaque session, contexte qui gonfle.

**Raison** : Gain maximal pour un risque quasi nul. On ajoutera d'autres skills quand un sprint en aura besoin, pas avant.

---

## [veto possible] Loterie du lundi : règles de la v0 (2026-10-30)

**Contexte** : la loterie est la pièce maîtresse de la beta et elle n'existe pas encore. Spec complète : `.claude/specs/loterie.md`.

**Décision** :
- 1 pack par manager et par semaine, 5 free agents (1 elite / 2 star / 2 basique), on en garde 1.
- Ordre de pick par tirage pondéré sur les tickets (dernier = 10, premier = 1, interpolation linéaire). Chacun choisit à son tour un pack **fermé** parmi ceux qui restent, puis l'ouvre : c'est le moment FUT.
- Roster plein (8) : relâche obligatoire, en respectant les postes (3/2/3). Le joueur relâché redevient free agent.
- Cron le lundi à 8h UTC qui prépare la session ; le direct démarre quand le commissaire clique, ou à partir de 12h UTC au premier visiteur.
- Timer de 60 s par pick, puis auto-pick (meilleure moyenne compatible, relâche du plus faible du poste). Comme pour le draft, n'importe quel client peut déclencher, le serveur déduplique.

**Alternatives écartées** : un pack attribué d'office à chaque manager (moins de suspense) ; plusieurs joueurs gardés par pack (trop d'entrées dans les rosters chaque semaine) ; un plafond de transactions à la ESPN (inutile, la loterie limite déjà à 1 joueur par semaine).

**Raison** : le plus petit rituel hebdomadaire qui fasse vivre les rosters, avec du suspense, et codable en moins d'une semaine.

---

## [veto possible] Périmètre de la v0 : on coupe le marché des transferts (2026-10-30)

**Décision** :
- Le S3 « marché/transferts » est **coupé** de la beta. La loterie est le seul moyen de faire entrer un joueur dans son roster, ce qui fait un seul circuit de propriété et moins de bugs.
- Le S4 « onboarding » est réduit à : un lien d'invitation partageable en un tap (partage natif mobile, accessible à tout membre) et une page « Règles » d'un écran (barème, cinq de départ, chimie, loterie).
- Gardés pour après la beta : capitaine ×2 (vu chez BeBasket), timer de draft configurable, échanges entre managers, cartes In Form, notifications push.

**Alternatives écartées** : tenir le planning S3 et S4 complet. On risquait d'arriver en janvier avec deux fonctionnalités à moitié finies plutôt qu'une boucle de jeu solide.

**Raison** : on coupe du périmètre plutôt que de décaler la date.

**Veille** : BeBasket a lancé un fantasy Betclic Élite le 26/09/2026 (un cinq par soir, capitaine ×2, plus de 200 managers en 2 jours). C'est un jeu solo au classement général. Notre différence : des **ligues privées entre amis**, un draft, des duels, et la loterie. On garde ce cap.

---

## [veto possible] Composition, verrouillage et résultats des duels (2026-10-30)

**Contexte** : l'audit QA a montré que la composition était enregistrée sous la journée déjà jouée (le choix du manager n'avait jamais d'effet), que la journée courante mélangeait les saisons, et qu'aucun vainqueur de duel n'était jamais calculé (classement = total de points).

**Décision** :
- La composition vaut pour la **prochaine journée à jouer** de la saison en cours. Elle est **verrouillée** au coup d'envoi du premier match de cette journée.
- Sans nouvelle compo, on reprend la dernière enregistrée du manager. Seulement à défaut, on prend les meilleures moyennes.
- Les vainqueurs sont **persistés** (`settleFinishedWeeks`) à la fin de `sync/results`, et en paresseux à la lecture d'une semaine. Le calcul du score de duel n'existe qu'à un endroit.
- Classement : victoires, puis points pour.
- Draft : un manager ne peut pas gagner un joueur à un poste déjà plein ; le joueur passe au meilleur enchérisseur éligible suivant.

**Alternatives écartées** : verrouillage joueur par joueur au début de son match (plus fin, mais complexe et peu utile, la LNB jouant surtout le samedi) ; calcul des V-D à la volée à chaque affichage (coûteux et non figé).

**Raison** : sans ça, le cœur du jeu (choisir son cinq, gagner des duels) ne fonctionne pas.

---

## Synchro des matchs à venir et journées incomplètes (2026-10-30)

**Contexte** : seuls les matchs `finished` étaient synchronisés. « Prochains matchs » restait vide, le verrou de compo ne pouvait pas s'activer et la clôture d'une journée reposait sur un délai arbitraire.

**Décision** :
- `sync/results` fait **un appel de plus** à `events/next/0` (pas de pagination) et upserte les statuts `scheduled`, `live`, `postponed` et `cancelled`. Un match `finished` n'est jamais réécrit. Coût : environ 30 requêtes ScraperAPI de plus par mois.
- Une journée est clôturée quand tous ses matchs sont terminés ou annulés. Repli : 36 h après le dernier match, si aucune journée ultérieure n'est connue.
- Un match **reporté ou annulé** ne retient pas la « journée à jouer » et n'entre pas dans le calcul du verrou. Un match reporté bloque en revanche la clôture de sa journée jusqu'à ce qu'il soit joué.

**Alternatives écartées** : la pagination de `next/N` ou un appel par journée (quota ScraperAPI) ; une contrainte CHECK sur `matches.status` (colonne TEXT libre, inutile pour la v0).

**Raison** : rendre le verrou de compo et le calendrier effectifs pour un coût quasi nul.

**Risque connu** : le format de `events/next/0` est supposé identique à celui de `events/last/0`. À vérifier lors du premier passage du cron.

---

## [veto possible] Derniers arbitrages de la v0 (2026-10-30)

**Décision** :
- **Saison sur les duels** : nouvelle colonne `weekly_matchups.season`. Les duels 2025-26 sont figés tels quels (réglés, sans recalcul). Le V-N-D et la clôture ne portent que sur la saison en cours.
- **Match reporté** : il bloque la clôture de sa journée 36 h au plus. Passé ce délai, la journée est réglée sans lui, et les points du match rejoué ne comptent pour aucun duel.
- **Loterie sans relance serveur** : si personne n'a la page ouverte, un tour expiré attend le prochain visiteur. C'est accepté pour la v0, où la loterie est un moment vécu ensemble. Le cron ne tourne qu'une fois par jour, donc il ne peut pas servir d'horloge.
- **`lottery_packs` hors Realtime** : volontaire, pour ne jamais exposer un pack fermé en anon. Les autres clients voient une ouverture de pack au refetch suivant (10 s au plus).

**Alternatives écartées** :
- Garder le match reporté bloquant : le classement et les tickets de toute la ligue seraient gelés pendant des semaines.
- Rattacher le match rejoué à la journée suivante : complexe et surprenant pour les managers.
- Un worker pour faire avancer la loterie : incompatible avec le serverless et le free tier.

**Raison** : préférer une règle simple et prévisible qui ne gèle jamais la ligue.

---

## [veto possible] Ce qu'on reprend de Sorare (2026-11-05)

**Contexte** : comparaison avec Sorare NBA, de mémoire, sans vérification de leurs règles actuelles. Il fallait décider ce qui rejoint le jeu sans rouvrir le périmètre de la beta.

**Décision** :
- **Rien de nouveau pour la beta de janvier.** Le périmètre du 2026-10-15 ne bouge pas.
- **Après la beta, dans cet ordre** :
  1. **Plafond sur le cinq** : la somme des moyennes récentes des titulaires est plafonnée. À tester en ligue, car il s'ajoute au budget d'enchères du draft et ne doit pas obliger à laisser ses stars sur le banc chaque semaine. Il faut aussi assez de matchs joués pour que la moyenne ait du sens.
  2. **Une rareté qui compte en jeu** : un bonus de points, porté par les cartes In Form déjà prévues plutôt que par un nouveau système.
  3. **Marché entre managers** : toujours coupé de la beta, à reprendre ensuite, en monnaie virtuelle uniquement.
- **Exclus** : l'argent réel, la revente et les NFT/blockchain.

**Alternatives écartées** : ajouter le plafond dès la beta (il faudrait refaire l'équilibrage alors que la boucle de jeu n'a pas encore été testée) ; copier le modèle économique de Sorare (cadre légal français sur les jeux à objets numériques, risque de pay-to-win, aucune utilité technique avec Supabase).

**Raison** : le plafond récompense la connaissance de la LNB, ce qui va bien à des ligues entre amis. Mais la priorité reste de faire tourner l'alpha.

---

## Sofascore via www.sofascore.com et nouveaux essais (2026-11-06)

**Contexte** : avec une clé ScraperAPI valide, `api.sofascore.com` échouait quand même (HTTP 500 du proxy après 36 s, ou page HTML). La sync des joueurs ramenait 0 joueur.

**Décision** :
- `SOFA_BASE` passe à `https://www.sofascore.com/api/v1`. Testé sur les 6 routes utilisées, en mode standard (1 crédit par requête).
- `sfFetch` fait jusqu'à 3 essais si le statut est 5xx ou 429, ou si la réponse n'est pas du JSON. Une autre erreur 4xx n'est pas retentée.

**Alternatives écartées** : `premium=true` ou `ultra_premium=true` (bien plus de crédits par requête, non testés car inutiles) ; changer de source de données.

**Raison** : un seul changement d'adresse, sans surcoût. Les essais supplémentaires évitent qu'une réponse ratée fasse tomber une sync de 17 appels.

**Risque connu** : un match de J13 a été joué le 2026-11-03, alors que la journée en cours est la J7. Vérifier que la journée à jouer et la clôture des duels gèrent les matchs avancés.

---

## Sync robuste : club en erreur et moyennes paginées (2026-11-06)

**Contexte** : première vraie sync 2026-27. Une 404 sur l'effectif de Dijon (id 5627) a arrêté la boucle à 10 clubs sur 16. Le calcul des moyennes n'a lu que 1000 performances sur 1098, à cause du plafond de lignes de Supabase.

**Décision** :
- `sync/players` : un club en erreur est ignoré et signalé. Ses joueurs ne sont pas désactivés.
- `sync/averages` : lecture paginée par tranches de 1000, avec un tri stable.

**Alternatives écartées** : arrêter toute la désactivation dès qu'un club échoue (une 404 durable bloquerait le nettoyage des effectifs) ; relever le plafond dans la config Supabase (dépendance invisible dans le code).

**Raison** : un club en panne ne doit pas bloquer les quinze autres, et les moyennes alimentent les tiers des cartes.

**Risque connu** : Dijon reste sur son ancien effectif tant que la 404 dure. Les autres lectures de `player_performances` restent à contrôler face au même plafond.

---

## [veto possible] Calendrier à partir de la journée jouable et matchs joués en avance (2026-11-06)

**Contexte** : l'audit de la v0 a montré trois problèmes. Le calendrier partait toujours de la J1, donc une ligue lancée en cours de saison réglait d'un coup des duels sur des matchs joués avant son draft. Un match de J13 joué le 2026-11-03, pendant la J7, faisait afficher la J13 et pouvait clore cette journée avec 2 matchs sur 8. Le classement de la loterie pouvait dépasser le plafond de 1000 lignes de Supabase.

**Décision** :
- `createLeagueSchedule` (`lib/week-scoring.ts`) remplace les quatre copies de la génération. Les duels démarrent à la prochaine journée jouable, ou à la suivante si elle est verrouillée.
- La page ligue affiche la première journée de la ligue tant qu'aucun duel n'a été joué.
- Une journée située après une journée encore ouverte n'est pas close et ne compte pas comme dernière journée jouée.
- `computeLeagueStats` lit les performances par pages.

**Alternatives écartées** : garder les J1 à J6 en les marquant non jouées (plus de cas à gérer pour rien) ; rattacher le match avancé à la journée où il est joué (il faudrait contredire Sofascore).

**Raison** : sans cela, le classement et les tickets de loterie seraient faux dès le premier jour, pour l'alpha comme pour la beta.

---

## [veto possible] Direction visuelle claire et haut de gamme (2026-11-06)

**Contexte** : l'utilisateur veut une finition haut de gamme et des couleurs plutôt claires. Maquette validée le 2026-11-06 : `design/cartes-raretes.html`.

**Décision** :
- Mode clair uniquement. Fond `#F2F4F7`, encre `#141B26`, accent laiton `#B07A1E`, polices Fraunces et Hanken Grotesk.
- Chaque tier a une matière, un cadre, une jauge de losanges et son nom écrit. Le glow est réservé à l'Élite.
- Un seul système de 4 tiers visibles partout. Impact sur le draft et la loterie à mesurer avant d'y toucher.
- In Form reste après la beta, avec un bonus de points.

**Alternatives écartées** : garder aussi un mode sombre (deux thèmes à finir) ; garder l'ambre `#F59E0B` (illisible en texte sur fond clair).

**Raison** : sur fond clair, le glow ne fonctionne plus. Les matières donnent un aspect d'objet de collection, et la rareté reste lisible sans la couleur.

---

## [veto possible] Connexion par pseudo et lien personnel (2026-11-06)

**Contexte** : l'utilisateur a demandé de jouer la beta sans mot de passe. Il fallait éviter une page « mot de passe oublié », donc un service d'e-mail et un domaine, sans permettre à n'importe qui de prendre un pseudo.

**Décision** :
- Inscription par pseudo seul (3 à 20 caractères), unique sans tenir compte de la casse.
- Lien personnel `/auth#lien=<userId>.<version>.<signature>`, signé avec HMAC et non stocké. Il se réaffiche sur l'accueil.
- Le jeton reste dans le fragment de l'URL, qui n'atteint ni le serveur ni les logs.
- Le commissaire génère un nouveau lien pour un membre, ce qui annule l'ancien (`users.login_version`).
- Session JWT de 365 jours.

**Alternatives écartées** : pseudo seul (usurpation immédiate) ; e-mail et mot de passe (oublis à gérer, service d'e-mail et domaine) ; lien magique par e-mail (mêmes dépendances) ; jeton aléatoire stocké haché (impossible à réafficher).

**Raison** : le moins de friction possible pour des amis, sans dépendance nouvelle.

**Limites connues** : annuler un lien ne ferme pas une session déjà ouverte, le JWT reste valable. Le commissaire qui perd son lien doit passer par une réinitialisation à la main. Un e-mail restera à ajouter si le jeu sort du cercle d'amis.

---

## Outillage design et test (2026-11-06)

**Décision** :
- Skill **Impeccable** (pbakaus, Apache 2.0) dans `.claude/skills/impeccable`. Seuls les fichiers texte sont installés, sans scripts, relus et scannés avant installation.
- Agent `testeur` et tests Playwright dans `e2e/`, sur le Chrome de la machine, sans écriture en base ni appel aux crons.

**Alternatives écartées** : Taste Skill (orienté sites vitrine) ; `npx impeccable install` (exécute du code tiers et ajoute un détecteur à chaque édition) ; agents officiels Playwright (trois agents et un serveur MCP en plus, pour une petite app).

**Raison** : Impeccable sait reprendre une interface existante, ce qui est notre cas, et Playwright donne le vrai rendu mobile que `chrome --headless` fausse à 500 px.

---

## [veto possible] Ambiance LNB : tableau de score et états de la semaine (2026-11-06)

**Contexte** : l'utilisateur veut se sentir en LNB dès l'ouverture et ressentir la tension des matchs. Maquette validée : `design/ambiance-lnb.html`.

**Décision** :
- L'app reste claire. La tension vient d'un tableau de score LED posé sur le papier, sans écran sombre.
- États calculés depuis le vrai calendrier : calme, montée (24 h avant le verrou), pression (3 dernières heures), soirée de match, verdict. Jamais un jour fixe.
- Rouge sirène `#B3281A`, réservé au chrono et au « en cours ».
- Pas de direct pour la beta : points sous scellé, puis dévoilement après le relevé de la nuit. L'heure affichée vient du cron : 23h UTC donne minuit l'hiver et 1h l'été.
- « Alex n'a pas encore posé son cinq » reste affiché.
- Match reporté : règle actuelle conservée pour la beta.

**Alternatives écartées** : polling Sofascore pendant les matchs (risque sur le quota ScraperAPI, à revoir après la beta) ; verdict en plein écran sombre (contredit la demande d'une app claire).

**Raison** : un seul objet fort et un rythme lié à la semaine, avec les données déjà disponibles.

---

## [veto possible] Migration de toute l'app au thème clair (2026-11-07)

**Contexte** : l'utilisateur veut juger le design dans la vraie app avant la ligue test.

**Décision** :
- Couleurs nommées par rôle dans `tailwind.config.js` (`paper`, `surface`, `ink`, `brand`...). `slate` n'est plus utilisé.
- L'accueil ouvre sur le duel du joueur, avec le tableau de score.
- Icônes dessinées (`components/Icon.tsx`), plus aucun emoji dans l'interface.
- `ClientOnly` à la racine : la session vit dans le navigateur, donc pas de rendu serveur des écrans.
- Budget du draft en euros, plus crédible que le dollar pour la LNB.
- Draft et loterie gardent leurs 3 tiers (Élite, Star, Basique), habillés avec les matières. Le passage à 4 tiers changerait la composition des packs : à trancher après la ligue test.

**Alternatives écartées** : reprendre les pages à la main (long, plus de risques d'oubli) ; garder `slate` en inversant ses valeurs (rapide mais trompeur à relire).

**Raison** : la migration par rôle garde une seule source de vérité pour la palette.

---

## [veto possible] Le draft devient un jeu de cartes (2026-11-07)

**Contexte** : l'utilisateur juge le draft et les enchères trop longs à organiser, et veut un jeu de cartes à collectionner.

**Décision** :
- Règles dans `.claude/specs/cartes.md` : cartes liées au compte, doublons permis, quatre raretés qui modifient les points, tous les postes jouables avec malus, paquets gagnés au fil de la saison.
- Remplace le draft, les enchères, les cartes uniques par ligue, la rareté cosmétique et le roster limité.
- `team_players` et les tables d'enchères restent en base, sans être lues, le temps de la bascule.
- Le cinq d'une journée est évalué au verrou, avec les cartes alors possédées. Vendre une carte ensuite ne change pas un duel joué.
- Le cinq de l'adversaire n'est pas renvoyé par l'API avant le verrou.

**Alternatives écartées** : garder les cartes uniques par ligue (réservoir à partager, limite de managers, pénurie de grands) ; fusion de 4 cartes identiques (moins de 2 % de chances sur une saison, remplacée par l'amélioration avec sacrifices) ; ignorer `consumed_at` pour les cinq enregistrés (une carte vendue aurait compté pour une journée future).

**Raison** : un démarrage en quelques minutes, sans réunir tout le monde, et une collection qui donne une raison de revenir.

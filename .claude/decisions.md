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

## [2025-05] ScraperAPI comme proxy pour Sofascore

**Contexte** : Sofascore est protégé par Cloudflare qui bloque toutes les requêtes serveur (Node.js et Edge Runtime Vercel) avec des challenges TLS/JS. Les headers seuls ne suffisent pas.

**Décision** : Utiliser ScraperAPI (free tier : 1000 req/mois) comme proxy. L'URL Sofascore est encodée en paramètre : `https://api.scraperapi.com/?api_key={key}&url={sofascoreUrl}`. Usage estimé : ~160 req/mois (8 matchs × ~20 appels).

**Alternatives écartées** :
- Edge Runtime Vercel : même résultat, 403 challenge Cloudflare.
- Proxy maison : maintenance, coût serveur.
- Puppeteer/headless : trop lourd pour Vercel serverless.
- GitHub Actions cron : complexité supplémentaire, moins intégré.

**Raison** : Solution la plus simple, free tier largement suffisant, aucune maintenance.

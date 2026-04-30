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

**Contexte** : api-sports.io a un quota de 100 req/jour (free tier). Les résultats des matchs sont connus en soirée.

**Décision** : Un seul cron Vercel (`vercel.json`) qui appelle `/api/sync/results` chaque soir à 23h UTC.

**Alternatives écartées** :
- Webhook api-sports.io : non disponible sur le free tier.
- Cron plus fréquent : dépasse le quota gratuit.

**Raison** : Respecte les contraintes du free tier, données fraîches chaque matin.

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

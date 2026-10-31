# Spec — Loterie du lundi (beta v0)

Décidée le 2026-10-30 (voir `decisions.md`, [veto possible]).

## Constats code
- `ROSTER_SIZE = 8` (3 arrières / 2 ailiers / 3 intérieurs ; 5 titulaires 2-1-2) dans `lib/fantasy.ts`.
- `team_players` : UNIQUE(league_id, player_id).
- Réutiliser `AUCTION_PACK_COMPOSITION` (1 elite + 2 star + 2 basique) et `assignAuctionTier`.
- Ne PAS réutiliser `draft_credits` / `DRAFT_BUDGET` (crédits de draft).

## Déroulé
1. **Cron Vercel** `0 8 * * 1` → `GET/POST /api/lottery/run` (secret CRON_SECRET). Crée, pour chaque ligue dont le draft est terminé, une session `scheduled` pour la semaine écoulée, avec tickets et packs.
   - Pas de session si la semaine écoulée n'a aucun match `finished` (semaines sans LNB).
   - Idempotent : UNIQUE(league_id, week).
2. **Lancement du direct** : le commissaire clique « Lancer ». Repli : à partir de 12:00 UTC, n'importe quel membre qui ouvre la page la lance (route idempotente).
3. **Tirage de l'ordre** : tirage pondéré sans remise sur les tickets → ordre de pick 1..N, révélé ligne par ligne côté client.
4. **Picks** : chacun son tour (timer 60 s), le manager **choisit un pack fermé** parmi ceux qui restent, l'ouvre (révélation des 5 cartes), **garde 1 joueur**, et relâche 1 joueur s'il a 8 joueurs.
5. Quand `current_pick > N` → `done`.

## Tickets
Classement de la semaine écoulée (victoires de duels puis points cumulés de la saison).
`tickets = round(1 + 9 * (rang - 1) / (N - 1))` avec rang 1 = premier → 1 ticket, dernier → 10. N = 1 → 10.
Égalité parfaite = mêmes tickets.

## Packs
- N packs par session (1 par manager), 5 free agents chacun (`is_active = true`, absents de `team_players` de la ligue), composition 1 elite / 2 star / 2 basique, tirage sans remise entre packs.
- Pool insuffisant → packs de 3 ; pool vide → session `cancelled`.
- `player_ids` d'un pack non ouvert n'est **jamais** renvoyé au client.

## Relâche
- Roster à 8 : relâche obligatoire. Après l'échange, `ROSTER_SLOTS` (3/2/3) doit être respecté → en pratique, relâcher un joueur du même groupe de poste. Validé côté serveur.
- Joueur relâché → free agent (peut retomber dans un pack). S'il était titulaire, le cinq est recalculé (`computeDefaultStarters`) ou le slot laissé vide selon le code existant de lineup.
- Roster < 8 : pas de relâche.

## Absent / timer
- 60 s par pick, timer client calé sur `pick_deadline` (comme le draft). N'importe quel client peut appeler `/auto` à expiration ; le serveur déduplique sur `current_pick`.
- Auto : pack non ouvert au hasard, joueur au meilleur `season_avg_fantasy` compatible avec les slots, relâche du joueur le plus faible du groupe de poste.

## Tables
- `lottery_sessions` : id uuid PK, league_id FK, week int, status text (`scheduled|live|done|cancelled`), draw_order jsonb (`[{user_id, tickets, pick}]`), current_pick int default 1, pick_deadline timestamptz, started_at, ended_at, created_at ; UNIQUE(league_id, week).
- `lottery_packs` : id uuid PK, session_id FK, pack_number int, player_ids int[], opened bool default false, taken_by uuid null, chosen_player_id int null, released_player_id int null.
- `lottery_tickets` : session_id, user_id, tickets int, PK(session_id, user_id).
- RLS activée ; lecture anon sur `lottery_sessions` uniquement (Realtime). `lottery_packs` lu via l'API (service role) pour masquer les packs fermés ; le client écoute `lottery_sessions` puis refetch `/state`.

## Routes (`app/api/lottery/…`)
- `run` (cron, secret) ; `[leagueId]/state` (GET) ; `[leagueId]/start` (POST) ; `[leagueId]/pick` (POST `{pack_id, player_id, release_player_id?}`) ; `[leagueId]/auto` (POST).
- Le swap `team_players` (delete + insert) doit être atomique : fonction SQL `lottery_apply_pick(...)` appelée en RPC.

## Écrans
1. `/leagues/[id]/lottery` : état (programmée / en direct / terminée), tickets et % de chances de chacun, ordre révélé, grille des packs fermés/ouverts, timer, fil d'événements (« X a pris Y, relâche Z »).
2. Modale de pick : 5 cartes du pack + sélection du joueur à relâcher + confirmer.
3. Bannière sur `/home` et la page ligue : « Loterie lundi 10h / EN DIRECT / terminée ».

## Hors v0
Skip du pick, notifications push, replay animé, cartes In Form, avantage comeback.

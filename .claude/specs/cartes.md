# Jeu de cartes : règles (2026-11-07)

Remplace le draft, les enchères, les cartes uniques par ligue et la rareté cosmétique. Le code n'est pas commencé.

## Cartes

- Une carte = un joueur + une rareté. Elle appartient au **compte**, pas à la ligue.
- Les doublons existent : plusieurs managers, ou le même, peuvent avoir le même joueur.
- Tirage indépendant : un joueur au hasard parmi ceux qui ont joué cette saison, puis une rareté.
- Le niveau du joueur n'est pas affiché. La carte montre sa rareté et sa moyenne.

| Rareté | Effet sur les points | Chance par carte |
|---|---|---|
| Bronze | −10 % | 55 % |
| Silver | Aucun | 30 % |
| Gold | +10 % | 12 % |
| Platine | +20 % | 3 % |

## Compte et ligues

- La collection est unique par compte, sans limite de taille.
- Une même carte peut jouer dans plusieurs ligues en même temps. Chaque ligue a sa propre composition.
- Une carte alignée dans une composition verrouillée ne peut être ni vendue ni sacrifiée.

## Composition

- Chaque journée, 5 cartes de la collection, en 2-1-2.
- Un même joueur ne peut être aligné qu'une fois dans un cinq.
- Tous les postes sont permis : −20 % à un poste d'écart, −35 % à deux postes d'écart.
- Le malus de poste s'ajoute au multiplicateur de rareté.

## Gains de paquets (5 cartes, toutes conservées)

| Moment | Gain | Limite par compte |
|---|---|---|
| Création du compte | 5 paquets, avec au moins 1 Gold ou mieux et un joueur à chaque poste | Une fois |
| Lundi | 1 paquet, dont la loterie fixe la qualité (le dernier du classement a le plus de chances d'avoir le meilleur) | 1 par semaine, meilleur résultat parmi ses ligues |
| Victoire en duel | 1 paquet | 1 par semaine |
| Missions | 1 paquet si toutes sont réussies | 1 par semaine |

Pas de paquet quotidien. Les limites par compte empêchent de cumuler les gains en multipliant les ligues, ou en créant des ligues de bots.

## Économie (étape 3, monnaie virtuelle uniquement)

| Carte | Revente |
|---|---|
| Bronze | 5 pièces |
| Silver | 10 pièces |
| Gold | 30 pièces |
| Platine | 100 pièces |

- Paquet à l'achat : 150 pièces. Un paquet revendu rapporte environ 62 pièces : il n'y a pas de gain à l'infini.
- Améliorer une carte, en sacrifiant des cartes de même rareté, de n'importe quels joueurs : 3 Bronze pour passer Silver, 3 Silver pour passer Gold, 5 Gold pour passer Platine.

## Saison

Les collections repartent à zéro à chaque saison, sauf **une carte au choix**, qui garde sa rareté. Elle doit être celle d'un joueur encore présent en LNB Élite la saison suivante. Le palmarès reste : titres et plus belle carte.

## Ordre de construction

1. Cartes, 5 paquets, composition avec malus, multiplicateur de rareté.
2. Paquet du lundi avec la loterie, paquet de victoire.
3. Revente, pièces, achat, amélioration.
4. Missions.
5. Passage de saison, avant 2027-28.

## Points ouverts

- Un manager qui arrive en cours de saison a moins de cartes que les autres : prévoir un rattrapage. Sans effet sur la ligue test, où tout le monde démarre ensemble.

## Plan technique

Socle déjà en place, à réutiliser sans le dupliquer :

- `lib/cards.ts` : raretés, chances, multiplicateurs, tirages, `lineupError`, `defaultLineup`, `upgradeError`. Tests : `npx tsx scripts/check-cards.ts`.
- `supabase/migrations/2026-11-07_cards.sql` : `card_packs`, `player_cards`, `users.coins`, `weekly_lineups.starter_card_ids`. Déjà appliquée en prod.

### Choix

- Les cartes sont générées quand le paquet est créé (pour tenir les garanties), avec `pack_id`. Une carte est dans la collection si son paquet est ouvert et si `consumed_at` est NULL. Elle ne doit jamais fuiter avant l'ouverture.
- `ensureStarterPacks(userId)` est idempotent grâce à `reward_key` (`1` à `5`) : appelé à l'inscription et à la lecture de la collection, pour couvrir aussi les comptes existants.
- Réservoir de tirage : joueurs actifs avec `season_avg_fantasy > 0`.
- Le cinq est `weekly_lineups.starter_card_ids`, dans l'ordre de `LINEUP_SLOTS`. `starter_player_ids` et `team_players` ne sont plus lus.
- Score d'un titulaire : `fantasy_score × cardMultiplier(rareté, poste naturel, place)`, arrondi au dixième à la fin du duel. La chimie, le bonus week-end et le malus défensif ne changent pas.
- Une ligue se lance par le commissaire, avec 2 membres au moins. `draft_status` passe de `pending` à `completed` et `createLeagueSchedule` crée le calendrier. On garde cette colonne pour limiter les changements. Plus personne ne rejoint une ligue lancée.
- Les bots ont aussi leurs paquets, ouverts d'office, et jouent le cinq par défaut.
- Classement : victoires, puis points pour, depuis les duels réglés.

### API

Toutes les routes sont authentifiées sauf mention contraire. Une carte renvoyée a toujours cette forme :

```ts
interface CardView {
  id: string;
  rarity: Rarity;
  obtained_at: string;
  player: { id: number; name: string; team: string; position: string | null; group: PositionGroup;
            photo_url: string | null; jersey_number: number | null; season_avg_fantasy: number };
}
```

- `GET /api/collection` : `{ coins, cards: CardView[], packs: { id, source, quality }[] }`. `packs` liste les paquets fermés.
- `POST /api/packs/[id]/open` : `{ cards: CardView[] }`. Refusé si le paquet n'est pas le sien. Rejouer la requête renvoie les mêmes cartes.
- `GET /api/leagues/[id]/lineup` : `{ currentWeek, isLocked, lockAt, cards: CardView[], starterCardIds: string[] }`.
- `POST /api/leagues/[id]/lineup` : `{ starterCardIds: string[] }`, 5 identifiants dans l'ordre des places.
- `POST /api/leagues/[id]/start` : commissaire seulement, remplace `start-draft`.
- `GET /api/leagues/[id]/week` : garde sa forme actuelle. Chaque côté d'un duel ajoute `starters: { card: CardView, slot, points, multiplier }[]`.
- `GET /api/teams/[leagueId]/standings` : `{ user_id, username, team_name, avatar_color, wins, losses, draws, points_for }[]`.

Étape 3 :

- `POST /api/cards/sell` : `{ cardIds }`, renvoie `{ coins }`.
- `POST /api/packs/buy` : renvoie `{ coins, pack }`.
- `POST /api/cards/[id]/upgrade` : `{ sacrificeCardIds }`, renvoie `{ card: CardView }`.
- `GET /api/missions` : `{ week, missions: { id, label, done }[], claimed }`.

Une vente, un achat ou une amélioration passe par une fonction Postgres, pour que les pièces et les cartes changent ensemble ou pas du tout.

# Système visuel

Référence visuelle : `design/cartes-raretes.html`. Toute l'app suit cette palette, nommée par rôle dans `tailwind.config.js`.

## Direction

Clair, haut de gamme, objet de collection. Mode clair uniquement.

## Couleurs

| Rôle | Valeur | Usage |
|---|---|---|
| Papier | `#F2F4F7` | Fond, bleuté et non crème |
| Surface | `#FFFFFF` | Champs, cartes d'interface |
| Encre | `#141B26` | Texte principal, bouton principal |
| Encre 2 | `#455062` | Texte secondaire |
| Muet | `#5B6678` | Légendes, placeholders |
| Filet | `#DDE2E9` | Bordures |
| Laiton | `#B07A1E` | Filets et fonds uniquement : contraste trop faible pour du texte |
| Laiton encre | `#7E5409` | Texte accentué |
| Laiton doux | `#F3E7CC` | Halo de focus, fonds doux |
| Améthyste | `#5B3FA6` | Platine |
| Cuivre | `#B58A66` | Bronze |
| Sirène | `#B3281A` | Uniquement le chrono des dernières heures et le « en cours » |
| LED | `#EDBE55` | Chiffres du tableau de score |

## Typographie

Fraunces pour les titres, les noms et les chiffres. Hanken Grotesk pour l'interface.

## Rareté

Chaque tier combine une matière, un cadre, une jauge de losanges et son nom écrit, pour rester lisible sans la couleur.

| Tier | Matière | Cadre | Jauge |
|---|---|---|---|
| Bronze | Papier mat grainé, cuivre | Filet simple | 1 |
| Silver | Métal brossé | Filet et liseré blanc | 2 |
| Gold | Feuille d'or satinée, guillochis | Double filet | 3 |
| Platine | Fond encre, bordure nacrée | Reflet qui suit le doigt | 4 |

Le glow est réservé au Platine. Le niveau d'un joueur n'est jamais affiché : une carte montre sa rareté et sa moyenne. Composant : `components/cards/GameCard.tsx`.

## Tableau de score

Le seul objet sombre de l'app, avec la carte Platine, et la source de la tension. Il suit le moment de la semaine (`lib/week-phase.ts`) : éteint au calme, chrono rouge dans les 3 dernières heures, points sous scellé en soirée de match, verdict après la clôture. Référence : `design/ambiance-lnb.html`.

## Mouvement

Un seul moment fort par écran, sur une courbe douce qui décélère. Toujours compatible avec `prefers-reduced-motion`.

## À ne pas faire

Pas de libellé en capitales au-dessus d'un titre, pas d'emoji à la place d'une icône, pas de grilles de cartes identiques, pas de dégradé violet ni de texte en dégradé.

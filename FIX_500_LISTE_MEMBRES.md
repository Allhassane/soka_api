# Fix - 500 / timeout sur la liste des membres (`GET /api/structure/my-members`)

> Brief de correction issu d'un diagnostic réalisé en production (lecture seule + reproduction mesurée).
> Régression de perf introduite par le merge `prod-online` (feat: insertion du niveau `CENTRE_REGIONAL` + un « fix bug »).
> **À traiter dans ce dépôt (`soka_api`).** Le frontend est dans un dépôt séparé (`soka_web`).

## Stack
NestJS 11 + TypeORM 0.3 + MySQL (mysql2), préfixe global `/api`. Prod servie depuis `dist/` → tout fix TS nécessite `npm run build`.

## Symptôme
La page **Liste des membres** du web renvoie **HTTP 500**. En réalité c'est un **timeout** : l'endpoint est fonctionnel mais beaucoup trop lent ; la passerelle (reverse-proxy / rewrite Next) coupe avant la fin et renvoie 500.

## Preuves de reproduction (mesurées avec un compte réel - responsable de niveau DISTRICT, 29 membres)
- `GET /api/structure/my-members?limit=10` **en direct sur l'API** → **HTTP 200 mais en ~57 s**.
- **Même requête via la chaîne web réelle** (reverse-proxy → Next → rewrite → API) → **HTTP 500 « Internal Server Error » à ~30 s** (timeout passerelle). C'est exactement le bug vu par l'utilisateur.
- `limit=1` → **HTTP 200 en ~6 s** ⇒ **coût linéaire ~6 s PAR membre**.
- Le coût est **indépendant du périmètre du user** : un simple DISTRICT met déjà 57 s.

## Cause racine (confirmée) - explosion O(membres × dataset complet)
Fichier **`src/structure/structure-tree.service.ts`** :

1. **`getMembersWithTreeByConnectedUser` (~l.882)** : après la requête paginée des membres, une **boucle `for (const m of members)` (~l.1037-1073)** appelle **`getStructureTreeForResponsible(m.structure_uuid, levelOrder)` une fois PAR membre**.

2. **`getStructureTreeForResponsible` (~l.710)** : à **chaque** appel, recharge **tout le dataset** - TOUTES les structures (`getMany()`, ~3600 lignes), TOUS les niveaux, un `COUNT` membres groupé (scan complet), TOUS les responsables (join sur toute la table membres) - puis **reconstruit l'arbre complet** (`structureMap` + `calculateTotals`), et seulement à la fin **filtre** l'arbre pour la structure cible.

⇒ Avec `pageSize:10` côté front : ~10 rechargements complets + ~40 requêtes lourdes par page ⇒ ~57 s ⇒ timeout → 500.

### Insight confirmé (à exploiter)
- Le bloc « charger le dataset + construire `structureMap` + `calculateTotals` » est **identique pour tous les membres** (ne dépend PAS du membre). C'est le goulot (~6 s).
- Seules les dernières étapes dépendent du membre : `pathToRoot` (remontée depuis `m.structure_uuid` vers la racine) + `filterTree`. **Les arbres diffèrent légitimement d'un membre à l'autre** (chemin vers la structure propre de chacun) → **garder le filtrage par membre**, mais sortir le rechargement global de la boucle.
- Dans `filterTree` (~l.846), le paramètre `responsibleLevelOrder`/`targetLevelOrder` **semble passé mais non utilisé** dans la coupe (coupe à la structure cible `isTarget`). À **vérifier** ; si confirmé, deux membres d'une **même** structure produisent un arbre identique (⇒ mémoïsable par `structure_uuid`).

## Correctif demandé

**1. (Principal) Charger le dataset lourd UNE SEULE FOIS par requête.**
Refactorer `getStructureTreeForResponsible` en deux parties :
- une méthode qui **construit la `structureMap` complète avec totaux** (chargements structures/niveaux/counts/responsables + `calculateTotals`) - appelée **une seule fois** ;
- une **fonction pure** `buildFilteredTreeFromMap(structureMap, structureUuid)` (+ `responsibleLevelOrder` si réellement utilisé) qui fait `pathToRoot` + `filterTree` **sans aucune requête DB**.

Dans `getMembersWithTreeByConnectedUser`, construire la `structureMap` **avant** la boucle, puis dans la boucle n'appeler que `buildFilteredTreeFromMap(...)` par membre.

**2. (Renforcement) Mémoïser par `structure_uuid`** dans la requête (`Map<string, tree>`) : si l'arbre d'une structure est déjà calculé, le réutiliser pour les autres membres de la même structure.

**3. (Bug secondaire) Garde anti-cycle** sur la boucle de remontée `while (currentUuid) { … currentUuid = current?.parent_uuid }` (~l.834) : ajouter un `Set seen` et stopper si l'uuid est déjà vu (sinon un `parent_uuid` cyclique = boucle infinie / hang).

**4. (Cohérence) Mêmes appelants en boucle.** `getStructureTreeForResponsible` est appelé par-membre ailleurs (exports Excel notamment) : ~l.582, 1308, 1512, 2501, 2964, 3578. Appliquer la même optimisation, sans changer le comportement fonctionnel.

**5. (Optionnel, perf supplémentaire)** Même appelée une fois, la construction globale met ~6 s (chargement de ~3600 structures + `COUNT` plein + join responsables plein). Si simple, réduire ce coût (sélections ciblées, agrégations) pour viser < 2 s - **sans** ajouter d'index ni migration (juste signaler en commentaire si un index DB aiderait).

## Contraintes (impératif)
- **Aucun changement de schéma ni de DB**, aucune migration, aucune modif d'entité.
- **Ne pas changer le contrat d'API** : réponse `{ members: [...], pagination: { current_page, per_page, total_items, total_pages, has_next, has_previous } }`, chaque membre conservant les mêmes champs dont **`structure_tree` à la même forme** (consommée côté `soka_web` par `services/membre.ts` → `getMembresWithHierarchy`, qui lit `item.structure_tree`). Vérifier une équivalence exacte avant/après sur quelques membres.
- Conserver les erreurs existantes (`NotFoundException` si `member_uuid` absent / structure introuvable).
- Conventions du repo (ESLint/Prettier, commentaires FR). Pas de `console.log` résiduel.

## Validation (chiffres à battre)
1. `npm run build` OK.
2. `GET /api/structure/my-members?limit=10` : **200** et temps proche du coût d'**un seul** chargement global (≈6 s aujourd'hui, idéalement < 2 s) - **plus** ~57 s.
3. **Temps quasi constant selon `limit`** : `limit=1`, `limit=10`, `limit=25` doivent donner des durées voisines (preuve que ce n'est plus linéaire en nombre de membres).
4. Plus de 500 via la chaîne web complète (sous le timeout passerelle ~30 s).
5. `structure_tree` **identique** à l'ancien comportement sur 2-3 membres de structures différentes (comparer les JSON).
6. Filtres `search` / `gender` / `has_gohonzon` / `department_uuid` / `division_uuid` + pagination toujours fonctionnels.
7. (Dev) avec `logging:true` TypeORM, le nombre de requêtes pour 10 membres passe de ~40+ à un **petit nombre constant** ; retirer le logging ensuite.

## Livrable
PR avec le refactor, commit type `perf(structure): construire structure_tree une seule fois par requête (fix 500/timeout liste membres)`, et un résumé avant/après (nb de requêtes + latence).

## À NE PAS faire
- Ne pas supprimer les variants `*_old` sans vérifier leurs références.
- Ne pas toucher à l'auth, à l'enveloppe de réponse globale, ni au `ValidationPipe`.
- Ne pas modifier le frontend, sauf nécessité de compatibilité (et alors le signaler).

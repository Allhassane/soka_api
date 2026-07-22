# Journal de développement — SOKA API

> **📓 À quoi sert ce fichier — `docs/JOURNAL.md` (journal de suivi).** Historique **chronologique**
> des sessions de travail (dont sessions avec Claude). Il répond à « **qu'est-ce qui a été fait, et
> pourquoi ?** ». Complément du fichier de contexte `CLAUDE.md`, qui, lui, décrit l'**état durable**
> (pas l'historique).
> **Règles de maintenance :**
> - **Une entrée par session significative**, la plus récente en haut, au format ci-dessous.
> - Toujours préciser le **module** concerné (workflow par module → merge global).
> - Noter le **pourquoi** des décisions, pas seulement le quoi — c'est ce qui a de la valeur plus tard.
> - Quand une décision devient une règle permanente, la **remonter aussi dans `CLAUDE.md`**.

Une entrée par session significative, la plus récente en haut.

**Format d'une entrée :**

```
## AAAA-MM-JJ — Titre court
**Contexte :** pourquoi cette session.
- **Fait :** changements concrets (avec fichiers/commits/migrations si utile).
- **Décision :** choix pris + la raison (le « pourquoi », pas juste le « quoi »).
- **TODO :** ce qui reste ouvert.
```

---

## 2026-07-21 — Cartographie du module `membres`
**Contexte :** documenter le périmètre et la surface de couplage du module `membres`.
- **Fait :** analyse du graphe Graphify → `docs/MODULE-MEMBRES.md` (périmètre 37 fichiers/180 nœuds,
  dépendances partagées, référentiels lus, modules dépendants) avec diagramme Mermaid. Doc identique
  côté `web/docs/`. Lien ajouté dans `CLAUDE.md`.
- **Décision :** garder stables les signatures publiques de `member.service` + DTO/formats de réponse
  — 6 modules en dépendent (data-table, form, structure, export-async, committees, statistique).
- **TODO :** régénérer le doc après refactor (`graphify update .`).

---

## 2026-07-21 — Confirmation des cardinalités du domaine
**Contexte :** valider les relations réelles laissées « à confirmer » dans le glossaire.
- **Fait :** lecture des entités `member`, `structure`, `level`, `responsibility`,
  `member-responsibility`, `subscription(-payment)`, `donate(-payment)`, `role(-permission)`,
  `user(-roles)`. Ajout de la section « Relations & cardinalités (confirmé) » dans `CLAUDE.md`.
- **Découverte 1 :** deux schémas de liaison coexistent — (A) relations ORM jointes sur `uuid`,
  (B) abonnements/dons sans relation ORM, liés par colonnes `*_uuid` jointes à la main.
- **Découverte 2 :** incohérence de jointure — `role_permissions` et `user_roles` joignent sur les
  **FK numériques** (`role_id`/`permission_id`/`user_id`), pas sur `uuid` comme le reste.
- **Découverte 3 :** `member_responsibilities` a `member_id`/`responsibility_id` NULL sur toutes les
  lignes migrées → jointure obligatoire sur `member_uuid`/`responsibility_uuid`.
- **TODO :** vérifier si l'incohérence uuid/id des tables de droits est intentionnelle ou à
  harmoniser dans une future migration.

---

## 2026-07-21 — Mise en place du contexte de collaboration
**Contexte :** définition des bonnes pratiques de développement conjoint avec Claude.
- **Fait :** création de `api/CLAUDE.md` (commandes, archi NestJS/TypeORM, glossaire des 47
  entités par domaine, gotchas), de ce journal, et du `CLAUDE.md` racine. Graphe de code
  construit via Graphify (`graphify-out/`).
- **Décision :** un `CLAUDE.md` par repo (versionné) + racine (non versionné) ; journal par repo ;
  exploration via Graphify. — Raison : `web` et `api` sont deux repos git séparés.
- **Décision :** glossaire ancré sur les entités réelles extraites du graphe ; cardinalités ORM
  laissées à confirmer sur les entités (décorateurs non captés par l'AST). — Raison : éviter
  d'inventer des relations non vérifiées.
- **TODO :** confirmer les cardinalités clés (Membre↔Structure↔Responsabilité) ; ranger
  `FIX_500_LISTE_MEMBRES.md` dans ce journal ; installer `graphifyy[sql]` si on veut indexer les
  `.sql`.

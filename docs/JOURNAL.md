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

## 2026-07-24 — Recette intégrale création + modification de membre — module `membres`
**Contexte :** recette demandée de bout en bout sur `POST /members` et `PUT /members/:uuid`,
API **et** formulaire. 47 assertions jouées contre l'API réelle, plus un parcours complet du
formulaire d'ajout et d'édition dans le navigateur. Tous les membres de test portaient un
préfixe dédié et ont été supprimés : base revérifiée à **7937 membres**, son effectif d'origine.

**Verdict :** la **création fonctionne** ; la **modification était cassée pour tout le monde
sauf `is_admin`**. Sept défauts trouvés, six corrigés.

- **🔴 `membres_modifier_un_membre` n'existait pas dans `permissions`.** Le slug est exigé par
  `MemberController.update` mais n'a jamais été inséré : `PermissionsGuard` refusait donc tout
  non-admin en **403**. Le front n'a **aucune garde** sur ce slug (vérifié : zéro occurrence
  dans `web/`), si bien que le bouton « Modifier » de la fiche membre était visible pour tous
  les responsables et échouait systématiquement.
  → **Fait :** migration `1782600000000-AddMemberUpdatePermission`.
  **Décision — la migration rattache aussi la permission au rôle `RESPONSABLE`**, contrairement
  à `AddMemberTransferPermissions` qui laissait l'attribution à l'administration. — Raison : ce
  n'est pas l'ouverture d'une fonctionnalité neuve mais la réparation d'un endpoint déjà exposé
  par l'UI à tous les responsables ; sans le rattachement la migration ne changerait rien au
  symptôme. **Piège trouvé au passage :** `roles_permissions.status` vaut `0` par défaut alors
  que `findGlobalPermissions` renvoie `status: rolePerm.status` et que le front ne garde que
  `status === true` — insérer le lien sans `status = 1` l'aurait laissé **inactif**.

- **🔴 `store()` ne vérifiait aucun périmètre.** `update()` appelait `assertStructureInScope`,
  pas `store()` : un responsable du district VOMANZI a créé un membre dans le district TCHIVA
  → **201**. L'UI verrouille la hiérarchie jusqu'au district, mais un appel API direct passait.
  → **Fait :** `assertStructureInScope(dto.structure_uuid, admin_uuid)` en tête de `store()`.
  Elle refuse aussi une création **sans** structure par un non-admin — sinon le membre
  échapperait à tout périmètre. Vérifié : 403 hors périmètre, 403 sans structure, 201 dedans.

- **🟠 Périmètre dérivé de la mauvaise structure.** `getAccessibleStructureUuids` partait de la
  structure où le demandeur **habite**, alors qu'un responsable n'habite pas la structure qu'il
  dirige. Mesuré : le responsable du district VOMANZI ne voyait que **12 membres sur 26** — il
  était borné à son propre sous-groupe.
  → **Fait :** le périmètre part désormais des **structures de responsabilité**, calculées par
  `ancestorAtLevel()` (la fonction qui porte déjà R8, et qui reproduit `findStructureByLevelUuid`
  de `auth.service.ts`). Union des sous-arbres de toutes les responsabilités, une seule lecture
  de l'arbre. Vérifié en direct : **12 → 26**, soit exactement le sous-arbre VOMANZI (compté par
  requête récursive). Les trois notions de périmètre du projet — celle-ci,
  `StructureTreeService.assertTargetWithinPerimeter` et les `allowedRootUuids` du module
  transfert — disent enfin la même chose. C'était le point « asymétrie de périmètre » laissé
  ouvert par l'étape 5 du transfert.
  ⚠️ **Effet volontairement large :** tous les responsables voient désormais l'intégralité de
  leur périmètre réel. À signaler au merge global.

- **🟠 `created_at` / `updated_at` restaient NULL à chaque création** — sur les membres **et**
  sur les comptes : **7664 lignes `users` sur 7664** sans date de création.
  **Cause** (lue dans `node_modules/typeorm/query-builder/InsertQueryBuilder.js`) : le
  branchement `isCreateDate || isUpdateDate` y est **commenté**, avec la note « *we don't do it
  because this constant is already in "default" value of the column* ». `@CreateDateColumn`
  n'écrit donc rien et délègue au `DEFAULT` du schéma. Les tables créées par migration l'ont
  (`datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`), les tables **héritées** sont en
  `timestamp NULL DEFAULT NULL` → l'INSERT omet la colonne, MySQL écrit NULL. `synchronize`
  étant OFF, l'écart entité/schéma n'a jamais été rattrapé, et il restait invisible tant que les
  lignes venaient de l'import, qui fournissait les dates explicitement.
  → **Fait :** migration `1782600100000-FixLegacyTimestampDefaults` (`members`, `users`).
  **Décision — pas de backfill** : inventer une date de création serait de la donnée fausse,
  plus nuisible qu'une donnée absente.

- **🟠 Création sans `civility_uuid` → 201 avec la mauvaise civilité.**
  `findOne({ where: { uuid: undefined } })` ne filtre rien et renvoie la **première ligne** de
  `civilities` : le membre héritait de « Monsieur », donc de `gender = 'homme'` puisque le genre
  est dérivé de la civilité. Une femme créée sans civilité devenait un homme.
  → **Fait :** garde explicite → **400** « La civilité est obligatoire. »

- **🟠 `verify/phone-number` répondait « disponible » sur une catégorie inconnue.** Le service
  ne teste que `principal` et `whatsapp` ; toute autre valeur laissait `member` à `undefined`
  → faux négatif silencieux dans le formulaire d'ajout.
  → **Fait :** `@IsIn(['principal','whatsapp'])` sur le DTO. Le front envoie déjà l'une des deux.

- **🟡 `CreateMemberDto` documentait `firstname: 'Nom'` / `lastname: 'Prénom'` — inversé.**
  Vérifié sur une création réelle depuis le formulaire : le champ « Prénom » alimente
  `firstname`. La donnée était juste, seule la doc Swagger trompait (elle m'a d'ailleurs trompé
  en écrivant la recette). → **Fait :** descriptions corrigées.

**Sain, vérifié :** validation DTO (email, date ISO, enum de genre, format UUID), genre dérivé
de la civilité et prioritaire sur le DTO, R1 (changement de district refusé → workflow
transfert), R8 sur déplacement intra-district, mise à jour du compte utilisateur lié,
ajout/remplacement/retrait de responsabilité, 404 sur toute référence inexistante, aucun compte
en double quand le téléphone est déjà pris, unicité des matricules (aucun doublon en base).

`nest build` OK · `npx jest src/member-transfer` : **19 tests verts**.

**TODO :**
- ⚠️ **Les deux migrations ne sont PAS exécutées** (`migration:run` à lancer après coordination
  équipe — `soka_db` est partagée, et `users` appartient au module auth). Tant qu'elles ne le
  sont pas, la modification de membre reste réservée à `is_admin`.
- `store()` n'est pas transactionnel côté relations optionnelles ; `update()` non plus (déjà
  noté à l'étape 5 du transfert).
- Le matricule est calculé depuis `MAX(id) + 1` sans contrainte d'unicité en base : deux
  créations concurrentes peuvent produire le même. Aucun doublon aujourd'hui, mais rien ne le
  garantit.

---

## 2026-07-23 — Transfert de membres, étape 5 : R8 branchée sur `PUT /members/:uuid` — module `membres`
**Contexte :** le workflow de transfert était livré et prouvé (étapes 1→4), mais l'onglet
Organisation de la fiche membre continuait à réécrire `structure_uuid` librement : **le circuit
d'approbation restait contournable**, et un déplacement intra-district faisait toujours sauter
une responsabilité de groupe en silence. Objectif de la session : supprimer ce second chemin.
- **Fait :** `member.module.ts` importe `MemberTransferModule` (qui exporte déjà
  `ResponsibilityAnchorService`) ; `member.service.ts` (`update()`) refuse en **400** un
  changement de structure qui traverse une frontière de district, applique **R8** sur les
  déplacements intra-district (soft-delete des responsabilités dont l'ancre a changé +
  `logAction('members-responsibility-anchor-lost', …)`), et vérifie que la structure d'accueil
  existe — ce qui n'était pas fait du tout auparavant. `tsc --noEmit` OK, 19 tests unitaires R8
  toujours verts.
- **Décision — pas de nouvelle logique de domaine, appel au service existant.** R8 vit dans
  `ResponsibilityAnchorService` et nulle part ailleurs. — Raison : deux implémentations d'une
  même règle divergent toujours ; c'était le risque explicitement identifié au cadrage (§5,
  « portée de la règle »).
- **Décision — le soft-delete R8 est fait APRÈS l'écriture de `structure_uuid`.** — Raison :
  `update()` n'est pas transactionnel (état existant du service, non refactoré ici). En cas
  d'échec, l'ordre choisi laisse au pire une responsabilité à retirer à la main ; l'ordre
  inverse aurait pu supprimer une responsabilité sur un déplacement qui n'a pas eu lieu, soit
  une perte de donnée silencieuse.
- **⚠️ Décision — échappatoire volontaire pour les membres rattachés au-dessus du district.**
  Le refus ne se déclenche que si les **deux** districts sont déterminables. — Raison : les 104
  membres rattachés à un CHAPITRE n'ont pas de district source, et le workflow de transfert les
  refuse déjà pour cette raison. Bloquer aussi le `PUT` les rendrait **définitivement
  immobiles** — on interdirait la réparation de l'anomalie. R8 s'applique quand même.
- **Testé contre l'API réelle** (serveur en watch, code vérifié compilé dans `dist/`) :
  - **Refus cross-district — non mutant** : `PUT` d'un membre de VOMANZI vers un sous-groupe de
    TCHIVA → **400** avec le message attendu ; base vérifiée inchangée après coup.
  - **R8 sur édition simple — mutant, joué avec instantané + restauration** (protocole validé
    avec le propriétaire du projet) : KOUAME DENIS KOFFI, *Responsable groupe*, déplacé de
    NONIN/SG1 vers SOLEIL/SG1 (même district VOMANZI) → **200**, ligne
    `member_responsibilities` soft-deletée, log d'audit conforme. **Instantané restauré et base
    revérifiée** : structure d'origine, `deleted_at` à NULL, 0 ligne de transfert.
- **⚠️ Non restauré (assumé) :** `members.admin_uuid` / `updated_at` du membre cobaye portent la
  trace du test (non relevés dans l'instantané), et les entrées `log_activities` du test ont été
  laissées en place — supprimer de l'audit ce qui s'est réellement produit serait pire que la
  trace elle-même. Seule l'entrée `members-responsibility-anchor-lost` a été retirée, car elle
  décrivait une suppression de responsabilité annulée juste après.
- **TODO — asymétrie de périmètre à traiter au merge global.** `update()` contrôle le périmètre
  de la structure **source**, pas de la **cible**. Et `MemberService.assertStructureInScope`
  dérive le périmètre de la structure *où habite* le demandeur, là où le module transfert part
  de ses *structures de responsabilité* : deux notions différentes du même contrôle de sécurité.
  Sans effet pratique aujourd'hui (`membres_modifier_un_membre` absent de `permissions` → `PUT`
  réservé aux `is_admin`), mais à unifier avec le helper de périmètre partagé déjà en TODO.
- **TODO :** étape 6 — `MODULE-MEMBRES.md` (le périmètre s'étend), `graphify update .`. Et
  `docs/TRANSFERT-MEMBRES.md` est encore **non versionné** dans les deux repos (`??` au
  `git status`) : à ajouter au prochain commit.

---

## 2026-07-22 — Transfert de membres, étape 2 : API complète — module `membres`
**Contexte :** DTO, service transactionnel, 9 endpoints, permissions. Migrations exécutées sur
`soka_db` et scénario de bout en bout joué contre l'API.
- **Fait :** `member-transfer.service.ts` (création, aperçu d'impact, listes, approbation
  transactionnelle, refus, annulation, historique), `member-transfer.controller.ts`, 3 DTO,
  migration `1782500100000-AddMemberTransferPermissions`. Module importé dans `app.module.ts`
  (fichier partagé — 2 lignes, additives). **Migrations exécutées** (`member_transfers`,
  `member_transfer_items`, 3 permissions). **24 assertions E2E vertes** + 19 tests unitaires,
  `nest build` OK.
- **Décision — `assertWithinPerimeter` réimplémenté dans le module.** Son équivalent
  (`StructureTreeService.assertTargetWithinPerimeter`) est `private` et vit dans `structure`,
  un référentiel qu'on lit sans le modifier. La copie travaille sur l'index déjà en mémoire
  (zéro requête supplémentaire). — **TODO merge global : proposer un helper partagé** plutôt que
  deux implémentations d'un même contrôle de sécurité.
- **Décision — un district source UNIQUE par demande.** Des membres de districts différents
  donnent des demandes différentes. — Raison : la demande porte un contexte (« ces membres
  quittent tel district ») et c'est ce district qui approuvera dans le sens ENTRANT.
- **Décision — le contrôle R5 (membre déplacé entre-temps) est fait AVANT la transaction**, pour
  pouvoir marquer la demande `OBSOLETE` ; un `throw` à l'intérieur annulerait ce marquage. La
  transaction relit ensuite la demande avec `pessimistic_write` contre les décisions simultanées.
- **⚠️ Découverte 1 — 104 membres sont rattachés à un CHAPITRE**, donc au-dessus du district :
  leur district source est indéterminable. Le service refuse explicitement de les transférer
  (400 nominatif) plutôt que d'échouer obscurément.
- **⚠️ Découverte 2 — la responsabilité « Responsable jeunes hommes CHAPITRE » a
  `level_uuid = NULL`** et est portée par 104 membres. C'est exactement le cas `undetermined` :
  elle est **conservée** par défaut. Anomalie de référentiel à corriger côté `responsibilities`
  (hors module) — sinon ces responsabilités suivront leur porteur d'un chapitre à l'autre.
- **⚠️ Découverte 3 — `roles_permissions` : le schéma réel contredit l'entité.** Nom au pluriel
  des deux côtés, `role_id`/`permission_id` à `0` sur toutes les lignes (le lien réel est
  `role_uuid`/`permission_uuid`), `roles.id` en CHAR(36), pas de timestamps. Le `down()` de ma
  migration, écrit d'après l'ancien gotcha du `CLAUDE.md`, était faux : corrigé. **Gotcha du
  `CLAUDE.md` réécrit.**
- **⚠️ Découverte 4 — la permission `membres_modifier_un_membre` n'existe pas en base**, alors
  que `PUT /members/:uuid` l'exige. Conséquence : **seuls les `is_admin` peuvent modifier un
  membre** aujourd'hui. Non corrigé (décision produit).
- **Fait (2e passe, 2026-07-23) — les 3 permissions attribuées au rôle `RESPONSABLE`** en base
  (`roles_permissions`, `status = 1`) : **modification de données persistante et volontaire**,
  pas un artefact de test. Puis **R2 et R3 validés avec de vrais responsables non-admin** : 25
  assertions (scénario complet) + 6 (versant négatif de R2). Données de test restaurées, tables
  de transfert vides, base vérifiée conforme à l'instantané.
- **⚠️ Découverte 5 — `user_roles` est VIDE : aucun utilisateur n'a de rôle direct.** Les
  permissions d'un non-admin viennent du **rôle porté par sa responsabilité**
  (`responsibilities.role_uuid` → `RoleService.findGlobalPermissions`, `permissionsSource:
  'responsibility_role'` dans `auth.service.ts`). Les 31 responsabilités pointent toutes vers
  `RESPONSABLE`. ⇒ **Attribuer une permission à un rôle utilisateur ne sert à rien aujourd'hui** :
  c'est le rôle porté par les responsabilités qu'il faut viser. Remonté dans `CLAUDE.md`.
- **Preuves de périmètre obtenues :** le responsable de district VOMANZI reçoit **403** quand il
  tente d'approuver sa propre demande vers TCHIVA (R3) et quand il tente d'initier depuis TCHIVA
  (R2) ; le responsable de chapitre KAVOMANZINÉ, qui couvre les deux districts, passe dans les
  deux sens — la règle « district cible **ou tout supérieur** » se comporte comme prévu.
- **TODO :** étapes 3 et 4 (front), puis étape 5 (brancher R8 sur `PUT /members/:uuid`).

---

## 2026-07-22 — Transfert de membres, étape 1 : socle domaine — module `membres`
**Contexte :** première étape d'implémentation de `docs/TRANSFERT-MEMBRES.md` — migration,
entités, et la règle R8 isolée dans un service testable avant toute UI.
- **Fait :** `src/migrations/1782500000000-CreateMemberTransfer.ts` (tables `member_transfers` et
  `member_transfer_items`), les deux entités, `src/member-transfer/responsibility-anchor.service.ts`
  et `member-transfer.module.ts`. **19 tests unitaires verts** (`npx jest src/member-transfer`),
  `nest build` OK.
- **Décision — la règle R8 vit dans deux fonctions pures** (`ancestorAtLevel`, `evaluateAnchor`)
  exportées à côté du service. — Raison : la règle métier se teste sans base ni mock ; le service
  ne fait plus que charger les données et déléguer.
- **Décision — l'arbre des structures est chargé en UNE requête puis parcouru en mémoire.**
  — Raison : la remontée hiérarchique par requêtes successives a déjà coûté un timeout
  passerelle (cf. `getAllSubStructureUuids`) ; on ne refait pas l'erreur.
- **Décision — ancre indéterminable ⇒ responsabilité CONSERVÉE** (drapeau `undetermined`).
  — Raison : ne jamais supprimer une responsabilité qu'on ne sait pas situer ; l'erreur doit être
  visible, pas destructrice.
- **Décision — `resolveLevelUuidByName` ne retient que les niveaux réellement portés par une
  structure.** — Raison : `levels` mélange les catégories `level` et `responsibility` et peut
  contenir deux lignes homonymes ; seule celle présente dans l'arbre permet une comparaison
  d'ancre qui a du sens. Couvert par un test.
- **⚠️ Découverte — `DEFAULT (UUID())` est proscrit sur cette base** (blocage binlog STATEMENT,
  documenté dans `1781400000000-CreateJournalModule`), et `synchronize` étant OFF, le
  `default: () => '(UUID())'` déclaré sur plusieurs entités **n'atteint jamais le schéma réel**.
  Migration corrigée (colonne `uuid` sans défaut) + hook `@BeforeInsert` sur les deux entités,
  comme `MemberEntity.ensureUuid()`. Gotcha remonté dans `CLAUDE.md`.
- **TODO :** ⚠️ **la migration n'a PAS été exécutée** — coordination équipe requise avant
  `migration:run` (`soka_db` partagée). Le module n'est pas encore importé dans `app.module.ts`
  (fichier partagé) : ce sera fait à l'étape 2, avec le contrôleur.

---

## 2026-07-22 — Cadrage du transfert de membres entre structures — module `membres`
**Contexte :** un membre peut changer de structure (déménagement, autre motif). Aujourd'hui ce
changement se fait **sans aucun contrôle** : l'onglet Organisation de la fiche membre réécrit
`members.structure_uuid` librement. Session de cadrage du processus + plan, **aucune ligne de code
écrite**.
- **Fait :** spécification complète dans **`docs/TRANSFERT-MEMBRES.md`** (dupliquée dans
  `web/docs/`) — processus, machine à états, règles R1→R9, modèle de données (2 tables), 9
  endpoints, plan en 6 étapes, hors-périmètre assumé. Lecture préalable de `member.entity.ts`,
  `structure.entity.ts`, `level.entity.ts`, `responsibility.entity.ts`,
  `member-responsibility.entity.ts`, `auth.service.ts`, `structure-tree.service.ts`,
  `structure.service.ts`.
- **Décision — le district est le pivot du workflow.** Un déplacement intra-district reste une
  édition simple. — Raison : le district est le niveau qui connaît nommément ses membres et le
  premier où « changer de district » a un sens administratif ; en dessous, on noierait
  l'approbateur sous des demandes triviales.
- **Décision — réutiliser `assertTargetWithinPerimeter()` au lieu d'un nouveau modèle de droits.**
  L'initiateur doit avoir la source dans son périmètre, l'approbateur la cible. — Raison : la
  barrière existe déjà et est éprouvée ; le « district cible **ou tout supérieur** » tombe
  gratuitement, ce qui évite le blocage quand la responsabilité de district est vacante.
- **Décision — R8, règle d'ancre de responsabilité** (le point central) : une responsabilité de
  niveau L est conservée **ssi** `ancêtre(structure_nouvelle, L) == ancêtre(structure_ancienne, L)`.
  — Raison : ce n'est pas une invention, c'est la **formalisation du calcul déjà fait par
  `findStructureByLevelUuid`** (`auth.service.ts:136-151`). Un responsable n'habite pas la
  structure qu'il dirige : sa responsabilité porte le niveau, pas la structure. La règle se
  généralise sans table de cas particuliers (resp. national qui déménage → conservée ; resp.
  centre qui change de chapitre → conservée ; resp. centre qui change de centre régional →
  perdue). Remontée dans `CLAUDE.md`.
- **Décision — R8 dans une fonction de domaine unique** (`computeResponsibilityImpact`), appelée
  par le transfert **et** par le `PUT /members/:uuid` existant. — Raison : sans ça, deux
  comportements divergents selon le chemin emprunté pour changer de structure.
- **Décision — `member_transfer_items` fait office d'historique de mobilité** (from/to figés par
  membre). — Raison : évite une table d'audit séparée, l'information est déjà là.
- **Décision — modèle prévu pour les deux sens (`direction`), seul le sens SORTANT implémenté en
  v1.** — Raison : le cas « le membre se présente spontanément au district d'accueil » existera ;
  prévoir la colonne maintenant évite une migration plus tard.
- **Décision — pas de bouton transfert dans `MembreTable.tsx` en v1.** — Raison : consommateur
  fortement lié du module, surface de conflit inutile au merge global.
- **TODO :** ⚠️ prévenir l'équipe avant `migration:run` (table `soka_db` partagée) et avant
  l'insertion des 3 slugs dans la table partagée `permissions`. Signaler au merge que les
  **comités** subissent le même effet de bord que les responsabilités (module d'un autre
  développeur, hors v1). Notifications mail/SMS et sens ENTRANT renvoyés en v2.
- **TODO :** démarrer l'étape 1 (migration + entités + `ResponsibilityAnchorService` + tests
  unitaires de R8).

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

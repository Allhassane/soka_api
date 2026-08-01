# SOKA API - Contexte (back-end)

Back-end REST de la plateforme SOKA. **NestJS 11 · TypeORM 0.3 · MySQL `soka_db` · JWT/Passport · Bull.**
Voir la vue d'ensemble dans `../CLAUDE.md`. Journal de travail : `docs/JOURNAL.md`.

> **📄 À quoi sert ce fichier - `CLAUDE.md` (fichier de contexte).** Lu automatiquement par Claude
> Code au début de chaque session dans ce repo, et point d'entrée pour tout développeur. Il contient
> le **contexte durable** : commandes, architecture, glossaire métier, relations, pièges connus.
> **Règles de maintenance :**
> - Le mettre à jour **dans le même commit que le code** quand une commande, une convention, une
>   entité ou un piège change (versionné → partagé avec l'équipe).
> - **N'y mettre que ce qui reste vrai dans le temps.** L'historique « qui a fait quoi » va dans
>   `docs/JOURNAL.md`, pas ici.
> - Garder concis et factuel : ce fichier est chargé en tête de contexte, chaque ligne compte.

## Commandes

```bash
npm run start:dev        # NestJS en watch (dev)
npm run build            # nest build -> dist/
npm run start:prod       # node dist/main
npm run lint             # eslint --fix
npm test                 # jest (unitaires) ; test:e2e, test:cov
npm run migration:generate -- src/migrations/<Nom>   # générer une migration TypeORM
npm run migration:run    # appliquer les migrations
npm run migration:revert # annuler la dernière
```

Data source TypeORM : `src/data-source.ts`. Doc API Swagger via `@nestjs/swagger`.
Files d'attente : Bull (`@nestjs/bull`) - utilisées pour import/export asynchrones et journal.

## Travail en équipe (par module)

Développement **par module** (un module NestJS = un domaine sous `src/`) puis **merge global**
périodique. Rester dans son module ; prévenir avant de toucher aux fichiers partagés ci-dessous.

**🔒 Fichiers partagés - coordination requise avant modif** (impactent tous les modules) :
- `src/shared/entities/date-time.entity.ts` (**`DateTimeEntity` - héritée par ~toutes les entités** :
  la modifier change le schéma de toutes les tables → migration globale).
- `src/shared/enums/` (`GlobalStatus`, `DonateCategory`… partagés par paiements/abonnements/dons).
- `src/auth/` (guards, stratégies Passport, JWT), `src/app.module.ts`, helpers de pagination
  (`PaginationAPI`), `src/data-source.ts`.
- Toute **migration TypeORM** : coordonner (une migration touche `soka_db` pour tout le monde).

**Périmètre du module `membres`** (mon focus) : `src/members` + `src/member-responsibility`,
`src/member-accessories`, `src/member-travel`, `src/member-transfer`.
Dépend des référentiels partagés (civilités, villes, structures, niveaux) - les **lire** sans les
modifier.
👉 Carte détaillée (périmètre + surface de couplage + impact merge) : **`docs/MODULE-MEMBRES.md`**.
👉 Spécification du **transfert de membres entre structures** : **`docs/TRANSFERT-MEMBRES.md`**.

## Architecture

- ~46 modules sous `src/<domaine>/`, structure NestJS classique par module :
  `*.module.ts`, `*.controller.ts`, `*.service.ts`, `entities/*.entity.ts`, `dto/*.dto.ts`.
- ORM : **TypeORM** avec entités décorées. Beaucoup d'entités ont un hook `@BeforeInsert`
  (`ensureUuid()` / `generateSlug()` / `generateUuid()`) - chaque ligne porte un `uuid` public
  et souvent un `slug`. **Ne pas exposer les `id` numériques côté API : utiliser l'`uuid`.**
- Auth : `src/auth` avec Passport (`passport-local` pour le login, `passport-jwt` pour les
  requêtes) + `@nestjs/jwt`. Login par **`phone_number` + `password`** (pas email).

## Glossaire métier

> Ancré sur les entités réelles (`*.entity.ts`) extraites via Graphify. Les **cardinalités
> exactes** (@ManyToOne/@OneToMany) ne sont pas dans le graphe (décorateurs non captés par l'AST) -
> à confirmer sur les entités si un doute. 47 entités au total.

### Membres - `src/members`
- **MemberEntity** - un membre de l'organisation (le cœur du domaine). Rattaché à une structure,
  peut porter des responsabilités, des abonnements, des dons, des accessoires, des voyages.
- **MemberResponsibilityEntity** (`member-responsibility`) - table de liaison membre ↔ responsabilité
  (qui occupe quel poste, où, quand).
- **MemberAccessoryEntity** (`member-accessories`) - accessoires attribués à un membre.
- **MemberTravelEntity** (`member-travel`) - déplacements/voyages d'un membre.
- Référentiels d'état civil : **CivilityEntity** (civilité), **MaritalStatusEntity** (situation
  matrimoniale).

### Structure & hiérarchie - `src/structure`, `src/level`, `src/location`
- **StructureEntity** - une entité organisationnelle dans l'arbre hiérarchique.
- **LevelEntity** (`level`) - le niveau/rang d'une structure dans la hiérarchie (définit la profondeur).
- Paliers réels (noms en dur dans `buildBreadcrumb`) :
  `NATIONAL → REGION → CENTRE_REGIONAL → CENTRE → CHAPITRE → DISTRICT → GROUPE → SOUS_GROUPE`.
- Découpage géographique : **CountryEntity**, **CityEntity**, **DepartmentEntity**,
  **DivisionEntity**, **OrganisationCityEntity** (villes rattachées à une organisation).

### Responsabilités & comités - `src/responsibilities`, `src/committees`
- **ResponsibilityEntity** - un poste/rôle fonctionnel occupable dans une structure.
- **CommitteesEntity** / **CommitteeMemberEntity** - comités et leurs membres. Un comité porte un
  **`role_uuid`** (obligatoire à la création) et un **`level_uuid`** (facultatif), comme une
  responsabilité. Colonnes **sans relation ORM** : `CommitteeService.loadRefs()` les résout par
  requêtes séparées et batchées (pas de N+1). **Ce rôle n'est pas décoratif** : un membre de
  `committee_members` **hérite au login des permissions du rôle de son comité** (cf. fusion des
  droits ci-dessous). Un comité `status = 'disable'` n'accorde rien.
  Affecter un membre à un comité (`POST`/`DELETE /comite/:uuid/members`) exige **deux conditions
  cumulées** : la permission `membres_gerer_membres_comite` **et** `CommitteeService.canManage()`
  (être responsable *de ce* comité, ou `is_admin`). Les autres routes `/comite` restent libres.

### Activités & formations - `src/activities`, `src/activity-types`, `src/formations`, `src/jobs`, `src/module`
- **ActivityEntity** - une activité/événement (avec `ActivityTargetGender`, `ActivityTargetScope`).
- **ActivityTypeEntity** - typologie (`ActivityTypeFamily`, `ActivityTypeSubcategory`).
- **ActivityParticipantEntity**, **ActivityAttendanceEntity** - participation et présence.
- **ActivityCommitteeEntity** / **ActivityCommitteeMemberEntity**, **ActivityQuotaEntity** - organisation.
- **FormationEntity**, **JobEntity** (métier/emploi), **ModuleEntity** - référentiels annexes.

### Abonnements & paiements - `src/subscriptions`, `src/subscription-payment`, `src/payments`, `src/sokapay`
- **SubscriptionEntity** - un abonnement (souscription d'un membre).
- **SubscriptionPaymentEntity** - les paiements liés à un abonnement.
- **PaymentEntity** - paiement générique.
- **SokaPayTransactionEntity** (`sokapay`) - intégration du prestataire de paiement mobile SokaPay
  (transactions, montants en FCFA).

### Dons - `src/donate`, `src/donate-payment`
- **DonateEntity** - un don.
- **DonatePaymentEntity** - le paiement associé à un don.

### Journal / publication - `src/journals`
Sous-système de diffusion d'un journal (édition → zones → réception) :
- **JournalEditionEntity**, **JournalZoneEntity** / **JournalZoneCityEntity**,
  **JournalDistributionEntity** (`JournalDistributionStatus`, `NotificationChannel`),
  **JournalDestinationEntity**, **JournalDistrictReceptionEntity**, **JournalMemberReceptionEntity**.

### Permissions & rôles - `src/permission`, `src/role-permission`, `src/roles`, `src/user-roles`, `src/users`
- **PermissionEntity** - une permission atomique (portée par un `slug`).
- **RolePermissionEntity** - liaison rôle ↔ permission.
- Un utilisateur reçoit des rôles → rôles portent des permissions → renvoyées au front dans
  `global_permissions` (voir gotcha permissions dans `web/CLAUDE.md`).
- ⚠️ **`user_roles` est désormais PEUPLÉE** (1 ligne par compte, semée le 2026-07-25 par
  `scripts/seed-user-roles.js`) - **base locale uniquement, prod pas encore jouée**. Selon
  l'environnement, les permissions viennent donc du **rôle utilisateur** (local) ou du rôle porté
  par la **responsabilité** (prod, repli) - voir le gotcha ci-dessous.

### Import / Export asynchrone - `src/import`, `src/export-async`
- **ImportBatchEntity** / **ImportFailureEntity** - imports en masse et leurs échecs.
- **ExportJobEntity** (`ExportJobStatus`) - jobs d'export (Excel…) traités via Bull.

### Transverse - `src/mail`, `src/sms`, `src/log-activities`, `src/statistique`, `src/shared`, `src/config`
- **LogActivity** - journal d'audit des actions.
- Notifications : `mail` (@nestjs-modules/mailer), `sms`.

## Relations & cardinalités (confirmé le 2026-07-21 sur les entités)

> **Deux schémas de liaison coexistent** dans le projet - c'est le point structurant à retenir.

**Pattern A - relations ORM jointes sur `uuid`** (`@ManyToOne` + `@JoinColumn({ referencedColumnName: 'uuid' })`) :
- **MemberEntity** (`N:1`, toutes nullables, jointes sur uuid) → Civility, MaritalStatus, Country,
  City, Formation, Job, OrganisationCity, Department, Division, **Structure**.
- **MemberEntity** (`1:N`) → MemberAccessory, **MemberResponsibility**, MemberTravel.
- **StructureEntity** → `N:1` **Structure (parent, auto-référence ⇒ arbre hiérarchique)** + `N:1` Level.
- **ResponsibilityEntity** → `N:1` Level + `N:1` Role.
- **MemberResponsibilityEntity** → `N:1` Member (via `member_uuid`) + `N:1` Responsibility (via
  `responsibility_uuid`), avec `priority` et `admin_uuid`. ⚠️ Joint sur `*_uuid` car les colonnes
  `member_id` / `responsibility_id` sont **NULL sur toutes les lignes migrées** (commentaire dans
  l'entité). **Ne jamais joindre `member_responsibilities` sur les FK numériques.**
- **LevelEntity** : référentiel plat (aucune relation) - définit le rang hiérarchique.

**Pattern B - liaison par colonnes `uuid` SANS relation ORM** (jointures faites à la main dans les
services) : abonnements et dons.
- **SubscriptionEntity** / **DonateEntity** = *catalogues de campagnes* autonomes (name, amount,
  `year`, `starts_at`, `stops_at`, `max_payments_per_beneficiary`, status). **Aucune relation.**
- **SubscriptionPaymentEntity** (PK = `uuid`) → colonnes `subscription_uuid`, `beneficiary_uuid`
  (membre bénéficiaire), `actor_uuid` (membre payeur), `payment_uuid` (→ PaymentEntity). `amount` en `int`.
- **DonatePaymentEntity** → colonnes `donate_uuid`, `beneficiary_uuid`, `actor_uuid`,
  `payment_uuid`, `quantity`. `amount` en `decimal(12,2)`.
- ⇒ **« bénéficiaire » et « acteur/payeur » sont deux membres distincts** (par uuid) : l'un profite,
  l'autre paie.

**Chaîne des droits (jointures numériques, exception au pattern uuid) :**
- **User** `1:N` **UserRole** (cascade) → UserRole `N:1` User + `N:1` Role (sur `user_id` / `role_id`).
- **Role** `1:N` UserRole + `1:N` RolePermission.
- **RolePermissionEntity** `N:1` Role + `N:1` Permission - **jointes sur `role_id` / `permission_id`
  numériques** (`onDelete: CASCADE`), pas sur uuid.
- **PermissionEntity** `N:1` Module (par `module_uuid`) + `1:N` RolePermission.

## Gotchas / pièges

- **UUID vs id.** Toujours exposer/consommer l'`uuid` public, pas la PK numérique. Les hooks
  `@BeforeInsert` génèrent l'uuid ; un insert qui contourne l'ORM peut laisser un `uuid` NULL
  (déjà rencontré sur `jobs` - cf. correctifs SQL passés).

- **🚫 Jamais de `DEFAULT (UUID())` dans une migration.** Blocage **binlog STATEMENT** déjà
  rencontré sur cette base (cf. en-tête de `1781400000000-CreateJournalModule`). Et comme
  `synchronize` est OFF, un `default: () => '(UUID())'` déclaré sur une entité n'atteint jamais
  le schéma réel → colonne sans défaut → `uuid` NULL. **Convention : colonne `uuid` CHAR(36)
  sans défaut + hook `@BeforeInsert` côté entité** (modèle : `MemberEntity.ensureUuid()`).
  ⚠️ Certaines entités anciennes déclarent encore ce default trompeur - ne pas s'y fier.

- **Jointures : uuid vs id incohérent selon les tables.** La majorité des relations joignent sur
  `uuid` (`referencedColumnName: 'uuid'`). Les **entités** `RolePermissionEntity` et `UserRole`
  déclarent au contraire des `@JoinColumn` sur les FK numériques (`role_id`, `permission_id`,
  `user_id`). Vérifier le `@JoinColumn` de l'entité avant d'écrire une jointure manuelle.

- **Collations : ce qui casse et ce qui ne casse pas** (vérifié le 2026-07-25 sur `soka_db`).
  Les tables sont mélangées - `committees`, `levels`, `responsibilities`, `user_roles` en
  **latin1_general_ci** ; `roles`, `permissions`, `modules`, `members`, `users`,
  `committee_members` en **utf8mb4_unicode_ci**.
  - ✅ **latin1 × utf8mb4 se joignent sans problème** : MySQL convertit latin1 vers utf8mb4, dont
    le répertoire est un sur-ensemble. `committee_members × committees`, `committees × roles`,
    `user_roles × roles` fonctionnent (testées). **Ne pas s'interdire ces jointures.**
  - ❌ Le « Illegal mix of collations » du 2026-06-20 opposait **deux collations du MÊME charset**
    (`utf8mb4_general_ci` vs `utf8mb4_unicode_ci`) : ce cas-là, MySQL ne sait pas le trancher.
    C'est la seule situation à surveiller, et le correctif reste l'alignement des colonnes.

- **🚨 `roles_permissions` : ce que déclare l'entité ≠ ce qu'il y a en base** (vérifié le
  2026-07-22 sur `soka_db`).
  - La table s'appelle **`roles_permissions`** (pluriel des deux côtés), pas `role_permissions`.
  - Ses colonnes **`role_id` et `permission_id` valent `0` sur TOUTES les lignes** ; le lien réel
    passe par **`role_uuid` / `permission_uuid`**. C'est bien ce que lit le code applicatif
    (`RoleService.findGlobalPermissions`). Une requête filtrant sur `permission_id` ne remonte
    donc **rien**.
  - `roles.id` est lui-même un **CHAR(36)** égal à `roles.uuid`, pas un entier.
  - La table n'a **ni `created_at`/`updated_at` ni `deleted_at`**.
  ⇒ Même famille de piège que `member_responsibilities` : toujours joindre sur les colonnes
  `*_uuid`.

- **🔑 Créer un rôle : `roleRepository.save()` ne marche PAS.** `roles.id` est un `CHAR(36)` **sans
  AUTO_INCREMENT ni DEFAULT** alors que l'entité déclare `@PrimaryGeneratedColumn() id: number` :
  tout INSERT via l'ORM échoue (« Field 'id' doesn't have a default value »). Passer par
  **`RoleService.insertRole()`** (INSERT explicite, `id` = `uuid` généré côté Node - comme les
  lignes historiques). ⚠️ **Ne pas “corriger” le type de la PK** : `ResponsibilityEntity` et
  `UserRole` déclarent des `@JoinColumn({ referencedColumnName: 'id' })` dessus. Les lectures, elles,
  fonctionnent déjà (TypeORM rend une string dans un champ typé `number`).
  Corollaire : toute écriture dans `roles_permissions` met **`role_id = permission_id = 0`** et teste
  l'existence sur les `*_uuid` - jamais sur `role.id`, qui est une string.

- **Rôles : `status` ≠ `deleted_at`.** Désactiver un rôle écrit `roles.status = 'disable'`
  (réversible, convention partagée avec `modules`/`responsibilities`/`committees`) ; `deleted_at`
  reste la suppression. `GET /roles` sans filtre renvoie **aussi** les rôles désactivés (il faut
  pouvoir les réactiver) - les sélecteurs appellent `?status=enable`.
  Les 3 slugs de `SYSTEM_ROLE_SLUGS` sont **verrouillés** : renommage, changement de statut et
  suppression renvoient **403** (ils pilotent la dérivation des droits au login). Seules leurs
  permissions restent modifiables.

- **Abonnements/dons = pas de relation ORM.** Pour retrouver les paiements d'un membre, filtrer
  `SubscriptionPaymentEntity` / `DonatePaymentEntity` sur `beneficiary_uuid` (ou `actor_uuid`) -
  il n'y a pas de `@OneToMany` à charger via `relations:`.

- **🔎 Listes de campagnes : filtrées sur `started` PAR DÉFAUT** (depuis le 2026-07-31).
  `GET /subscriptions` et `GET /donate` **sans paramètre `status` ne renvoient que les campagnes
  en cours** - c'est vrai pour tout le monde, `is_admin` compris. Une campagne archivée absente
  d'une liste n'est donc pas un bug de périmètre. Point unique de résolution :
  `shared/services/campaign-status-filter.ts` → `resoudreStatutCampagne(status, peutFiltrer)`,
  appelé **dans le contrôleur** avant le service.
  Demander un autre statut (ou `all`) exige `abonnements_filtrer_par_statut` /
  `dons_filtrer_par_statut` et lève **403** sinon - le refus est côté API, masquer le sélecteur
  ne suffirait pas. Seule exception : demander explicitement `started` passe sans droit (le front
  envoie toujours le paramètre, sélecteur affiché ou non).
  ⚠️ **Tout appelant qui a besoin d'un autre statut doit l'envoyer**, sinon il reçoit une liste
  vide sans erreur. Cas réel : `JournalEditionModal` (web) ne propose que les campagnes
  `completed` - il demande `status=completed`, et ce droit doit rester ouvert aux rôles qui
  portent `journal_editions_creer`.

- **💳 `max_payments_per_beneficiary` = plafond CUMULÉ **par bénéficiaire**, compté en **unités**.
  Un paiement porte une `quantity` : le quota se calcule en `SUM(quantity)` sur les paiements
  **`SUCCESS`** de ce bénéficiaire pour cette campagne, jamais en `COUNT(*)` (contournable en un
  seul paiement) ni sur la campagne entière (2026-07-30 : le compteur sans `beneficiary_uuid`
  **fermait la campagne à toute l'organisation** dès le plafond atteint). Les `pending` ne comptent
  pas - ce sont des guichets abandonnés. Quatre endroits doivent rester d'accord :
  `subscription-payment.service` / `donate-payment.service` (enforcement), `subscription.service.
  getOpenToSubscribe` / `donate.service.getOpenToDonate` (listes « à souscrire »), et les routes
  `GET …/quota` qui alimentent l'écran.

- **👥 Bénéficiaires payables = `AccessScopeService`, pas `responsibilities[0]`.**
  `structure-tree.service.getBeneficiaryByConnectedUser` borne la liste au périmètre réel (admin =
  non contraint) et **inclut toujours le demandeur**. Elle est **tronquée à 100 lignes** (7 950
  membres en base) : la recherche serveur est le moyen d'atteindre un membre, pas le défilement -
  hors recherche, le demandeur est trié en tête pour que l'écran garde sa valeur par défaut.
- **⚠️ Un responsable n'habite PAS la structure qu'il dirige.** Un responsable de district vit dans
  un sous-groupe *du* district. Sa responsabilité porte le **niveau** (`responsibilities.level_uuid`),
  jamais une structure : le rattachement est **calculé** en remontant les ancêtres du membre jusqu'au
  niveau correspondant (`auth.service.ts` → `findStructureByLevelUuid` ; même logique dans
  `structure.service.ts` → `getCommittee`). Ne jamais chercher un responsable par
  `structure_uuid = <la structure dirigée>` : ça ne remonte rien.
  👉 Corollaire - **règle d'ancre** : quand un membre change de structure, une responsabilité de
  niveau L est conservée **ssi** `ancêtre(structure_nouvelle, L) == ancêtre(structure_ancienne, L)`.
  Détail et cas de référence dans `docs/TRANSFERT-MEMBRES.md` §5.

- **🚨 Déplacer un membre : deux chemins, une seule règle.** `members.structure_uuid` ne se
  réécrit que par le workflow de transfert **ou** par `PUT /members/:uuid`. Les deux appellent
  `ResponsibilityAnchorService` (`src/member-transfer`, exporté par `MemberTransferModule`) -
  **ne jamais réimplémenter la règle d'ancre localement**, deux copies divergent toujours.
  Conséquences côté `PUT` : un changement qui **traverse une frontière de district** est refusé
  en **400** (« passez par une demande de transfert »), et un déplacement intra-district
  soft-delete les responsabilités dont l'ancre a changé. Seule exception, volontaire : un membre
  rattaché **au-dessus** du district (anomalie des 104 membres sur un CHAPITRE) n'a pas de
  district source - il n'est bloqué ni ici ni par le workflow, sinon il serait immobile à vie.
  ⚠️ Relevé le 2026-07-30 : ils sont 108, et **101 d'entre eux sont des lignes sans nom ni
  prénom** (lot d'import de mai 2025, aucune référence en base). `npm run seed:purge-nameless-members`
  les supprime ; l'anomalie retomberait alors à **7 cas réels**.

- **🧭 `AccessScopeService` (`src/access-scope/`) = LE point de calcul des droits et du périmètre.**
  Une passe, 3 requêtes : rôles (responsabilités ∪ comités ∪ `user_roles`), paliers accessibles,
  et la structure du membre à chaque palier. **Ne pas recalculer un périmètre ailleurs.**
  - **Portée = niveau le plus ÉLEVÉ** atteint par une responsabilité **ou** un comité
    (`max_level`) ; l'interface s'ouvre sur le **plus bas** (`default_level`) et remonte jusqu'à
    la limite. Un responsable DISTRICT dans un comité REGION voit toute la REGION.
  - **Une seule racine suffit** (`scope_structure_uuid`) : tous les paliers sont des ancêtres
    d'une même chaîne, le sous-arbre du plus haut contient ceux des autres.
  - Côté contrôleur, lire le périmètre avec **`allowedRootUuidsFromJwt(req.user)`** - jamais
    `responsibilities[0].structure.uuid` (ignore les comités, et l'ordre du tableau est indéterminé).

- **🗂️ Catalogue des permissions : `src/permission/permission-catalog.ts`** (REFONDU le 2026-08-01,
  c'est désormais LA source de vérité - le `.md` fonctionnel décrit l'ancien monde). **28 modules /
  182 slugs canoniques** : une permission = UNE capacité réelle (menu, action, onglet, information
  sensible), avec le MÊME slug côté API et côté web. Les 85 « alias techniques » (2 slugs, 1 action)
  et les ~96 fantômes ont été supprimés.
  - **`npm run seed:permissions` est CONVERGENT et rejouable** (plus de purge) : upsert par slug,
    les statuts `roles_permissions` existants sont préservés et ne peuvent que s'élargir
    (`absorbs`/`grantTo`), les permissions hors catalogue sont supprimées avec leurs liens,
    les orphelines purgées. `--dry-run` joue tout puis annule. La même logique
    (`permission-catalog-sync.ts`) est appliquée par la migration `SyncPermissionCatalogV2`
    **au démarrage en prod**.
  - **Lectures de référentiels = `@ReferentialRead()`**, ouvertes à tout AUTHENTIFIÉ (civilités,
    pays, localités, formations, métiers, niveaux, départements, divisions, responsabilités,
    accessoires, villes d'organisation, situations, types d'activité, cascade `structure/childrens`).
    Motif : ces listes nourrissent les formulaires des autres modules - une permission d'un module
    ne doit jamais fermer l'action d'un autre (audit H1/H8/H9). Les ÉCRITURES restent sous
    permission. `check:permissions` accepte ce décorateur comme exemption déclarée.
  - Ajouter une permission = entrée dans le catalogue (avec `seedFrom`/`defaults` pour l'état
    initial) → `npm run seed:permissions` → `@RequirePermissions` sur la route → `hasPermission`
    côté web. Le seed relit les sources (`permission-code-usage.ts`) et ÉCHOUE si un slug exigé
    par l'API manque au catalogue.
  ⚠️ **Ne jamais renommer un slug** (référencé côté web et stocké en base).
  ⚠️ **`absorbs` fusionne les DROITS ACCORDÉS** : ne jamais y mettre un slug plus faible que la
  capacité cible (ex. une lecture absorbée par un `_creer` donnerait le droit d'écrire à qui
  savait lire - deux débordements de ce type ont été attrapés et refermés au premier seed local).
  ⚠️ Une permission naît **décochée** pour les rôles non couverts par `seedFrom`/`defaults`.
  ⚠️ `permission-manifest.ts` n'est **plus** la source de vérité : il ne sert qu'à la migration
  historique `1782800300000-SeedPermissionCatalog`, qui ne doit plus être rejouée.

- **🚨 D'où viennent les permissions d'un non-admin : d'une FUSION** (refonte du 2026-07-25) :
  ```
  permissions = ⋃ rôles de `user_roles` (is_active=1)  ∪  ⋃ rôles des comités du membre
                                                          (committee_members → committees.role_uuid)
  ```
  Union stricte (OU) : une permission est accordée dès qu'**une seule** source la porte. Un
  utilisateur porte **0..n** rôles, un membre appartient à **0..n** comités. Un rôle ou un comité
  **désactivé** n'accorde rien. Le **responsable** d'un comité n'hérite que s'il figure aussi dans
  `committee_members`. `permissions_source` vaut `user_role`, `committee_role` ou
  `user_role+committee_role`. Une seule requête : `RoleService.findActivePermissionsForRoleUuids()`
  (ne PAS utiliser `findGlobalPermissions` pour ça : une requête par permission, réservée à
  l'écran d'administration d'un rôle).
  ⚠️ **Ne jamais revenir à `roles[0]`** : `findUserRoles` n'a **aucun `ORDER BY`**, le « premier »
  rôle est indéterminé. C'est la raison d'être de la fusion.
  ⚠️ **Invariant : tout utilisateur a ≥ 1 ligne dans `user_roles`.** Tenu par la migration
  `BackfillUserRoles` (comptes existants) et par `UserDefaultRoleSubscriber` (hook `afterInsert`
  sur `User`, couvre les 4 voies de création, y compris la création de membre en transaction).
  Ne pas ajouter d'appel manuel : le subscriber s'en charge.
  ⚠️ **Ne jamais renseigner `user_roles.user_id` / `role_id`** (les 7 676 lignes sont à NULL) :
  `permission.service.ts:180` joint `ur.role_id = rp.role_id` et `roles_permissions.role_id` vaut
  **0 partout** → l'utilisateur hériterait de **toutes les permissions de tous les rôles**. De plus
  `roles.id` est un CHAR(36) : y écrire via la relation ORM lève une erreur en `STRICT_TRANS_TABLES`.
  Le lien réel passe **uniquement** par les `*_uuid`.
  ⇒ Deux façons d'ouvrir une fonctionnalité à quelqu'un : lui attribuer un rôle (`user_roles`),
  ou le mettre dans un comité porteur du rôle voulu.
  ⇒ Un slug absent de la table `permissions` = refusé pour tout le monde **sauf `is_admin`**
  (`PermissionsGuard` court-circuite sur `is_admin`).
  ⇒ Repli historique conservé mais désormais inerte : `responsibility_role` puis `default_membre`
  ne s'appliquent que si la fusion ne donne rien.

- **🔑 Ajouter une permission : la migration doit écrire dans DEUX tables.** Insérer la ligne dans
  `permissions` ne suffit pas - sans ligne `roles_permissions` pour un rôle donné,
  `findGlobalPermissions` renvoie `role_permission_uuid: null` et la case de Paramètres → Rôles
  échoue à la coche (« Aucun élément trouvé », `togglePermission` ne trouve pas la ligne). Créer
  donc **un lien par rôle** avec le `status` voulu (`seed:sync-role-permissions` fait le
  rattrapage en masse, à `status = 0`). Modèles à copier :
  `1782600000000-AddMemberUpdatePermission` et `1782700000000-AddCommitteeMemberManagementPermission`.
  Conventions : `module_uuid` **résolu** depuis une permission existante (jamais codé en dur),
  uuid générés côté Node, migration **idempotente** qui n'éteint jamais un lien déjà actif.
  ⚠️ Dette connue : les 3 permissions du transfert (2026-07-22) n'ont de ligne que pour
  `RESPONSABLE` - elles sont **incochables** pour `ADMINISTRATEUR` et `MEMBRE`.

- **🔐 Les permissions ne sont PLUS dans le JWT.** `PermissionsGuard` les résout depuis la base
  (`EffectivePermissionsService`, une requête, cache 30 s par utilisateur, service `@Global`).
  Conséquences : la taille du token ne dépend plus du nombre de routes protégées, et **accorder
  une permission prend effet en < 30 s, sans reconnexion**. Ne pas remettre de slugs dans le
  payload : le plafond du cookie (ci-dessous) a été atteint trois fois.

- **🛡️ Toute route doit être protégée ou explicitement exemptée.** `npm run check:permissions`
  échoue sinon. Une exemption s'écrit dans `scripts/check-route-permissions.js` **avec sa
  justification**, via `@Public()`, ou via `@ReferentialRead()` (lecture de nomenclature ouverte
  à tout authentifié - jamais sur une route qui rend de la donnée de membre). Ce garde-fou existe parce qu'un codemod avait protégé
  les lectures d'un contrôleur en laissant ses écritures ouvertes - import de masse et envoi
  SMS de masse accessibles à tout compte authentifié, sans que rien ne le détecte.

- **🧱 `@RequirePermissions` ne borne PAS les données.** Il accorde le droit d'utiliser une
  fonction ; le périmètre hiérarchique est un contrôle **distinct**. Toute route recevant un
  **uuid de structure fourni par l'appelant** doit appeler
  `StructureTreeService.assertStructureWithinPerimeter()` - sinon changer l'uuid dans l'URL
  suffit à lire tout l'arbre (fuite réelle : 7 950 membres avec téléphones et e-mails exposés à
  un responsable de sous-groupe). Idem pour une structure de **destination** en écriture
  (`PUT /members/:uuid`), sans quoi l'utilisateur élargit son propre périmètre.

- **🍪 Le JWT finit dans un cookie de 4 096 o max - budget serré.** Le front **re-chiffre** le token
  (`useAuth.login` → `encryptData`, A256GCM+base64 = **+38 %**) avant de le poser en cookie. Chrome
  **jette silencieusement** tout cookie plus gros ⇒ `middleware.ts` ne voit pas de token ⇒ boucle
  sur la page de login **sans message d'erreur**. C'est arrivé le 2026-07-25 : 46 slugs dans le JWT
  admin = cookie de **4 106 o** ; puis, avec la fusion des droits, **5 117 o** pour un cumul de rôles.
  **Deux garde-fous, à ne pas défaire** (`auth.service.ts`, fin de `login()`) :
  1. `payload.permissions` est **vide pour un `is_admin`** (`PermissionsGuard` court-circuite sur
     `is_admin` et ne les lit jamais) ;
  2. pour les autres, il ne contient que les slugs **réellement contrôlés par l'API**, c.-à-d.
     `ENFORCED_PERMISSION_SLUGS` - un `Set` alimenté **à l'exécution** par le décorateur
     `@RequirePermissions` lui-même (17 slugs sur 71 aujourd'hui). Ne jamais remplacer ce registre
     par une liste en dur : les slugs passés par constante
     (`@RequirePermissions(MANAGE_COMMITTEE_MEMBERS)`) seraient oubliés.
  L'UI n'est pas concernée : elle lit `global_permissions` du **corps de réponse**, non filtré.
  Pire cas actuel : **1 651 o** (2 445 o de marge). Le token ne grossit désormais qu'avec le nombre
  de **routes protégées**, plus avec le nombre de permissions. Avant d'ajouter quoi que ce soit au
  payload JWT, **mesurer**.

- **⚠️ Les permissions sont gelées dans le JWT au login** (`auth.service.ts` →
  `payload.permissions`, calculé une seule fois pour éviter une requête par appel). Conséquence :
  accorder ou retirer une permission **ne change rien pour une session déjà ouverte**, côté API
  comme côté front (qui lit `global_permissions` posé au login). Toute recette de permission passe
  par une **reconnexion**. Corollaire : jouer une migration de permission sur un environnement
  actif ne « répare » personne tant que les utilisateurs ne se reconnectent pas.

- **Périmètre d'un non-admin = `assertTargetWithinPerimeter()`** (`structure-tree.service.ts`) :
  ses structures de responsabilité + leur sous-arbre. **C'est la vraie barrière d'autorisation
  hiérarchique** - la réutiliser plutôt que réinventer un contrôle. Le grisage côté front n'est
  qu'un confort.

- **📱 SMS transactionnel : mode DIFFUSION par défaut (les 2 fournisseurs envoient).** Depuis le
  2026-07-31, `sms.broadcast.enabled = true` : chaque SMS d'auth (1re connexion / mot de passe
  oublié) part **par LeTexto ET SMSPro en parallèle** → le membre reçoit **2 SMS** portant le même
  mot de passe. Raison : un fournisseur peut *accepter* un envoi puis ne jamais le livrer, et le
  failover est aveugle à ça (il ne bascule que sur une **erreur**). Conséquences à connaître :
  - **Le failover et le fournisseur actif n'ont plus d'effet sur l'envoi** tant que la diffusion
    est ON ; `sms.active_provider` ne sert plus qu'à l'ordre d'envoi et à l'écran de paramètres.
  - **Succès = au moins UN fournisseur accepte.** Un envoi partiel est un **succès** (le membre a
    son mot de passe) tracé en `WARN [SMS][BROADCAST][PARTIEL]` ; exiger les deux transformerait
    la panne d'un fournisseur en blocage de connexion. `SmsDispatchResult.attempts` porte le détail
    par fournisseur, `providers` la liste de ceux qui ont accepté.
  - **Envoi en parallèle obligatoire** (`Promise.all`) : on est sur le chemin **synchrone** du
    login, deux appels en série cumuleraient les timeouts (2 × 8 s).
  - Un fournisseur dont le toggle `sms.provider.<name>.enabled` est `false` (ou dont `canSend()`
    est faux) est **écarté sans échec** : la diffusion retombe silencieusement à 1 SMS. C'est
    pourquoi la migration `EnableSmsBroadcast` remet les **deux** toggles à `true`.
  - Coût : **2 SMS facturés par demande**. Repasser à un seul fournisseur = `PATCH
    /admin/settings/sms/broadcast {enabled:false}` (bascule à chaud), pas un redéploiement.
- **📱 Fournisseur SMS actif : TROIS niveaux de décision, la base gagne.** Même hiérarchie pour la
  diffusion (`sms.broadcast.enabled` > `.env SMS_BROADCAST_ENABLED` > `SMS_DEFAULT_BROADCAST_ENABLED`).
  Du plus fort au plus faible : (1) `app_settings.sms.active_provider` - bascule **à chaud**, relue à chaque envoi ;
  (2) `.env` **`SMS_ACTIVE_PROVIDER`** (`smspro` | `letexto`) - défaut de **déploiement**, lu
  seulement si la ligne (1) est absente ; (3) `SMS_DEFAULT_ACTIVE_PROVIDER` dans
  `sms/sms.constants.ts`. Comme `CreateAppSettings` **sème** la ligne (1), sur toute base déjà
  migrée **changer le `.env` seul ne produit aucun effet** - c'est le piège n°1 ici. Passer par
  l'écran Paramètres SMS, ou par une migration (modèle : `SetSmsproAsDefaultProvider`).
  Le défaut est **SMSPro Africa** ; LeTexto reste activé comme cible de repli.
  ⚠️ Un seul point de résolution du défaut : **`AppConfigService.smsDefaultProvider`** (et
  `.smsBroadcastEnabled` pour la diffusion). Le `SmsDispatcher` (qui envoie) et le
  `SmsSettingsService` (qui affiche) doivent tous deux passer par lui, sinon l'écran désigne un
  fournisseur / un mode et un autre s'applique.
- **📱 Transport SMSPro = `/api/v3` + `Authorization: Bearer`.** Le compte accepte aussi
  l'ancien `/api/http` avec `api_token` dans le corps ou en query (vérifié : les deux répondent
  200 sur `/balance`), mais c'est le Bearer qui est validé **envoi compris**, et un token en
  query finit dans les journaux d'accès du proxy. `SMSPRO_SENDER_ID` : **11 caractères max** et
  **doit être approuvé** côté SMSPro (`SGBNDCI` aujourd'hui) - un sender non approuvé donne un
  `422`. Un HTTP **200 peut porter `{status:'error'}`** : toujours relire l'enveloppe.
  Normalisation : `225` + les 10 chiffres locaux **en conservant le `0`** (`0749326623` →
  `2250749326623`) - retirer le `0` fait rejeter le SMS.
- **👤 Le compte de connexion d'un membre : UN seul point, `MemberAccountService`**
  (`src/users/member-account.service.ts`, exporté par `UserModule`). `reconcileAccount(member,
  manager?)` crée le compte s'il manque, sinon réaligne nom/prénom/e-mail/**téléphone**, et rend un
  verdict (`created` · `updated` · `unchanged` · `skipped_no_phone` · `skipped_phone_taken`).
  Appelé par `MemberService.store()`, `MemberService.update()` **et** les deux branches de
  `ImportService`. ⚠️ **Ne pas réimplémenter la règle chez un 4ᵉ appelant** : c'est exactement ce qui
  s'est passé jusqu'au 2026-08-01 - l'import écrivait le membre seul, d'où **360 membres sans
  compte** (donc sans connexion possible) que rien ne signalait, rattrapés à la main par
  `seed:create-missing-user-accounts`. Un membre sans compte ressemble à un membre normal
  jusqu'à sa 1re connexion.
  ⚖️ **Écart `members` ↔ `users` : `npm run seed:reconcile-member-accounts`** (simulation par
  défaut, `--apply` pour écrire). Décompose l'écart en 7 cas, **corrige** les deux sûrs (membre
  vivant sans aucun compte → création + ligne `user_roles` ; compte actif sur un membre supprimé →
  `is_active = 0`) et **signale** les cinq qui demandent un arbitrage. Il **réutilise** ce service
  plutôt que d'en recopier les règles. ⚠️ Ses candidats sont les membres **sans aucune ligne
  `users`, soft-deleted comprises** : `reconcileAccount` cherche via `findOne`, qui **ignore les
  lignes soft-deleted**, donc un membre au compte soft-deleted paraîtrait sans compte et en
  recevrait un **second sur le même numéro**. ⚠️ Hors contexte Nest, `UserDefaultRoleSubscriber`
  ne se déclenche pas : tout seed qui crée un compte doit appeler `ensureDefaultRole()` lui-même.
  ⚠️ **Le téléphone EST l'identifiant de connexion** : pas de téléphone ⇒ pas de compte, et un
  numéro déjà porté par un autre compte n'est **jamais** réutilisé ni volé (à la création comme à
  la mise à jour). `users.phone_number` n'a **aucun index UNIQUE** en base : rien d'autre
  n'empêcherait deux comptes sur un même numéro, et la connexion deviendrait ambiguë.
  ⚠️ **Toujours `repo.create()` + `save()`**, jamais un `INSERT` SQL : le hachage du mot de passe
  est un hook `@BeforeInsert` de `User`. Un insert brut stocke le mot de passe **en clair**.
  ⚠️ Le compte naît au **mot de passe par défaut** avec `must_change_password = true` - aucun SMS
  n'est envoyé à la création ; le vrai mot de passe part au **1er login** (`AuthService`).
  Passer le `manager` de la transaction en cours quand il y en a une, sinon un rollback du membre
  laisse un compte orphelin.
- **🔓 `POST /auth/forgot-password` répond en clair - il n'est PLUS anti-énumération** (depuis le
  2026-07-31). Chaque situation qui empêche le membre de recevoir son SMS a son code, parce que la
  page « Recevoir mon mot de passe » affiche le message tel quel : **404** numéro inconnu · **403**
  compte désactivé · **429** relance dans la fenêtre · **503** envoi impossible · **200** avec
  `data.retry_after`. Avant, ces quatre cas renvoyaient « SMS envoyé » et le membre attendait un SMS
  qui ne partait pas. ⚠️ **Contrepartie** : l'endpoint est **public** et permet donc de tester si un
  numéro a un compte ; le cooldown étant **par numéro**, il ne borne pas un balayage - **rate-limit
  par IP à poser** (non fait).
  ⚠️ **`AuthService.RESET_COOLDOWN_SECONDS` (300 s) est la seule source du délai** : il sert à
  l'anti-spam serveur **et** est renvoyé au client, qui en fait son compte à rebours et désactive
  son bouton d'envoi. Le figer en dur côté web ferait diverger l'écran et le refus 429.
  ⚠️ Invariants à ne pas casser : sur échec d'envoi, le mot de passe **n'est pas écrit** (le membre
  ne l'a jamais reçu) **et aucun cooldown n'est posé** (une panne fournisseur ne doit pas enfermer
  le membre 5 min). Verrouillés par `auth/auth.service.spec.ts`.
- **Login = phone_number + password**, pas email. Le guard local attend ces champs.
- **Migrations manuelles.** `synchronize` doit rester **off** ; passer par
  `migration:generate` / `migration:run`. Ne jamais laisser TypeORM modifier `soka_db` en auto.
- **Slug/uuid dupliqués selon les modules.** Certaines entités ont `.generateUUID()` vs
  `.generateUuid()` (casse différente) - vérifier le hook réel de l'entité avant de s'y fier.
- **`.sql` non indexés par Graphify** (dépendance `tree_sitter_sql` absente) : les dumps
  `sql/` et `soka_db.sql` ne sont pas dans le graphe.
- **Export lourds via Bull** : les exports Excel passent par des jobs asynchrones
  (`export-async`), pas en synchrone dans la requête HTTP.

## Fichiers ad hoc à ranger

- `FIX_500_LISTE_MEMBRES.md` à la racine du repo : note de correctif ponctuel. À terme, fusionner
  l'info utile dans `docs/JOURNAL.md` ou ce fichier, puis supprimer.

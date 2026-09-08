# SOKA API - Contexte (back-end)

Back-end REST de la plateforme SOKA. **NestJS 11 · TypeORM 0.3 · MySQL `soka_app` · JWT/Passport · Bull.**
Voir la vue d'ensemble dans `../CLAUDE.md`. Journal de travail : `docs/JOURNAL.md`.

> ⚠️ **La base de travail est `soka_app` depuis le 2026-08-05** (avant : `soka_db`, désormais
> obsolète). Chacun doit poser `DB_NAME=soka_app` dans son `.env` - voir le gotcha « bascule de
> base » plus bas.

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
npm run typeorm -- migration:create src/migrations/<Nom>  # squelette vide -> on écrit up()/down() À LA MAIN
npm run migration:run    # appliquer les migrations
npm run migration:revert # annuler la dernière
# ⚠️ migration:generate = DIAGNOSTIC UNIQUEMENT (avec --dryrun). Voir le gotcha « Migrations ».
npm run export:structures # arbre des structures en JSON (lecture seule) -> ../structures-hierarchie.json
                          # --jusqu-a=DISTRICT|SOUS_GROUPE… pour descendre plus bas, --out=<chemin>
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
- Toute **migration TypeORM** : coordonner (une migration touche `soka_app` pour tout le monde).

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
- **ResponsibilityEntity** - un poste/rôle fonctionnel occupable dans une structure. Porte un
  `level_uuid`, un `role_uuid` et un `gender`. ⚠️ **Le triplet (niveau, rôle, genre) n'est PAS
  unique** : 9 combinaisons en portent 2 à 5 (`NATIONAL/RESPONSABLE/mixte` = Conseiller(e),
  Directeur général, Secrétaire général…). Ce qui distingue deux responsabilités est le **libellé**,
  et c'est `slug` qui porte l'unicité. Les colonnes `level_id`/`role_id` sont **NULL partout** -
  ne jamais joindre dessus.
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
  lignes historiques). ⚠️ **Ne pas “corriger” le type de la PK** : `UserRole` déclare encore un
  `@JoinColumn({ referencedColumnName: 'id' })` dessus. Les lectures, elles,
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

- **🚨 `payments.source_uuid` porte LA CAMPAGNE, pas la ligne d'abonnement** (vérifié le
  2026-08-10 sur les 1 850 lignes de `soka_db` : `source_uuid = subscription_payments
  .subscription_uuid` sur 1 850, jamais `= subscription_payments.uuid`). Conséquence : **changer
  la campagne d'un paiement, c'est DEUX écritures dans UNE transaction** -
  `subscription_payments.subscription_uuid` **et** `payments.source_uuid`. N'en faire qu'une fait
  diverger l'abonnement et l'argent **en silence** : aucun contrôle existant ne rattrape ce cas.
  Les deux autres colonnes `subscription_uuid` du schéma (`sokapay_transactions`,
  `journal_editions`) sont vides à ce jour.
  ⚠️ Corollaire pour tout requêtage : **`subscription_payments.amount` porte DÉJÀ le total**
  (`prix unitaire × quantity`). Le tarif d'un abonnement est donc `amount / quantity`, jamais
  `amount` - une ligne à 30 000 pour 2 unités est un abonnement à 15 000, et une ligne à 15 000
  pour 150 unités est un abonnement à 100. Filtrer sur `amount` se trompe **dans les deux sens**.
  Modèle à copier : `seeds/seed-merge-subscription-campaigns.ts`.

- **🚨 `subscription_payments.status` PEUT MENTIR : la vérité de l'argent est dans `payments`**
  (relevé le 2026-08-04 sur `soka_db`). **23 lignes sont `pending` alors que le paiement lié est
  `failed`** - les chemins applicatifs synchronisent bien les deux (`updateLinkedEntities`, appelé
  par `syncHubPaymentByTransactionId`, l'annulation et `confirmPayment`), mais des paiements ont été
  repassés en échec **directement en SQL** sans que la ligne d'abonnement suive (signature :
  `subscription_payments.updated_at` = `created_at`, la ligne métier n'ayant jamais bougé).
  ⚠️ **Correction du 2026-08-09 : `payments.updated_at` SANS microsecondes ne signe RIEN** et ne doit
  pas servir à repérer ces lignes. Ce n'est pas la marque d'une correction manuelle mais celle de
  **toute** écriture TypeORM : `UpdateQueryBuilder` émet le littéral `CURRENT_TIMESTAMP`, sans
  précision. Vérifié sur le dump du 01/08, **avant** toute intervention : **380 lignes** en portaient
  déjà la marque (244 `paid`, 136 `failed`) - c'est-à-dire à peu près toutes celles ayant changé de
  statut une fois - contre 623 `pending` avec microsecondes, jamais mises à jour depuis leur insertion.
  ⇒ **Tout affichage de statut lit `payments.payment_status` en premier**, la ligne d'abonnement ne
  servant que de repli. Annoncer « en attente » sur un paiement échoué empêche le membre de refaire.

- **👤 Self-service : `GET /subscription-payments/mine`** (2026-08-04) rend les lignes dont l'appelant
  est **bénéficiaire OU payeur**. ⚠️ Son filtre n'est pas un périmètre hiérarchique mais une
  **identité** : `beneficiary_uuid = moi OR actor_uuid = moi`, « moi » étant **`users.member_uuid`
  résolu côté serveur** - ne jamais accepter d'uuid de membre en paramètre ici, ce serait la seule
  façon d'en faire une fuite. Elle est sous **`abonnements_paiements_creer`** (et non `..._voir`, qui
  ouvre la liste de toute l'organisation et reste refusée au MEMBRE) : même motif que la route
  `quota` voisine - c'est l'écran de souscription, donc la population autorisée à payer.
  ⚠️ Comme `quota`, elle est **déclarée avant `@Get(':uuid')`** : sinon le segment « mine » est avalé
  par la route dynamique et l'appel finit en **403** (constaté).

- **⏳ Tentative de paiement « en cours » : le refus a une SORTIE, et une seule mécanique**
  (`payments/pending-attempt.service.ts`, 2026-08-07). Abonnements **et** zaimu refusent un
  nouveau paiement tant qu'une ligne est `init`/`pending` pour le couple (campagne,
  bénéficiaire). Ce refus reste nécessaire (sans lui, un F5 enchaîne les liens de paiement),
  mais il n'avait aucune issue : au 2026-08-07, **477 lignes bloquaient 151 couples**, dont 83
  n'avaient **jamais** réussi un paiement.
  - **🚨 HUB2 ne referme JAMAIS une tentative abandonnée** : il remet l'intention en attente.
    Ni le temps, ni le cron de synchronisation ne peuvent donc débloquer quoi que ce soit -
    c'est l'**ancienneté** qui tranche. `ABANDON_THRESHOLD_MINUTES = 15` est la seule source du
    seuil (repris dans le message, dans `retry_after_minutes` et dans `can_cancel`).
  - **Chemin rapide intact** : sans ligne bloquante, `review()` fait **une** requête et
    n'appelle pas le guichet. Le coût réseau n'est payé que par ceux qui sont bloqués.
  - **Ordre imposé : vérifier AVANT de proposer d'annuler.** La revue interroge le guichet,
    crédite ce qui a été encaissé (webhook perdu) et referme ce qui a échoué ; seules les
    tentatives réellement ouvertes déclenchent la question. Elle est **placée avant le contrôle
    de quota**, sinon un paiement crédité par la revue ne serait pas compté.
  - **Jamais d'annulation implicite** : `cancel_pending` n'est honoré qu'au-delà du seuil, et
    ne doit être envoyé qu'après un 409 `PENDING_ATTEMPT` avec `can_cancel: true`.
    ⚠️ Côté web, ne jamais écrire `onClick={handlePayment}` : React passerait l'événement en 1er
    argument, donc `cancelPending = true` au premier clic.
  - **On referme TOUTES les lignes du couple, pas la plus ancienne** : 73 des 151 bénéficiaires
    bloqués en portaient plusieurs (jusqu'à 39).
  - **Une panne du guichet ne referme rien** (`unknown` ≠ `open`) : conclure à l'échec sur un
    timeout autoriserait un second débit pendant qu'un paiement aboutit. La revue se déclare
    alors `partial` et la tentative `verified: false`.
  - **404 du guichet = lien inexistant** ⇒ `PaymentService.closeUnknownPaymentLink` referme la
    ligne **et** le paiement. Ne fermer que la ligne laissait le cron réinterroger ce lien à
    chaque passage et la console d'assistance afficher un ticket déjà résolu.
  - Les routes `quota` exposent `pending_attempt` **en lecture base seule** (elles sont appelées
    au chargement de l'écran : y brancher le guichet ferait un appel réseau par affichage).

- **🚨 Cron de synchronisation : l'ORDRE compte plus que le plafond**
  (`payments/hub-payment-sync.cron.ts` + `PaymentService.syncAllPendingHubPayments`).
  Le tri était `created_at ASC` avec `take(200)`. Mesuré le 2026-08-07 en croisant `soka_db`
  et la base du guichet : **585 000 XOF encaissés et jamais crédités**, sur 38 paiements.
  - **Le mécanisme** : la file des paiements en attente comptait **349** lignes, le cron n'en
    voyait que **200** - et les 38 encaissements perdus occupaient les rangs **202 à 349**.
    Surtout, les 200 premiers n'avaient **aucune tentative de paiement** au guichet (le membre
    a ouvert le lien et n'a rien engagé) : HUB2 répond alors `paid:false, payment:null`
    **indéfiniment**, donc ils ne quittaient jamais la file et monopolisaient la fenêtre
    **pour toujours**. L'angle mort s'est ouvert le jour où la file a franchi 200, et il
    s'élargissait (0 % de perte le 01/08, 32 % le 06/08, 7 sur 9 le 07/08).
  - ⚠️ **Ne jamais revenir à `ASC`.** Le tri est **`DESC`** : un paiement qui vient d'être
    engagé est toujours en tête, quelle que soit la longueur de la file. Le plafond (500)
    n'est qu'un matelas - c'est l'ordre qui rend le blocage de tête de file impossible.
  - ⚠️ **La file doit DÉCROÎTRE.** Une tentative sans aucun paiement engagé et plus vieille
    que `CRON_ABANDON_AFTER_HOURS` est refermée via `cancelHubPaymentByTransactionId`, qui
    **désactive le lien**. Refermer la seule ligne locale laisserait un lien actif sur lequel
    un paiement tardif serait perdu en silence - le même bug par une autre porte.
  - ⚠️ **Deux seuils d'abandon, volontairement différents** (`payments/abandon.constants.ts`) :
    **15 min** quand le membre demande lui-même à recommencer (il est là, il décide), **24 h**
    quand le cron referme tout seul (personne ne valide, la marge doit être large). Ne pas les
    fusionner.
  - ⚠️ **On ne referme jamais une tentative que le guichet CONNAÎT**, même ancienne : rien ne
    permet d'exclure qu'elle aboutisse. Seul `payment: null` (jamais engagée) autorise la
    fermeture. Idem sur panne réseau : aucune fermeture.
  - Le journal du cron porte un **avertissement de saturation** quand la file touche le
    plafond. Le défaut d'origine était invisible : le cron annonçait fièrement « 200 traités »
    pendant qu'il rejouait 200 liens morts.
  - **📓 Journal de bord dédié : `logs/hub-sync-cron.log`** (`payments/hub-sync-journal.ts`),
    une ligne par passage. Il existe parce que l'information était déjà dans
    `/var/log/pm2/soka-api-out.log`, **noyée** dans tout le trafic de l'API : en pratique
    personne ne la regardait. `tail -30 logs/hub-sync-cron.log` suffit désormais.
    Chemin : `HUB_SYNC_LOG_FILE` sinon `<cwd>/logs/…` (pm2 fixe `cwd`, donc toujours le même
    endroit) ; valeur vide = désactivé ; **muet sous Jest** (sinon la suite créerait un `logs/`
    dans le dépôt). Bascule en `.1` à 2 Mo, une seule génération gardée.
    ⚠️ **Les QUATRE issues y sont écrites** (`OK` / `IGNORÉ` / `DÉSARMÉ` / `ERREUR`) plus une
    ligne `DÉMARRAGE` : un journal qui ne consigne que les succès ne prouve rien - un cron
    désarmé ou qui plante laisserait un fichier identique à celui d'un cron mort.
    ⚠️ **L'absence de lignes EST le signal** : dernière ligne datant de plus de ~10 min ⇒
    processus arrêté ou bloqué. C'est écrit dans l'en-tête du fichier.
    ⚠️ **Le journal ne doit jamais faire échouer le cron** : toute erreur d'écriture est avalée.
  - **🚨 `onModuleInit` se déclenche PLUSIEURS FOIS sur le même singleton** - mesuré : **5 fois**
    pour un seul démarrage, parce que `PaymentModule` est importé par 5 modules et que Nest
    rejoue le hook pour chacun. **Il n'y a bien qu'UNE instance et UN job planifié** (vérifié via
    `SchedulerRegistry` : `getCronJobs().size === 1`), donc pas de synchronisation concurrente -
    mais tout effet de bord posé dans un `onModuleInit` doit être **idempotent** (c'est pourquoi
    `HubSyncJournal.demarrage()` porte un verrou par processus).
  - **Le cron vit DANS le processus de l'API** (`ScheduleModule.forRoot()` + `@Cron`), pas dans
    un crontab système : `pm2 restart` le relance, mais le premier passage attend la prochaine
    tranche de 10 min. **Intervalle : `@Cron('0 */10 * * * *')`** - format à 6 champs, le premier
    `0` est la **SECONDE** : passages à :00, :10, :20, :30, :40, :50, à la seconde 0. La constante
    `INTERVALLE` est partagée avec la ligne `DÉMARRAGE` du journal, pour que la valeur affichée
    soit la valeur appliquée. C'est le **seul** `@Cron` du projet. ⚠️ `ecosystem.config.js` déclare `instances: 1` en `fork` - en `cluster`,
    on aurait **N crons concurrents** sur le même guichet.
  - **`HUB_SYNC_CRON_ENABLED=false` désarme le cron** (seule la valeur littérale `'false'` - une
    faute de frappe n'éteint rien). Raison d'être : une API **locale** pointée sur le guichet de
    **production** (recette temps réel) ne doit rien pouvoir y écrire, or ce cron referme des
    liens. Défaut : armé. Ne jamais poser cette variable en production.
  - **🚨 La liste marchande du guichet rend `environment` depuis le 2026-08-11 - et il faut le
    déployer.** Avant ce correctif (`soka-pay/api/src/server/payments.ts`), la liste MÉLANGEAIT
    sandbox et live sans l'indiquer : 47 250 XOF d'essais sandbox comptés comme encaissements
    réels par la concordance en prod. Tout consommateur de `listGatewayPayments` qui filtre ou
    additionne de l'argent doit tenir compte de ce champ (le seed de restauration REFUSE un
    guichet qui ne le rend pas).
  - **🚨 Un `failed` local n'est PAS définitif au guichet - correctif du 2026-08-20.** Mesuré :
    **30 000 XOF encaissés et jamais crédités**, sur 2 paiements des 17 et 18/08. Le membre rate
    sa validation, HUB2 répond `failed`, le cron referme la ligne - **puis le membre recommence
    sur le MÊME lien et réussit** (47 min plus tard dans un cas, 9 min dans l'autre). Un lien
    HUB2 **n'expire pas** (`expiresAt: null`), passe simplement `used`, et n'est désactivé que
    par le geste explicite du membre : il reste donc **payable après un échec**.
    - Trois choses le rendaient invisible : `syncAllPendingHubPayments` ne prenait que les
      `pending` ; `syncHubPaymentByTransactionId` répondait depuis la base sans rappeler le
      guichet dès que le statut local était `failed`/`cancelled` ; et **le détecteur
      `seed:reconcile-hub-payments` portait le MÊME angle mort** (il ne regardait que les
      `pending`) - il déclarait donc « 0 encaissement non crédité » pendant que l'argent
      dormait.
    - **Il n'existe AUCUN canal de notification** : `soka_pay.webhook_endpoints` est **vide**,
      `webhook_deliveries` s'arrête aux 9 livraisons de recette du 25/06, les liens ont
      `callbackUrl: null`. Le commentaire de `cancelHubPaymentByTransactionId` (« le webhook la
      ramènera ») décrit un filet **qui n'existe pas**. Tout repose sur le polling.
    - Correctif : `syncHubPaymentByTransactionId(id, { relancerCloture: true })` rouvre une
      ligne close et réinterroge le guichet ; le cron balaie une **seconde file** des
      `failed`/`cancelled` des dernières `RECHECK_CLOSED_FOR_HOURS` (48 h).
      ⚠️ **Deux files SÉPARÉES, deux plafonds, deux tris** (500 / `created_at DESC` pour les
      `pending`, 300 / `updated_at DESC` pour les closes) : fondues, les lignes closes (72 sur
      48 h en régime courant, **350 le 07/08**) mangeraient le plafond au détriment de l'argent
      en cours. ⚠️ Le drapeau est réservé aux appels de fond - les écrans gardent le raccourci.
      ⚠️ On ne réécrit « échoué » que s'il y a un écart : sinon `updated_at` avancerait à chaque
      passage et la ligne ne sortirait **jamais** de la fenêtre.
    - Le compteur **`recredited`** est distinct de `paid` **exprès** : il doit rester à 0, et le
      cron l'affiche en `WARN` s'il monte. Noyé dans `paid`, il redeviendrait invisible.
    - ⚠️ **Une tentative qui aboutit EFFACE le motif d'échec de la précédente**
      (`captureHubPaymentDetails`) : sans ça un paiement crédité reste étiqueté
      `authentication_failed`, et c'est ce champ que lit la console d'assistance.
  - **Deux commandes, à ne pas confondre** :
    `npm run seed:reconcile-hub-payments` = **lecture stricte**, détecte les encaissements non
    crédités **quel que soit leur statut local** (`--jours=N`, défaut 90 ; `--tout` pour
    l'historique complet), liste nominative, **code de sortie 1** s'il y en a (sonde) ;
    `npm run seed:sync-hub-payments` = **écrit**, rejoue un passage du cron à la demande (utile
    juste après un déploiement, pour ne pas attendre 10 min). Le second **désarme les tâches
    planifiées de son contexte** pour ne pas lancer un balayage concurrent de celui de l'API, et
    n'embarque **aucune** logique propre : il appelle la méthode du cron.

- **📡 Le filtre d'erreurs global laisse passer `data`, et rien d'autre**
  (`shared/interceptors/error.interceptor.ts`). Toute exception est aplatie en
  `{success, message, data, errors}` : un champ posé ailleurs dans l'exception **n'atteint pas
  le navigateur** (c'est ce qui avait fait disparaître le `retry_after` de « Recevoir mon mot de
  passe »). Un refus qui veut être traité par l'écran s'écrit donc
  `throw new ConflictException({ message, data: { code: '…', … } })`, et le web le reconnaît à son
  **`code`**, jamais à son message.

- **⏱️ `HubService` a un timeout** (`HUB_TIMEOUT_MS`, 8 s par défaut) sur ses trois appels. Il
  n'en avait aucun : axios attend **sans limite** par défaut, et un guichet qui accepte la
  connexion sans répondre bloquait la requête HTTP. Devenu critique depuis que la vérification
  des tentatives est appelée **pendant l'initiation d'un paiement**.

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

- **🗑️ Supprimer un membre = `MemberService.delete()`, et rien d'autre.** Toute suppression est
  **logique** (`deleted_at`, hérité de `DateTimeEntity` par ~toutes les entités). Trois pièges,
  tous déjà payés :
  - **`softRemove(entity)` ne cascade PAS.** Les `@OneToMany` de `MemberEntity` n'ont pas d'option
    `cascade` et ne sont pas chargées : `member_responsibilities`, `member_accessories`,
    `member_travels` et `committee_members` doivent être soft-deletés **explicitement**, sinon le
    membre supprimé **reste responsable** (il continue de sortir de `structure.service.getCommittee()`).
  - **Toujours filtrer `deleted_at: IsNull()` dans un `softDelete()`** : la méthode n'ajoute pas
    cette condition et **ré-estampe** les lignes déjà supprimées avec une date neuve - on perd
    l'historique (ex. responsabilité retirée par la règle d'ancre) et une restauration la ferait
    revenir à tort.
  - **Le compte `users` est désactivé (`is_active`) ET soft-deleté.** Les deux ont un rôle
    distinct : `is_active` est le signal qu'auditent les seeds, le `softDelete` **libère le
    numéro de téléphone**. `MemberAccountService` refuse un numéro déjà porté via un `findOne`,
    qui **ignore les lignes soft-deletées** : sans ça, recréer une fiche avec le même numéro donne
    un membre **sans compte de connexion, sans aucune erreur**.
  ⚠️ **Corollaire pour toute génération de numéro de série** : le matricule se calcule depuis le
  dernier `id`, avec **`.withDeleted()` obligatoire** - un query builder filtre `deleted_at IS NULL`
  par défaut, donc supprimer le dernier membre créé ferait **régénérer son matricule** au suivant.
  Depuis le 2026-09-08 la règle vit dans **`MatriculeService`** (`src/members/matricule.service.ts`)
  et `UQ_members_matricule` est posé pour attraper le cas.
  ⚠️ **La restauration n'existe pas encore.** Quand elle sera écrite : chercher le membre en
  `withDeleted: true`, **vérifier que le numéro est libre** (`users.phone_number` n'a aucun index
  UNIQUE ⇒ deux comptes actifs sur un numéro = login ambigu), et repasser par
  `ResponsibilityAnchorService` pour les responsabilités.

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

- **🎭 Attribuer un rôle à quelqu'un : ça part de la FICHE DU MEMBRE, pas de celle du rôle**
  (2026-08-27). L'onglet **« Rôles »** de `/membres/[uuid]` liste ce que la personne porte, permet
  d'ajouter et de retirer ; la fiche d'un rôle (Paramètres → Rôles) est passée en **lecture seule**
  et ne fait plus que lister ses porteurs - vue de gouvernance qu'on ne reconstitue pas fiche par
  fiche. ⚠️ Ne pas y remettre d'action : deux points d'entrée pour le même geste, et on ne sait plus
  lequel fait foi.
  - Routes : **`GET /user-roles/members/:memberUuid`** (`utilisateurs_roles_voir`) pour lister,
    `POST /user-roles` et `DELETE /user-roles/:uuid`
    (`collaborateurs_assigner_un_role_a_un_collaborateur`) pour agir. Le paramètre de la première
    est l'uuid du **MEMBRE**, pas du compte : la jointure passe par `users.member_uuid`.
  - 🚨 **Un rôle SOCLE ne s'attribue NI ne se retire.** `assertRoleAttribuable` gardait déjà
    l'attribution ; **`assertRoleRetirable` garde désormais le retrait** - il manquait, et rien
    n'empêchait un appel direct de supprimer la ligne MEMBRE ou RESPONSABLE de quelqu'un, qui
    perdait ses droits jusqu'à sa prochaine connexion (le socle n'est resemé qu'au login).
    **Masquer un bouton ne protège jamais une route.**
  - ⚠️ **`est_socle` est calculé par le SERVEUR**, ligne par ligne, et c'est lui qui commande
    l'affichage du bouton « Retirer ». Ne pas recopier une liste de slugs dans l'écran : elle
    divergerait de `SLUGS_SOCLE` au premier rôle ajouté au socle.
  - ⚠️ Une ligne dont le rôle n'est pas chargé n'est **pas** bloquée au retrait : l'absence
    d'information n'est pas une preuve de socle, et refuser par défaut rendrait des attributions
    métier irretirables.
  - Le sélecteur d'ajout filtre sur **`is_system`** (déjà rendu par `GET /roles`) et sur les rôles
    déjà portés : pas de route « rôles attribuables », le catalogue existant suffit.
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

- **🧭 Deux barrières de périmètre, plus une route délibérément sans barrière.**
  `assertStructureWithinPerimeter()` (données) et `assertStructureNavigable()` (listes d'enfants :
  sous-arbre **+ chaîne d'ancêtres**, pour qu'une cascade puisse partir de la racine). Toutes deux
  sortent d'emblée si `isAdmin` ⇒ **un défaut de périmètre est invisible en compte admin** :
  toujours recetter avec un `RESPONSABLE` réel.
  ⚠️ **`GET /structure/transfer-targets` n'en porte aucune, exprès.** La destination d'un transfert
  est par construction hors périmètre (`MemberTransferService.create` ne contrôle que la **source**,
  R2 ; la **cible** revient à l'approbateur, R3). La brancher sur `/structure/childrens` referme
  l'écran dès le palier « Centre régional » pour tout non-administrateur - défaut réel du
  2026-09-08. Elle reste étroite : noms de structures **jusqu'au district** (`400` en deçà), sous
  `membres_initier_transfert`. Avant de « corriger » une route de lecture qui semble trop ouverte,
  **vérifier ce que la route d'écriture correspondante accepte** : ici c'est la lecture qui était
  en tort.

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

- **📊 Module Statistiques (`src/statistics/`) - agrégats SQL, lecture seule, bornés au périmètre.**
  Six endpoints `GET /statistics/members/*` (overview · demography · practice · vitality · adoption ·
  quality) + `filters`, **un par onglet** de `/statistiques/membres` : règle héritée du module
  `statistique` supprimé le 01/08 (6 routes sans écran). Le `WHERE` est construit **à un seul
  endroit** (`buildMemberWhere`) et injecté dans toutes les requêtes : sans ça, deux tuiles du même
  écran compteraient des populations différentes. Permissions :
  `statistiques_voir_menu_statistiques` + `statistiques_voir_statistiques_membres`.
  🚨 **Périmètre : un non-administrateur SANS racine ne voit RIEN (`1 = 0`)**, jamais « tout par
  défaut ». Vérifié en recette : un RESPONSABLE voit **52 membres** là où l'admin en voit 8 033.
- **🐌 JAMAIS de sous-requête corrélée dans le `SELECT` d'un `GROUP BY` sur jointures.** MySQL les
  évalue **par ligne intermédiaire**, pas par groupe : la couverture des responsables par palier
  mettait **81 secondes** avec deux `(SELECT COUNT(*) …)` dans sa liste de colonnes, **0,5 s** sans
  (comptages faits à part, rapprochés en TypeScript). Même piège avec `SUM(EXISTS (…))` sur une
  grande table : la participation aux campagnes est passée de **10,6 s à 0,3 s** en remplaçant
  l'`EXISTS` corrélé par une **jointure sur table dérivée** (`LEFT JOIN (SELECT DISTINCT …)`).
- **🔑 `members.uuid` n'avait AUCUN index** jusqu'au 2026-08-19 (`IDX_members_uuid`, migration
  `AddMembersUuidIndex`). La clé primaire est `id` : toute jointure sur l'uuid - et c'est la clé de
  jointure de tout le schéma (`users.member_uuid`, `member_responsibilities.member_uuid`,
  `subscription_payments.beneficiary_uuid`) - faisait un **balayage complet** (`EXPLAIN` : `type:
  ALL`, `possible_keys: NULL`). Index **simple, pas unique** : un `UNIQUE` ferait échouer la
  migration en production sur une seule ligne dérogeante, pour un gain nul (l'objet est la
  performance de jointure). `jobs.uuid` était dans le même cas.
  ⚠️ Une jointure **latin1 ↔ utf8mb4** (cas de `member_responsibilities`, `responsibilities`,
  `levels`, `payments`, `subscription_payments` face à `members`/`structures`) **fonctionne** - MySQL
  convertit - et **utilise bien l'index** une fois qu'il existe. Le problème n'était pas la collation.
- **🌳 `structure_closure` ne couvre PAS tout l'arbre** : 3 562 structures sur 3 769 au 2026-08-19,
  soit **372 membres invisibles** à travers une portée calculée par la closure. Conséquence assumée :
  un responsable ne les voit pas (le sens de l'erreur est le bon - on cache plutôt qu'on ne divulgue),
  et l'onglet **Qualité les compte explicitement** (« membres rattachés à une structure absente de
  l'arbre ») pour que ce trou ne passe pas pour un effectif réel.
- **🧭 « Une structure a un responsable » = un membre de son sous-arbre porte un mandat TYPÉ à son
  palier** (`responsibilities.level_uuid`), remonté par la closure. La définition laxiste (« un
  membre porte un mandat quelconque ») ferait passer la couverture des sous-groupes de **36 % à
  71 %** sans qu'aucun n'ait gagné de responsable. ⚠️ `member_responsibilities` **ne porte pas la
  structure dirigée** : le mandat est imputé à l'ancêtre du bon palier du responsable - juste dans
  l'immense majorité des cas, faux si quelqu'un dirige une structure dont il n'est pas membre.
  ⚠️ Un palier sans aucun mandat au référentiel (`CENTRE_REGIONAL`) sort en **`sans_objet`**, pas à 0 %.
- **🔐 `login_logs` - journal des tentatives de connexion** (2026-08-19). Écrit par `AuthService`
  (`LoginJournalService`), lu en SQL brut par les Statistiques (aucune dépendance de module).
  Cinq issues figées : `success` · `first_login` (identifiants bons, mot de passe envoyé par SMS,
  **aucune session**) · `bad_password` · `unknown_identifier` · `inactive_account`.
  🚨 **Le journal ne fait JAMAIS échouer un login** : toutes ses erreurs sont avalées.
  🚨 **Aucun mot de passe n'y entre**, la signature ne le permet pas.
  ⚠️ **Aucun effet rétroactif** : l'historique commence à la mise en service, et l'écran affiche la
  date d'ouverture - sinon « 0 connexion sur 30 jours » se lirait comme un effondrement de l'usage.
  L'IP vient de `req.ip` (`passReqToCallback` sur la stratégie locale), **jamais** de
  `x-forwarded-for` : cet en-tête est falsifiable, un balayage s'y cacherait.
- **⚠️ `permission-catalog.ts` : les clés de `defaults` sont lues en MINUSCULES**
  (`p.defaults[role.slug.toLowerCase()]`, slugs `administrateur`/`responsable`/`membre`). Un
  `defaults: { RESPONSABLE: true }` **n'accorde rien**. Le piège est invisible pour ADMINISTRATEUR
  (forcé à vrai par ailleurs). ⚠️ Il reste des entrées fautives dans le catalogue (module Membres,
  3 permissions) : elles n'ont jamais rien accordé à RESPONSABLE. ⚠️ `defaults` ne joue **qu'à
  l'insertion** du lien : sur une base où le lien existe déjà à 0, corriger le catalogue ne suffit
  pas - seuls `absorbs`/`grantTo`/`estAdmin` élargissent un lien existant.
- **✍️ UN SEUL sender ID, « SOKA CI », et le message s'ouvre dessus** (règle du 2026-08-19).
  Les deux fournisseurs ont validé le **même** expéditeur : `LETEXTO_SENDER` = `SMSPRO_SENDER_ID` =
  **`SOKA CI`** (avant : `SG-CI` chez LeTexto, `SGBNDCI` chez SMSPro - la diffusion faisait donc
  arriver **deux SMS sous deux noms différents**). Et **tout SMS de mot de passe commence par ce
  sender ID** : « `SOKA CI : votre nouveau mot de passe est 0482. Connectez-vous avec ce mot de
  passe.` » - texte **unique**, servi par `AuthService.passwordSmsMessage()` aux **deux** portes
  d'entrée (1re connexion **et** mot de passe oublié), qui divergeaient d'un mot jusque-là.
  🔑 **Le littéral n'existe QU'À UN ENDROIT : `SMS_SENDER_ID` (`src/shared/constants/constants.ts`)**
  - depuis le 2026-08-20. Y retombent `LETEXTO_SENDER`, `SMSPRO_SENDER_ID` **et** `TEXTO_SENDER`
  (notifications Journal) quand la variable `.env` manque, ainsi que les défauts Joi de
  `env.validation.ts`, le message de test de l'écran Paramètres et `passwordSmsMessage()`.
  **Ne jamais recopier « SOKA CI » ailleurs** : importer la constante.
  ⚠️ Reste que **l'expéditeur réellement posé sur l'envoi vient du `.env`** de chaque fournisseur :
  le changer là sans changer la constante fait de nouveau diverger le texte et l'expéditeur. Le
  sender vit dans le `.env`, pas en base - le modifier **exige un redéploiement**, contrairement au
  fournisseur actif et à la diffusion.
  🚨 **Le piège s'est réalisé** : la correction du 2026-08-19 a été commitée **sans
  `auth.service.ts`** (commit `0868ec8`, 6 fichiers `sms/` seulement) - la production a donc
  continué à envoyer « **SOKA** : votre mot de passe … » sous l'expéditeur « SOKA CI » pendant que
  le working tree, lui, était correct. **Le texte du message vit dans `auth.service.ts`** : un
  commit « sender » qui ne le contient pas ne change RIEN pour le membre.
  ⚠️ **Tout SMS sortant s'ouvre sur le sender ID**, pas seulement ceux de mot de passe : les
  notifications de distribution du Journal (`prefixeSender()` dans `journal-distribution.service.ts`)
  sont préfixées **au message rendu**, pour couvrir aussi les gabarits personnalisés
  (`message_template`) ; le garde `startsWith` évite le doublon.
  ⚠️ Un sender **non approuvé** côté fournisseur fait échouer l'envoi (`422` chez SMSPro) : ne le
  changer qu'après validation **chez les deux**.
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
  **doit être approuvé** côté SMSPro (**`SOKA CI`** depuis le 2026-08-19 ; avant : `SGBNDCI`) - un
  sender non approuvé donne un `422`. Un HTTP **200 peut porter `{status:'error'}`** : toujours relire l'enveloppe.
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
  défaut, `--apply` pour écrire). Décompose l'écart, **corrige** trois cas sûrs - membre vivant
  sans aucun compte → **création** ; compte actif sur un membre supprimé → **`is_active = 0`** ;
  compte sans aucune ligne `user_roles` → **rôle par défaut MEMBRE** (ADMINISTRATEUR si
  `is_admin`) - et **signale** les six qui demandent un arbitrage. Il **réutilise**
  `MemberAccountService` et `UserRoleService.ensureDefaultRole()` plutôt que d'en recopier les
  règles. ⚠️ **Il est PUREMENT ADDITIF** : il n'insère que du manquant et ne corrige, désactive
  ni supprime **aucune** ligne existante - à la différence de `scripts/seed-user-roles.js`, qui
  est **convergent** (il supprime les lignes hors population et déplace les rôles). Choisir en
  connaissance de cause : l'additif pour la prod, le convergent pour remettre la table à plat.
  ⚠️ Ses candidats sont les membres **sans aucune ligne `users`, soft-deleted comprises** :
  `reconcileAccount` cherche via `findOne`, qui **ignore les lignes soft-deleted**, donc un membre
  au compte soft-deleted paraîtrait sans compte et en recevrait un **second sur le même numéro**.
  Même règle côté rôles : candidats = comptes sans **aucune** ligne `user_roles` ; une ligne
  seulement inactive ou soft-deletée se **réactive** (aucun index unique sur
  `(user_uuid, role_uuid)` ⇒ une 2ᵉ ligne passerait et `findUserRoles` rendrait **2 rôles**).
  ⚠️ Hors contexte Nest, `UserDefaultRoleSubscriber` ne se déclenche pas : tout seed qui crée un
  compte doit appeler `ensureDefaultRole()` lui-même.
  ⚠️ **Poser une ligne `user_roles` ne retire jamais de droits** : `EffectivePermissionsService`
  fait l'**UNION** de `user_roles`, du rôle des **responsabilités** et de celui des **comités**.
  Un responsable qui reçoit MEMBRE garde ses droits (ils ne passent pas par cette table), et
  `syncBaseRoleForMember` remplacera la ligne par RESPONSABLE à sa 1re connexion.
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
- **🔢 Le matricule d'un membre : UN seul point, `MatriculeService`**
  (`src/members/matricule.service.ts`, exporté par le module minuscule `MatriculeModule` - tirer
  `MembersModule` dans l'import créerait un cycle). `generate(manager?)` rend le prochain
  `AA-NNNN` libre ; `isPlausible(v)` dit si une valeur venue de l'extérieur est un matricule.
  ⚠️ **Ne pas réimplémenter la règle chez un 3ᵉ appelant** - c'est exactement ce qui s'est passé :
  la règle vivait dans `MemberService.store()` et l'import Excel ne la rejouait pas. Sur les 271
  membres créés par l'import entre le 27/07 et le 04/08, **235 sans aucun matricule** et 31
  portant le contenu brut du tableur (`sss`, `XXXXX`, les numéros de ligne `1`..`18`). Rattrapés
  par `npm run seed:fix-missing-matricule`. **Même famille que `MemberAccountService`** (360
  membres sans compte, 2026-08-01) : l'import réplique mal ce que fait `store()`, et l'écart est
  invisible.
  ⚠️ `buildPayload()` ne recopie la cellule « Matricule » que si `isPlausible()` l'accepte. Les
  formats retenus sont le canonique `AA-NNNN` **et** la numérotation héritée tout-chiffres
  (`0007283`, 24 fiches en base) : ce sont de **vrais identifiants**, ne pas les écraser.
  ⚠️ **Le rang est un minimum de 4 chiffres, pas une largeur fixe** : `26-10000` est valide. La
  base comptait 8 270 membres au 2026-09-08 - le cas est à ~1 700 créations, pas dans un futur
  lointain. Ne pas « corriger » l'élargissement en tronquant (un test le verrouille).
  ⚠️ `generate()` **saute un numéro déjà pris** : le rang vient de `MAX(id)` alors que les
  matricules hérités ne suivent pas les `id` (ils montent à 8604 pour un `MAX(id)` de 8270). Sans
  ce décalage, `UQ_members_matricule` ferait échouer une création.

- **🔓 `POST /auth/forgot-password` répond en clair - il n'est PLUS anti-énumération** (depuis le
  2026-07-31). Chaque situation qui empêche le membre de recevoir son SMS a son code, parce que la
  page « Recevoir mon mot de passe » affiche le message tel quel : **404** numéro inconnu · **403**
  compte désactivé · **429** relance dans la fenêtre · **503** envoi impossible · **200** avec
  `data.retry_after`. Avant, ces quatre cas renvoyaient « SMS envoyé » et le membre attendait un SMS
  qui ne partait pas. ⚠️ **Contrepartie** : l'endpoint est **public** et permet donc de tester si un
  numéro a un compte ; le cooldown étant **par numéro**, il ne borne pas un balayage - **rate-limit
  par IP à poser** (non fait).
  ⚠️ **`AuthService.RESET_COOLDOWN_SECONDS` (86 400 s = 24 h) est la seule source du délai** : il sert à
  l'anti-spam serveur **et** est renvoyé au client, qui en fait son compte à rebours et désactive
  son bouton d'envoi. Le figer en dur côté web ferait diverger l'écran et le refus 429.
  ⚠️ Invariants à ne pas casser : sur échec d'envoi, le mot de passe **n'est pas écrit** (le membre
  ne l'a jamais reçu) **et aucun cooldown n'est posé** (une panne fournisseur ne doit pas enfermer
  le membre 24 h). Verrouillés par `auth/auth.service.spec.ts`.
- **🔢 Le mot de passe envoyé par SMS fait 4 CHIFFRES** (depuis le 2026-08-02 ; avant : 6 lettres +
  3 chiffres). `AuthService.generatePassword()` tire sur `crypto.randomInt` et **conserve les zéros
  de tête** (`0482` est valide) : le mot de passe est une **chaîne**, jamais un nombre.
  ⚠️ **Ne jamais passer le champ de saisie en `<input type="number">`** - il mange le zéro de tête et
  refuserait les mots de passe **alphanumériques encore en base** (aucun compte n'a été réinitialisé :
  bcrypt compare, la longueur ne l'intéresse pas). Aucune règle de longueur côté DTO ni côté zod : en
  ajouter une fermerait la porte à l'une des deux générations de mots de passe.
  ⚠️ **10 000 valeurs possibles et AUCUNE limitation des tentatives de login** : un balayage complet
  est à portée de script. Dette assumée le 2026-08-02, à couvrir par un verrou par compte/IP sur
  `POST /auth/login` (rien de tel n'existe aujourd'hui).
- **⏳ La fenêtre anti-relance vit en BASE (`users.sending_at`), plus en mémoire** (2026-08-02) : sur
  24 h, un redémarrage de l'API aurait rouvert la porte à tout le monde. Trois colonnes historiques du
  schéma, jamais alimentées jusque-là, portent désormais le parcours : **`sending_at`** (date du dernier
  mot de passe envoyé, écrite dans le MÊME `update()` que le mot de passe), **`is_sent`**, et
  **`is_connected`** (posée à la 1re session délivrée par `login()`, un seul UPDATE dans la vie du
  compte). Aucune migration : les colonnes existent depuis l'origine.
  ⚠️ **Les DEUX portes d'entrée alimentent la même date** - `handleFirstLogin` comme
  `requestPasswordReset`. Sans ça, une 1re connexion suivie d'une demande immédiate enverrait deux
  mots de passe (le second annulant le premier) au prix de 4 SMS.
  ⚠️ Le refus **rappelle le jour et l'heure** de l'envoi précédent (`formatSentAt`, fuseau
  **`Africa/Abidjan` explicite**) : le but est que le membre retrouve son SMS, pas qu'il patiente.
  ⚠️ Une `sending_at` **future** (horloge décalée) ne bloque pas - sinon le verrou n'aurait pas de sortie.
- **Login = phone_number + password**, pas email. Le guard local attend ces champs.
- **🔄 Bascule de base : `soka_db` → `soka_app` (2026-08-05).** La base de travail est désormais
  **`soka_app`**, importée du dump serveur du 05/08 14:18. Poser **`DB_NAME=soka_app`** dans son
  `.env` (le défaut codé dans `data-source.ts` et dans les scripts reste `soka_db` - il ne s'applique
  qu'à un `.env` muet). `soka_db` n'a pas été supprimée mais elle est **périmée** : il lui manque
  toute la série `1782800000000 → 1782902000000` (dont `SyncPermissionCatalogV2`), d'où **53
  permissions au lieu de 185** et une table `user_roles` **vide**. Ne plus s'en servir comme
  référence, y compris pour un relevé « en base ».
  ⚠️ **Le contenu métier diffère, pas seulement le schéma** : `soka_app` porte **4 régions et
  17 centres régionaux** (contre 3 et 3 dans `soka_db`), 336 districts, 1 095 groupes, 2 104
  sous-groupes. Un chiffre relevé avant cette date sur `soka_db` est à re-mesurer.
  ⚠️ **`UQ_members_matricule` est POSÉ depuis le 2026-09-08** (migration
  `AddMembersMatriculeUniqueIndex`), après dédoublonnage des 10 lignes qui portaient un libellé de
  formulaire en guise de matricule. **La migration REFUSE de s'appliquer si des doublons
  subsistent** et nomme le rattrapage dans son message - à prévoir avant le déploiement en prod,
  qui n'est pas rattrapée : `npm run seed:fix-missing-matricule -- --liberer-doublons --confirm`.
  NULL reste permis (MySQL l'autorise sous un UNIQUE) : l'index garantit qu'un matricule n'est pas
  porté deux fois, pas qu'il en existe un partout - cette seconde garantie est au code.
- **🚨 Migrations : les écrire À LA MAIN. `migration:generate` détruirait la base** (mesuré le
  2026-08-07 en `--dryrun`). Le schéma réel a **beaucoup** dérivé des entités (`roles.id` CHAR(36),
  `roles_permissions`, colonnes FK numériques mortes…), et `generate` compare **toutes** les entités
  à **toute** la base : le `up()` produit fait 340 lignes et contient entre autres
  `ALTER TABLE members DROP COLUMN id, matricule, email, gender…`,
  `ALTER TABLE users DROP COLUMN id, uuid, sending_at…`, `DROP TABLE activity_types`, plus un
  `CHANGE uuid … DEFAULT (UUID())` pourtant interdit ici. Sur 7 950 membres, c'est une perte de
  données. Les 36 migrations du repo sont **toutes manuelles** — modèle :
  `1782600000000-AddMemberUpdatePermission`.
  ✅ `migration:generate --dryrun` reste **utile comme outil de diagnostic** (il n'écrit rien) pour
  visualiser la dérive entité ↔ base. Jamais pour produire une migration à appliquer.
  `synchronize` doit rester **off** ; ne jamais laisser TypeORM modifier `soka_app` en auto.

- **🕳️ TypeORM retire silencieusement les `undefined` d'un `where`** (vérifié le 2026-08-07 en
  0.3.25) : il ne lève pas, il **élargit la requête**. Un `findOne({ where: { name: payload.nom,
  … } })` dont la propriété est mal orthographiée cherche donc sur les seuls critères restants et
  rend une ligne **qui ne correspond pas** — sans erreur. C'est ce qui rendait la clé de
  dédoublonnage de `ResponsibilityService.store()` aveugle au libellé. Se méfier partout où un
  `where` est construit depuis un `payload: any` (les DTO ne protègent pas : le champ absent est
  juste `undefined`).

- **⚠️ Un index UNIQUE ignore `deleted_at`.** Un `slug`/`matricule` libéré par un soft-delete reste
  pris **en base** alors qu'un `findOne` classique ne le voit plus : le contrôle d'unicité applicatif
  doit passer `withDeleted: true`, sinon MySQL rend une **1062 brute → 500**. Cas traité sur
  `responsibilities.slug` (2026-08-07) ; `members.matricule` a le problème inverse (index
  **non posé**, cf. bascule de base).
- **Slug/uuid dupliqués selon les modules.** Certaines entités ont `.generateUUID()` vs
  `.generateUuid()` (casse différente) - vérifier le hook réel de l'entité avant de s'y fier.
- **`.sql` non indexés par Graphify** (dépendance `tree_sitter_sql` absente) : les dumps
  `sql/` et `soka_db.sql` ne sont pas dans le graphe.
- **Export lourds via Bull** : les exports Excel passent par des jobs asynchrones
  (`export-async`), pas en synchrone dans la requête HTTP.
- **🔗 Rapport public par lien à clé : `GET /api/rapports/effectifs-abonnements?cle=…`**
  (2026-08-27, `src/reports/`). Rend en **JSON brut** la pyramide Région > Centre régional > Centre >
  Chapitre avec, à chaque niveau, abonnés distincts / abonnements (somme des quantités) / membres,
  sur les paiements **réussis** de la campagne d'abonnement en cours (`?campagne=<uuid>` pour en
  viser une autre). **Aucun écran ne l'appelle et aucun ne doit l'appeler** : il est fait pour être
  ouvert à la main dans un navigateur.
  - 🚨 **Route `@Public()` : seule la clé la protège.** `RAPPORT_PUBLIC_KEY` **vide ou absente
    ⇒ route FERMÉE (404)** - une variable oubliée au déploiement ne doit pas publier les effectifs.
    Comparaison en **temps constant** ; **404 sur clé fausse**, jamais 403 (un 403 confirmerait que
    l'URL existe). ⚠️ Une clé dans une URL finit dans l'historique, les journaux du proxy et le
    `Referer` : prix assumé d'un lien cliquable, la révoquer = changer le `.env` + redémarrer.
  - ⚠️ **`@Res()` volontaire** : il court-circuite le `ResponseInterceptor` global, donc **pas
    d'enveloppe `{success, message, data}`**. Retourner l'objet la ferait revenir.
  - 🚨 **Remontée récursive de l'arbre, PAS `structure_closure`** (qui ne couvre que 3 562
    structures sur 3 782) : la closure ferait disparaître des membres et des paiements **en silence**.
  - 🚨 **Les abonnés ne s'additionnent PAS** : un bénéficiaire à cheval sur deux chapitres serait
    compté deux fois. Chaque niveau garde l'ENSEMBLE de ses bénéficiaires et rend son cardinal.
    Abonnements et membres, eux, se somment.
  - 🚨 **Aucun paiement n'est écarté.** Un abonnement payé dont la fiche membre a été supprimée
    APRÈS le paiement disparaissait du rapport (écart de 1 sur 1 098, invisible à l'œil). Les
    jointures sont donc en `LEFT JOIN` sans filtre de rattachement : ce qui ne se place pas compte
    **au national** et part dans **`non_rattaches`** avec son motif.
    **Invariant : national = somme des régions + non rattachés.**
- **📤 Export des indicateurs de la Comptabilité : un type de job À PART, cloisonné des DEUX côtés**
  (2026-08-27). `GET /accounting/exports/{payments,status/:id,download/:id}`
  (`accounting/accounting-export.{controller,service}.ts`) produit l'Excel des lignes d'une carte
  KPI. Type de job **`accounting_payments`** (`TYPE_EXPORT_COMPTA`, dans
  `export-async/entities/export-job.entity.ts`) - **aucune migration** : `export_jobs.type` est une
  colonne texte libre.
  - 🚨 **Ces exports n'appartiennent PAS au module Exports**, et le cloisonnement est **symétrique** :
    `ExportJobService.getUserJobs` les exclut **par construction** (condition dans la requête, pas un
    filtre optionnel qu'un appelant peut oublier - un `filters.type` explicite ne la contourne pas) ;
    `PaymentService.downloadTransactionsExport` **refuse** un job comptable ; et
    `AccountingExportService` refuse tout job qui **n'est pas** comptable ou qui n'appartient pas au
    demandeur. Sans ce dernier refus, la seule permission Comptabilité suffirait à télécharger
    l'export de membres de quelqu'un d'autre : **cacher un job d'une liste ne ferme aucune route.**
  - 🚨 **`payments` porte DEUX colonnes de statut, et l'export compta filtre l'AUTRE.** L'export du
    module Exports filtre **`p.status`** (statut métier) ; la Comptabilité affiche et compte
    **`p.payment_status`** (celui du guichet). Le filtre de l'export compta
    (`export-async/accounting-payments-query.ts`) reproduit `AccountingService.campaignPayments`
    condition pour condition - recopier celui du voisin rendrait un fichier plausible et **faux**.
  - 🚨 **Aucun périmètre de structure**, volontairement : `campaignPayments` n'en applique aucun,
    donc les tuiles comptent toute l'organisation. Scoper l'export livrerait un fichier **plus court
    que le chiffre affiché**, sans que rien ne le signale - on ne remarque pas les lignes qui
    manquent. Corollaire à connaître : ce fichier porte les **téléphones** des payeurs et
    bénéficiaires de toute l'organisation.
  - ⚠️ **Le fichier ne porte PAS la structure du payeur** (exigence produit). C'est la seule
    différence de contenu avec `processTransactionsExport` : recopier ses colonnes la
    réintroduirait sans bruit. Un test la verrouille (`accounting-payments-sheet.spec.ts`).
  - ⚠️ Les colonnes de paliers sont déduites du **plus profond** des arbres de bénéficiaires, pas du
    premier venu : une ligne plus profonde que l'exemple perdrait ses derniers paliers.
  - ⚠️ **Le module Comptabilité écrit dans `export_jobs`** - c'est sa seule écriture hors `acc_*`, et
    elle est **déléguée** au service du module qui possède la table. La règle qui compte tient : il
    n'écrit toujours **rien** dans `payments`.
  - `verifierSource` / `verifierBucket` vivent dans `accounting/accounting.helpers.ts` et sont
    **partagés** par l'écran et l'export : deux définitions du mot « échoué » feraient diverger le
    fichier et le chiffre affiché, et personne ne s'en apercevrait avant de compter à la main.

## Fichiers ad hoc à ranger

- `FIX_500_LISTE_MEMBRES.md` à la racine du repo : note de correctif ponctuel. À terme, fusionner
  l'info utile dans `docs/JOURNAL.md` ou ce fichier, puis supprimer.

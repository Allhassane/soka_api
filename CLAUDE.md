# SOKA API — Contexte (back-end)

Back-end REST de la plateforme SOKA. **NestJS 11 · TypeORM 0.3 · MySQL `soka_db` · JWT/Passport · Bull.**
Voir la vue d'ensemble dans `../CLAUDE.md`. Journal de travail : `docs/JOURNAL.md`.

> **📄 À quoi sert ce fichier — `CLAUDE.md` (fichier de contexte).** Lu automatiquement par Claude
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
Files d'attente : Bull (`@nestjs/bull`) — utilisées pour import/export asynchrones et journal.

## Travail en équipe (par module)

Développement **par module** (un module NestJS = un domaine sous `src/`) puis **merge global**
périodique. Rester dans son module ; prévenir avant de toucher aux fichiers partagés ci-dessous.

**🔒 Fichiers partagés — coordination requise avant modif** (impactent tous les modules) :
- `src/shared/entities/date-time.entity.ts` (**`DateTimeEntity` — héritée par ~toutes les entités** :
  la modifier change le schéma de toutes les tables → migration globale).
- `src/shared/enums/` (`GlobalStatus`, `DonateCategory`… partagés par paiements/abonnements/dons).
- `src/auth/` (guards, stratégies Passport, JWT), `src/app.module.ts`, helpers de pagination
  (`PaginationAPI`), `src/data-source.ts`.
- Toute **migration TypeORM** : coordonner (une migration touche `soka_db` pour tout le monde).

**Périmètre du module `membres`** (mon focus) : `src/members` + `src/member-responsibility`,
`src/member-accessories`, `src/member-travel`. Dépend des référentiels partagés (civilités, villes,
structures, niveaux) — les **lire** sans les modifier.
👉 Carte détaillée (périmètre + surface de couplage + impact merge) : **`docs/MODULE-MEMBRES.md`**.

## Architecture

- ~46 modules sous `src/<domaine>/`, structure NestJS classique par module :
  `*.module.ts`, `*.controller.ts`, `*.service.ts`, `entities/*.entity.ts`, `dto/*.dto.ts`.
- ORM : **TypeORM** avec entités décorées. Beaucoup d'entités ont un hook `@BeforeInsert`
  (`ensureUuid()` / `generateSlug()` / `generateUuid()`) — chaque ligne porte un `uuid` public
  et souvent un `slug`. **Ne pas exposer les `id` numériques côté API : utiliser l'`uuid`.**
- Auth : `src/auth` avec Passport (`passport-local` pour le login, `passport-jwt` pour les
  requêtes) + `@nestjs/jwt`. Login par **`phone_number` + `password`** (pas email).

## Glossaire métier

> Ancré sur les entités réelles (`*.entity.ts`) extraites via Graphify. Les **cardinalités
> exactes** (@ManyToOne/@OneToMany) ne sont pas dans le graphe (décorateurs non captés par l'AST) —
> à confirmer sur les entités si un doute. 47 entités au total.

### Membres — `src/members`
- **MemberEntity** — un membre de l'organisation (le cœur du domaine). Rattaché à une structure,
  peut porter des responsabilités, des abonnements, des dons, des accessoires, des voyages.
- **MemberResponsibilityEntity** (`member-responsibility`) — table de liaison membre ↔ responsabilité
  (qui occupe quel poste, où, quand).
- **MemberAccessoryEntity** (`member-accessories`) — accessoires attribués à un membre.
- **MemberTravelEntity** (`member-travel`) — déplacements/voyages d'un membre.
- Référentiels d'état civil : **CivilityEntity** (civilité), **MaritalStatusEntity** (situation
  matrimoniale).

### Structure & hiérarchie — `src/structure`, `src/level`, `src/location`
- **StructureEntity** — une entité organisationnelle dans l'arbre hiérarchique.
- **LevelEntity** (`level`) — le niveau/rang d'une structure dans la hiérarchie (définit la profondeur).
- Découpage géographique : **CountryEntity**, **CityEntity**, **DepartmentEntity**,
  **DivisionEntity**, **OrganisationCityEntity** (villes rattachées à une organisation).

### Responsabilités & comités — `src/responsibilities`, `src/committees`
- **ResponsibilityEntity** — un poste/rôle fonctionnel occupable dans une structure.
- **CommitteesEntity** / **CommitteeMemberEntity** — comités et leurs membres.

### Activités & formations — `src/activities`, `src/activity-types`, `src/formations`, `src/jobs`, `src/module`
- **ActivityEntity** — une activité/événement (avec `ActivityTargetGender`, `ActivityTargetScope`).
- **ActivityTypeEntity** — typologie (`ActivityTypeFamily`, `ActivityTypeSubcategory`).
- **ActivityParticipantEntity**, **ActivityAttendanceEntity** — participation et présence.
- **ActivityCommitteeEntity** / **ActivityCommitteeMemberEntity**, **ActivityQuotaEntity** — organisation.
- **FormationEntity**, **JobEntity** (métier/emploi), **ModuleEntity** — référentiels annexes.

### Abonnements & paiements — `src/subscriptions`, `src/subscription-payment`, `src/payments`, `src/sokapay`
- **SubscriptionEntity** — un abonnement (souscription d'un membre).
- **SubscriptionPaymentEntity** — les paiements liés à un abonnement.
- **PaymentEntity** — paiement générique.
- **SokaPayTransactionEntity** (`sokapay`) — intégration du prestataire de paiement mobile SokaPay
  (transactions, montants en FCFA).

### Dons — `src/donate`, `src/donate-payment`
- **DonateEntity** — un don.
- **DonatePaymentEntity** — le paiement associé à un don.

### Journal / publication — `src/journals`
Sous-système de diffusion d'un journal (édition → zones → réception) :
- **JournalEditionEntity**, **JournalZoneEntity** / **JournalZoneCityEntity**,
  **JournalDistributionEntity** (`JournalDistributionStatus`, `NotificationChannel`),
  **JournalDestinationEntity**, **JournalDistrictReceptionEntity**, **JournalMemberReceptionEntity**.

### Permissions & rôles — `src/permission`, `src/role-permission`, `src/roles`, `src/user-roles`, `src/users`
- **PermissionEntity** — une permission atomique (portée par un `slug`).
- **RolePermissionEntity** — liaison rôle ↔ permission.
- Un utilisateur reçoit des rôles → rôles portent des permissions → renvoyées au front dans
  `global_permissions` (voir gotcha permissions dans `web/CLAUDE.md`).

### Import / Export asynchrone — `src/import`, `src/export-async`
- **ImportBatchEntity** / **ImportFailureEntity** — imports en masse et leurs échecs.
- **ExportJobEntity** (`ExportJobStatus`) — jobs d'export (Excel…) traités via Bull.

### Transverse — `src/mail`, `src/sms`, `src/log-activities`, `src/statistique`, `src/shared`, `src/config`
- **LogActivity** — journal d'audit des actions.
- Notifications : `mail` (@nestjs-modules/mailer), `sms`.

## Relations & cardinalités (confirmé le 2026-07-21 sur les entités)

> **Deux schémas de liaison coexistent** dans le projet — c'est le point structurant à retenir.

**Pattern A — relations ORM jointes sur `uuid`** (`@ManyToOne` + `@JoinColumn({ referencedColumnName: 'uuid' })`) :
- **MemberEntity** (`N:1`, toutes nullables, jointes sur uuid) → Civility, MaritalStatus, Country,
  City, Formation, Job, OrganisationCity, Department, Division, **Structure**.
- **MemberEntity** (`1:N`) → MemberAccessory, **MemberResponsibility**, MemberTravel.
- **StructureEntity** → `N:1` **Structure (parent, auto-référence ⇒ arbre hiérarchique)** + `N:1` Level.
- **ResponsibilityEntity** → `N:1` Level + `N:1` Role.
- **MemberResponsibilityEntity** → `N:1` Member (via `member_uuid`) + `N:1` Responsibility (via
  `responsibility_uuid`), avec `priority` et `admin_uuid`. ⚠️ Joint sur `*_uuid` car les colonnes
  `member_id` / `responsibility_id` sont **NULL sur toutes les lignes migrées** (commentaire dans
  l'entité). **Ne jamais joindre `member_responsibilities` sur les FK numériques.**
- **LevelEntity** : référentiel plat (aucune relation) — définit le rang hiérarchique.

**Pattern B — liaison par colonnes `uuid` SANS relation ORM** (jointures faites à la main dans les
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
- **RolePermissionEntity** `N:1` Role + `N:1` Permission — **jointes sur `role_id` / `permission_id`
  numériques** (`onDelete: CASCADE`), pas sur uuid.
- **PermissionEntity** `N:1` Module (par `module_uuid`) + `1:N` RolePermission.

## Gotchas / pièges

- **UUID vs id.** Toujours exposer/consommer l'`uuid` public, pas la PK numérique. Les hooks
  `@BeforeInsert` génèrent l'uuid ; un insert qui contourne l'ORM peut laisser un `uuid` NULL
  (déjà rencontré sur `jobs` — cf. correctifs SQL passés).

- **Jointures : uuid vs id incohérent selon les tables.** La majorité des relations joignent sur
  `uuid` (`referencedColumnName: 'uuid'`), mais **`role_permissions` et `user_roles` joignent sur
  les FK numériques** (`role_id`, `permission_id`, `user_id`). Vérifier le `@JoinColumn` de
  l'entité avant d'écrire une jointure manuelle ou un QueryBuilder.

- **Abonnements/dons = pas de relation ORM.** Pour retrouver les paiements d'un membre, filtrer
  `SubscriptionPaymentEntity` / `DonatePaymentEntity` sur `beneficiary_uuid` (ou `actor_uuid`) —
  il n'y a pas de `@OneToMany` à charger via `relations:`.
- **Login = phone_number + password**, pas email. Le guard local attend ces champs.
- **Migrations manuelles.** `synchronize` doit rester **off** ; passer par
  `migration:generate` / `migration:run`. Ne jamais laisser TypeORM modifier `soka_db` en auto.
- **Slug/uuid dupliqués selon les modules.** Certaines entités ont `.generateUUID()` vs
  `.generateUuid()` (casse différente) — vérifier le hook réel de l'entité avant de s'y fier.
- **`.sql` non indexés par Graphify** (dépendance `tree_sitter_sql` absente) : les dumps
  `sql/` et `soka_db.sql` ne sont pas dans le graphe.
- **Export lourds via Bull** : les exports Excel passent par des jobs asynchrones
  (`export-async`), pas en synchrone dans la requête HTTP.

## Fichiers ad hoc à ranger

- `FIX_500_LISTE_MEMBRES.md` à la racine du repo : note de correctif ponctuel. À terme, fusionner
  l'info utile dans `docs/JOURNAL.md` ou ce fichier, puis supprimer.

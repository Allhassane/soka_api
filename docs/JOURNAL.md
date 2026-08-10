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

## 2026-08-05 — Suppression logique d'un membre : cascade, matricule, téléphone — module `membres`
**Contexte :** demande d'« implémenter le soft delete des membres ». Relevé préalable : il était
**déjà là** — `deleted_at` hérité de `DateTimeEntity`, `MemberService.delete()` en `softRemove` +
désactivation du compte, route `DELETE /members/:uuid` sous `membres_supprimer_un_membre`
(3 liens `roles_permissions`), et toutes les lectures filtrées. Mais **jamais exercé** (0 ligne
supprimée sur 8 002 en base) et **pas exposé** côté web. L'audit du chemin a sorti trois défauts
réels, corrigés ici.
- **Fait — cascade sur les liaisons (`member.service.ts`, `delete()`).** `softRemove(member)` ne
  touchait **aucune** liaison : les `@OneToMany` de `MemberEntity` n'ont pas d'option `cascade` et
  ne sont de toute façon pas chargées par le `findOne` du `delete()`. Ajout du soft-delete explicite
  de `member_responsibilities`, `member_accessories`, `member_travels` et `committee_members`, dans
  la transaction existante.
- **Décision — filtre `deleted_at: IsNull()` sur chaque `softDelete`.** `softDelete()` n'ajoute pas
  cette condition lui-même : sans elle, il **ré-estampe** les lignes déjà supprimées avec une date
  neuve. On perdrait l'information « cette responsabilité avait déjà été retirée par la règle
  d'ancre lors d'un transfert », et une future restauration la ferait revenir à tort.
- **Décision — séquentiel, pas `Promise.all`.** Une transaction tient une seule connexion ;
  des requêtes concurrentes dessus se marchent dessus.
- **Fait — matricule (`member.service.ts`, `store()`).** `.withDeleted()` ajouté à la requête du
  dernier membre. TypeORM ajoutait `deleted_at IS NULL` au query builder, donc supprimer le dernier
  membre créé faisait retomber `lastMember` sur l'avant-dernier → le membre suivant **régénérait le
  matricule du supprimé**. Et `UQ_members_matricule` n'étant pas posé en base, le doublon passait
  **sans erreur**. Une ligne soft-deletée occupe toujours son `id`.
- **Fait — le compte est désormais désactivé ET soft-deleté.** `is_active = false` reste le signal
  lisible qu'auditent les seeds (`seed:reconcile-member-accounts` traque « compte actif sur membre
  supprimé ») ; le `softDelete` **libère le numéro de téléphone**.
- **Décision — pourquoi les deux.** `MemberAccountService` refuse un numéro déjà porté
  (`skipped_phone_taken`) via un `findOne`, qui **ignore les lignes soft-deletées** : sans ça,
  recréer une fiche avec le même numéro donnait un membre **sans compte de connexion et sans la
  moindre erreur** — exactement l'angle mort des 360 membres de l'import. Le `softDelete` ferme
  aussi le login en amont d'`is_active` (`findByLoginWithPassword` est un query builder, donc
  filtré lui aussi).
- **Fait :** le log d'audit `members-delete` détaille maintenant le nombre de liaisons retirées
  par table.
- **Vérifié en conditions réelles** (protocole instantané → scénario → restauration → recontrôle,
  sur `soka_app`, cible : *Bi Drigone Jonas Toboe* `21cc3b45…`, 1 responsabilité + 1 comité +
  1 compte). `DELETE /api/members/:uuid` → **200**, puis `deleted_at` posé au même horodatage sur
  `members`, `member_responsibilities`, `committee_members` et `users` ; `users.is_active` à 0 ;
  `GET` de la fiche → **404** ; connexion avec son numéro → **401**. Log d'audit rendu :
  « … compte de connexion désactivé - liaisons retirées : 1 responsabilité(s), 0 accessoire(s),
  0 voyage(s), 1 comité(s) ». Correctif matricule vérifié sur données réelles : sur la fenêtre
  `id <= 1045`, l'ancienne requête retombait sur l'id 1044 et aurait régénéré `26-1045` — le
  matricule du supprimé ; avec `.withDeleted()` elle rend 1045 → `26-1046`. **Tout a été
  restauré** et recontrôlé (0 membre supprimé en base, ligne de log de l'action annulée retirée).
- **⚠️ Dérive résiduelle assumée du test :** `updated_at` de ces 4 lignes porte désormais
  `2026-08-06` — la colonne est en `ON UPDATE CURRENT_TIMESTAMP`, la valeur d'origine n'était pas
  dans l'instantané et n'a pas été inventée. Par ailleurs la connexion de vérification a basculé
  `users.is_connected` de 0 à 1 sur ce compte (`login()` n'écrit que si le drapeau est faux) :
  **remis à 0**, l'effectif global est revenu de 451 à 450. 👉 Leçon pour le prochain test :
  l'instantané doit inclure `updated_at` et les drapeaux de parcours (`is_connected`, `is_sent`,
  `sending_at`), pas seulement `deleted_at`.
- **TODO — restauration (chantier C, non fait).** `GET /members/deleted` + `POST
  /members/:uuid/restore`, avec deux pièges déjà identifiés : (1) chercher le membre en
  `withDeleted: true`, sinon on ne le trouve pas (même piège que `committee.service.ts:538`) ;
  (2) `users.phone_number` n'a **aucun index UNIQUE** et le numéro a pu être réattribué entre-temps
  — un `restore()` aveugle créerait deux comptes actifs sur le même numéro, donc un login ambigu.
  Pour les responsabilités, repasser par `ResponsibilityAnchorService` plutôt que les rétablir
  telles quelles (la structure a pu bouger). Prévoir les permissions
  `membres_voir_membres_supprimes` / `membres_restaurer_un_membre` — migration écrivant dans
  **`permissions` ET `roles_permissions`**, sinon les cases sont incochables.
- **TODO — à trancher côté métier :** les paiements (`subscription_payments`, `donate_payments`)
  référencent `beneficiary_uuid` **sans filtre `deleted_at`** → ils restent comptés dans les
  campagnes (probablement voulu, comptabilité) ; et `import-reference.service.ts:111` liste les
  membres **sans filtrer les supprimés** → un ré-import « mettrait à jour » un membre supprimé sans
  le restaurer, il resterait invisible.
- **⚠️ Coordination :** `member.service.ts` importe désormais `CommitteeMemberEntity`
  (module `committees`, hors périmètre `membres`). Le changement est **contenu dans mon fichier**
  — aucune modification du module `committees` — mais laisser un membre supprimé dans ses comités
  était un trou de cohérence assumé nulle part. À signaler au merge global.

---

## 2026-08-05 — Bascule de la base de travail : `soka_db` → `soka_app` — **transverse (tous modules)**
**Contexte :** la base locale `soka_db` avait dérivé de l'environnement serveur — il lui manquait
toute la série de migrations `1782800000000 → 1782902000000` (dont `SyncPermissionCatalogV2`), d'où
**53 permissions au lieu de 185** et une table `user_roles` **vide**, alors que le code, lui, attend
le catalogue refondu. Récupération du dump serveur du **05/08 14:18** (`soka_app`, 51 tables) et
bascule de toute l'équipe dessus.
- **Fait :** import du dump dans une base **`soka_app`** neuve (utf8mb4, `utf8mb4_0900_ai_ci`).
  `soka_db` **n'a pas été supprimée** — conservée comme filet, mais périmée.
- **Fait :** `migration:run` a joué les **2 migrations manquantes** du dump
  (`CreateMemberRegistration`, `AddMemberRegistrationPermissions`) → 52 tables, 185 permissions,
  `typeorm_migrations` aligné sur le repo (`1783000100000`). Démarrage vérifié : compilation sans
  erreur et `Nest application successfully started`, aucune erreur de schéma.
- **Fait — bascule documentée et outillée :** `DB_NAME=soka_app` dans `.env` ; `.env.example`
  corrigé (il décrivait encore **PostgreSQL / `despes_db`**, hérité d'un autre projet) ; `README.md`,
  `CLAUDE.md` (racine + api) mis à jour ; **défaut `soka_db` → `soka_app`** dans `src/data-source.ts`,
  `src/config/config.service.ts` et les **14 scripts** de `scripts/`.
- **Décision — nouvelle base plutôt qu'écrasement de `soka_db`.** *Pourquoi* : `soka_db` est
  partagée et le retour arrière tient alors en **une ligne de `.env`**, sans restauration de dump.
  Corollaire assumé : deux bases cohabitent, d'où l'insistance sur les défauts corrigés ci-dessus —
  un script lancé sans `DB_NAME` aurait sinon écrit dans la base périmée **sans rien signaler**.
- **Décision — aligner les défauts codés en dur plutôt que les supprimer.** *Pourquoi* : trois
  scripts (`audit-schema`, `fix-members-collation`, `setup-import-batches`) ignoraient carrément
  `DB_NAME` ; ils le lisent désormais. Les autres gardent un défaut, mais qui pointe la bonne base.
- **⚠️ Le contenu métier diffère, pas seulement le schéma.** `soka_app` porte **4 régions et
  17 centres régionaux** (contre 3 et 3 dans `soka_db`) — le palier CENTRE_REGIONAL y a enfin son
  vrai découpage —, 336 districts, 1 095 groupes, 2 104 sous-groupes, 8 002 membres.
  **Tout chiffre relevé avant ce jour sur `soka_db` est à re-mesurer**, y compris ceux cités dans
  les entrées précédentes de ce journal.
- **Fait :** `scripts/export-structures-tree.js` + `npm run export:structures` — export JSON
  **imbriqué** de l'arbre des structures (lecture seule), profondeur réglable via `--jusqu-a=`,
  sortie via `--out=`. Il charge `../.env` comme `data-source.ts`, donc il suit la base active sans
  nom en dur. Il **signale** les structures hors arbre plutôt que de les omettre silencieusement —
  contrôle passé : 3 740 nœuds exportés = 3 740 en base, **aucun orphelin**.
- **TODO :** `UQ_members_matricule` **non posé** — `CreateMemberRegistration` a sauté l'index car
  **10 lignes portent un libellé de formulaire en guise de matricule** (`"Nouveau membre ou non
  digitalisé"` ×8, `"Ancien membre venu d'autre centre"` ×2). Dédoublonner, puis
  `CREATE UNIQUE INDEX UQ_members_matricule ON members (matricule);`.
- **TODO :** chacun doit **redémarrer son API** après avoir mis `DB_NAME=soka_app` — une instance
  déjà lancée continue de servir `soka_db` sans le dire.

---

## 2026-08-05 — Cadrage : validation à deux niveaux des enregistrements de membres — module `membres`
**Contexte :** aujourd'hui, qui porte `membres_ajouter_un_membre` crée un membre **immédiatement et
définitivement** dans son périmètre — matricule et compte de connexion compris, dans la même
transaction (`member.service.ts:167` et `:296`). Demande : intercaler **deux signatures** entre la
saisie et l'existence du membre — **district** puis **chapitre**. Session de cadrage uniquement,
**aucune ligne de code**.
- **Fait :** `docs/VALIDATION-MEMBRES.md` (spécification complète, dupliquée dans `web/docs/`) —
  besoin, contraintes du code existant, machine à états, 14 règles de gestion, modèle de données,
  8 endpoints, plan en 5 étapes, pièges, jeu de test.
- **Fait — relevés en base** (lecture seule) pour ancrer la spec : `levels.order`
  (CHAPITRE = 4, DISTRICT = 5, l'`order` **croît** en descendant) · MySQL **8.0.30** (colonne JSON
  disponible) · porteurs de responsabilité par niveau (928 DISTRICT, 368 CHAPITRE, **104 à
  `level_uuid` NULL**) · **14 districts sur 334** et **3 chapitres sur 129** sans responsable de leur
  niveau résoluble · `members.matricule` **sans aucun index** (seul `IDX_members_phone` existe, non
  unique ; 0 doublon aujourd'hui).
- **Décision structurante — le dossier est une entité à part, `members` n'est pas touchée.** Un
  dossier en attente ne crée **aucune ligne** dans `members` : le formulaire est stocké en JSON dans
  `member_registrations`, et `MemberService.store()` n'est appelé qu'à la seconde signature.
  *Pourquoi* : l'alternative (colonne `validation_status` sur `members`) obligerait à auditer tous
  les chemins de lecture — listes, stats par structure, exports, bénéficiaires payables, journal,
  comités, activités — donc du code **appartenant à d'autres développeurs**, et un seul `SELECT`
  oublié afficherait un membre non validé dans les effectifs de quelqu'un d'autre. Bénéfice
  collatéral : **aucune reprise** des 7 950 membres existants. Contrepartie assumée : les contrôles
  de saisie tournent **deux fois** (à la soumission, puis à la validation finale car la base a pu
  bouger).
- **Décision — signature stricte, sans « ou tout supérieur ».** Contrairement au transfert, un
  responsable de chapitre ne peut **pas** signer l'étape district d'un dossier d'autrui : deux
  signatures doivent rester deux regards distincts. *Prix du choix, mesuré* : 14 districts et
  3 chapitres sans responsable → leurs dossiers ne sont signables que par un `is_admin`, d'où le
  secours `is_admin` **obligatoire** (R13) et l'affichage explicite du niveau vacant.
- **Décision — une étape est acquise d'office si le déposant est de niveau ≥ celui de l'étape** :
  un dossier ne **redescend** jamais la hiérarchie. Asymétrie volontaire avec la règle précédente
  (qui, elle, gouverne le dossier d'autrui) ; l'inverser = une comparaison à changer dans
  `RegistrationAuthorityService`. Le niveau se calcule sur les **responsabilités seules**, pas sur
  le `max_level` d'`AccessScopeService` : un comité donne des **permissions**, pas l'autorité de se
  porter garant.
- **Décision — refus définitif.** Le dossier est clos, pas renvoyé pour correction ; un refus au
  chapitre **annule** la signature district (conservée pour l'audit, sans effet). Reprendre la
  personne = nouveau dossier. Corollaire : la modification d'un dossier en attente devient inutile
  (hors périmètre v1, `cancel` + nouveau dépôt).
- **Décision — l'import Excel contourne le circuit** (lignes importées nées validées) : un fichier
  de 300 lignes créerait 300 dossiers à signer un par un.
- **Décision — étape district `SANS_OBJET` sous un chapitre** : les ~108 membres rattachés
  directement à un CHAPITRE n'ont pas de district au-dessus d'eux ; le chapitre signe seul plutôt
  que d'immobiliser le dossier ou de fermer un cas que la base pratique déjà.
- **Décision — pas de notification en v1** : l'écran « à valider » + badge suffisent, et le SMS part
  en mode diffusion (2 SMS facturés par envoi).
- **Quatre arbitrages ajoutés en fin de cadrage**, après relecture — le risque de cette
  fonctionnalité n'étant pas technique mais **humain** (deux personnes sur le chemin critique de
  l'enregistrement : tant qu'elles n'ont pas signé, la personne n'existe pas et ne peut pas se
  connecter), le critère retenu est « **aucun dossier ne s'arrête en silence** » :
  1. **Suppléance automatique (R5b)** au lieu du seul secours `is_admin` : si le niveau d'une étape
     est **vacant**, le niveau au-dessus signe, avec mention « par suppléance ». *Subie, jamais
     choisie* — tant que le district a un responsable, le chapitre reçoit un 403 sur l'étape
     district. Une vacance n'a rien d'exceptionnel ; sans ça, 17 structures dépendraient d'un
     administrateur national.
  2. **« Reprendre ce dossier » (R7b)** : un dossier refusé pré-remplit un dossier **neuf** (lien
     `resumed_from_uuid`). R7 tient — ce n'est pas une ré-ouverture. Sans ça, une date de naissance
     erronée fait tout ressaisir au maillon le plus bas de la chaîne.
  3. **Ancienneté du dossier visible et triable dès la v1** : sans notification **et** sans
     ancienneté, un dossier oublié ne se distingue de rien. Coût nul (date déjà stockée, pas de
     cron). Corollaire : `submitted_at` → `validated_at` donnera le **délai médian réel**, et la
     question des notifications se re-tranchera sur ce chiffre plutôt que sur une intuition.
  4. **Index unique sur `members.matricule` dans la migration de l'étape 1**, au lieu de « dette à
     traiter séparément » : c'est cette fonctionnalité qui rend la collision atteignable (les
     validations arrivent en rafale là où les saisies s'étalaient), la migration est de toute façon
     à coordonner — la reporter reviendrait à livrer le bug.
- **Fait — étape 1 (socle domaine), dans la foulée du cadrage :**
  - `src/migrations/1783000000000-CreateMemberRegistration.ts` — table `member_registrations`
    (aucune donnée existante touchée) **+ index unique sur `members.matricule`**. L'index n'est posé
    que si la colonne est déjà cohérente : un doublon préexistant est **tracé et ignoré** plutôt que
    de faire échouer tout un déploiement pour une dette qui n'est pas la nôtre.
  - `src/member-registration/entities/member-registration.entity.ts` — dossier + 3 enums
    (`RegistrationStatus`, `StepDecision`, `ValidationLevel`).
  - `src/member-registration/registration-authority.service.ts` — **le cœur des règles**, avec deux
    fonctions **pures** (`hasAuthorityOver`, `planSteps`) que les tests couvrent sans base.
  - `registration-authority.service.spec.ts` — **27 tests verts**. `tsc --noEmit` : 0 erreur sur ces
    fichiers.
- **Décision d'implémentation — l'autorité se compare par ANCRE, pas par niveau.** Être responsable
  de district ne suffit pas : il faut être responsable **de ce district-là**
  (`ancêtre(structure_du_dossier, L) === ancre_du_déposant`). Sans cette comparaison, un responsable
  de district pouvait acquérir d'office l'étape district d'un dossier déposé **dans un district
  voisin**. On ne s'est pas reposé sur `assertStructureInScope` pour fermer ce trou : ce garde-là
  dérive le périmètre de la structure **où habite** le demandeur, pas de ses responsabilités - deux
  notions différentes (asymétrie déjà relevée dans `TRANSFERT-MEMBRES.md` §9, étape 5).
- **Décision d'implémentation — un responsable sans compte actif ne « pourvoit » pas son niveau.**
  `signerUserUuids` joint `users` (`is_active = 1`, non soft-deleté) : un responsable qui ne peut pas
  se connecter ne peut pas signer, et le compter comme présent rendrait le niveau **faussement
  pourvu**, donc le dossier bloqué sans recours (360 membres étaient sans compte jusqu'au
  2026-08-01).
- **Fait — étape 2 (service + API), même session :** `member-registration.service.ts`,
  `member-registration.controller.ts` (7 routes sous `/api/member-registrations`),
  `dto/decide-member-registration.dto.ts`, module « Validation des enregistrements » au
  `permission-catalog.ts`, migration `1783000100000-AddMemberRegistrationPermissions`.
  `MemberController.store` délègue à `submit()` : **`POST /members` reste l'unique porte d'entrée**
  et répond `{ mode: 'dossier_depose' | 'membre_cree' }`. `MemberService.store()` accepte un
  `options { manager?, scopeAlreadyChecked? }`. Cycle `MemberModule` ↔ `MemberRegistrationModule`
  assumé en `forwardRef` : c'est le prix de garder une seule URL de création.
- **🚨 Découverte majeure — la base de dev est désynchronisée du code, et deux commandes
  « normales » propageraient le travail en cours des autres :**
  1. **`npm run migration:run` : 14 migrations pendantes** avant la mienne (`AddRoleStatus`,
     `BackfillUserRoles`, `SeedPermissionCatalog`, `CleanupPermissionCatalog`,
     `SyncPermissionCatalogV2`, réglages SMS…). Mes deux migrations ont donc été jouées **seules**,
     via un DataSource dont le glob `migrations` ne pointe que mes fichiers — TypeORM écrit
     lui-même la ligne de suivi dans `typeorm_migrations`, rien n'est inséré à la main.
  2. **`npm run seed:permissions` : son `--dry-run` annonce +146 permissions, −11 slugs,
     +29/−9 modules, +450 liens.** C'est toute la refonte du 2026-08-01, jamais appliquée ici.
     D'où une **migration additive** pour mes 3 seules permissions.
  ⇒ Le schéma courant a été construit **en partie par des seeds**, pas seulement par les
  migrations : `typeorm_migrations` ne raconte pas l'état réel. **À re-synchroniser en équipe** ;
  d'ici là, ne lancer ni `migration:run` ni `seed:permissions` sur cette base.
- **Décision — `roles_permissions` : un lien par rôle, y compris décoché.** Les 3 permissions
  reçoivent 9 liens (ADMINISTRATEUR et RESPONSABLE à `status = 1`, MEMBRE à `0`). Sans ligne, la
  case de Paramètres → Rôles est **incochable** (« Aucun élément trouvé ») : c'est exactement la
  dette laissée par `AddMemberTransferPermissions`, on ne la rejoue pas.
- **Décision — écart assumé sur R9.** Le cadrage voulait un **409** si le membre validé n'aurait pas
  de compte. Vérification faite, `CreateMemberDto.phone` est **optionnel** côté API (seul le
  formulaire web l'impose) et le produit tolère déjà des membres sans compte (bloc
  `accounts_skipped` de l'écran d'import). Refuser aurait donc ajouté un refus **nouveau** sur un cas
  accepté ailleurs. Retenu : le membre est créé, l'absence de compte est **signalée** et jamais tue
  (`account_skipped` dans la réponse + `WARN [VALIDATION]`). Le cas « téléphone déjà pris » reste
  un 409.
- **Décision — `member_registrations.structure_uuid` est NULLABLE.** Un `is_admin` peut aujourd'hui
  créer un membre sans structure (`assertStructureInScope` ne l'exige que des non-admins) ; mettre
  la colonne en NOT NULL aurait transformé ce cas en erreur 500. Migration annulée puis rejouée
  (table vide, `down()` exercé au passage).
- **Vérifié :** `nest build` OK · `tsc --noEmit` **0 erreur** · `check:permissions` ✅ (47
  contrôleurs) · **46 tests verts** (`member-registration` + `member-transfer`, aucune régression) ·
  **démarrage réel** : les 7 routes sont mappées (donc le cycle `forwardRef` se résout) et répondent
  **401** sans jeton. Base après migrations : 7 939 membres intacts, `UQ_members_matricule` posé,
  `member_registrations` à 29 colonnes en `utf8mb4_unicode_ci`.
- **TODO :** étape 3 (web) · étape 4 (élargir `verify/phone-number` aux dossiers en attente, revue
  des appelants de `store()`) · étape 5 (doc + `graphify update .`). **Recette fonctionnelle non
  faite** : aucun dossier n'a encore été déposé ni signé contre l'API réelle (protocole instantané /
  restauration à appliquer). ⚠️ `docs/` est **git-ignoré** dans les deux repos (`.gitignore:62` api,
  `:47` web) : `VALIDATION-MEMBRES.md` a besoin d'un `git add -f` pour exister pour l'équipe.
- **⚠️ Dette d'environnement, hors périmètre :** `npm run build` échoue sur **`@nestjs/schedule`**,
  déclaré dans `package.json` (^6.1.3) mais **absent de `node_modules`** ; il est importé par
  `app.module.ts` et `payments/hub-payment-sync.cron.ts`. Un `npm install` suffit — sans rapport
  avec cette fonctionnalité.

---

## 2026-07-28 — Référentiel de permissions rechargé depuis `permissions-soka-digital.md` — module `permission`
**Contexte :** le document fonctionnel `permissions/permissions-soka-digital.md` (racine du dépôt)
liste les permissions attendues module par module. Demande : vider `modules` / `permissions` /
`roles_permissions`, puis tout recréer depuis ce document, avec **toutes les permissions accordées
aux rôles ADMINISTRATEUR et RESPONSABLE**.
- **Fait :**
  - `src/permission/permission-catalog.ts` — transcription du document : **28 modules, 257
    permissions** (libellés repris tels quels) + **85 alias techniques**, soit **342 slugs**.
  - `src/permission/permission-code-usage.ts` — relève par lecture des sources les slugs réellement
    exigés : **143 côté API** (`@RequirePermissions`, y compris passés par constante) et **99 côté
    web** (`<Protected>`, `hasPermission`, `config/menus.ts`).
  - `src/seeds/seed-reset-permissions.ts` — purge des 3 tables (ordre enfant → parent) avec
    sauvegarde JSON dans `backups/`. Exporte `resetPermissionTables(manager)`, réutilisée par le
    seed de rechargement pour que purge et insertion soient **atomiques**.
  - `src/seeds/seed-permissions.ts` — purge + modules + permissions + **un lien
    `roles_permissions` par rôle × permission** (1 368 lignes pour 4 rôles), `status = 1` pour
    ADMINISTRATEUR et RESPONSABLE, `0` pour les autres. Se termine par un contrôle de couverture.
  - `package.json` — `seed:reset-permissions`, `seed:permissions` (options `--dry-run`, `--no-backup`).
- **Décision — reprendre les slugs existants plutôt que d'en dériver de nouveaux.** Un slug absent
  de `permissions` est refusé à tout le monde sauf `is_admin`, et un menu du front dont le slug
  n'existe pas disparaît. Chaque puce du document réutilise donc le slug déjà exigé par le code
  quand elle décrit le même droit : **142 des 143 slugs API sont couverts**. Seule exception,
  `migration_executer`, qui n'existait déjà pas en base (route réservée à `is_admin`).
- **Décision — les alias.** Un droit exigé par le code sans entrée propre dans le document devient
  un `alias` de la puce la plus proche, dans le même module : 20 côté API (écritures des accessoires
  et responsabilités d'un membre, `DELETE` de campagne rattaché à « Archiver »…) et 65 côté web
  (`civilites_ajouter_civilites`, `structures_modifier_structures`…). Ces 65-là étaient **absents de
  la base** : les boutons correspondants sont déjà masqués aujourd'hui pour les non-admins. Sans
  eux, accorder « tout » à RESPONSABLE n'aurait rien changé à l'écran.
- **Décision — `DELETE` et non `TRUNCATE`** : `TRUNCATE` provoque un commit implicite en MySQL et
  ferait sauter la transaction. Aucune FK réelle n'existe sur ces 3 tables (vérifié sur `soka_db`),
  l'ordre enfant → parent suffit.
- **Vérifié :** `tsc --noEmit` ✅ · `seed:permissions --dry-run` ✅ (28 modules, 342 permissions,
  1 368 liens) · base **inchangée** après le dry-run, contrôlée en SQL.
  ⚠️ `npm run lint` échoue sur **tout** le repo (`parserOptions.tsconfigRootDir` reçoit `/C:/…`),
  anomalie de configuration préexistante.
- **TODO :** jouer les seeds (non exécutés) ; **reconnexion obligatoire** pour que les droits
  prennent effet ; aligner un jour les 65 slugs « boutons » du web sur ceux de l'API et retirer ces
  alias ; `permission-manifest.ts` n'est plus la source de vérité (conservé pour la migration
  historique `1782800300000-SeedPermissionCatalog`, à ne pas rejouer).

## 2026-07-25 (2) — Permission `membres_gerer_membres_comite` : restreindre l'affectation à un comité — modules `comités` + `membres`
**Contexte :** l'onglet « Comité » de la fiche membre permet au responsable d'un comité spécialisé
d'y affecter des membres (`POST /comite/:uuid/members`, `DELETE /comite/:uuid/members/:memberUuid`).
Ces routes n'étaient gardées que par `CommitteeService.canManage()` — **responsable du comité ou
`is_admin`** — donc **aucun moyen de restreindre la fonctionnalité depuis Paramètres → Rôles** :
désigner quelqu'un responsable d'un comité lui donnait mécaniquement le droit d'y affecter qui il
voulait. Demande : rendre ce droit débrayable comme les autres.
- **Fait :**
  - Migration `src/migrations/1782700000000-AddCommitteeMemberManagementPermission.ts` — crée le
    slug **`membres_gerer_membres_comite`** (« Gérer les membres de son comité »), rattaché au
    module **Membres** (`module_uuid` résolu depuis `membres_ajouter_un_membre`, pas codé en dur).
  - `src/committees/committee.controller.ts` — `@UseGuards(JwtAuthGuard, PermissionsGuard)` au
    niveau de la classe + `@RequirePermissions('membres_gerer_membres_comite')` sur `addMember` et
    `removeMember` uniquement. `canManage()` est **conservé** : il faut désormais la permission
    **ET** être responsable du comité (ou `is_admin`).
- **Décision — une seule permission pour ajouter ET retirer.** Deux slugs séparés auraient permis
  « ajouter sans pouvoir retirer », un état incohérent : celui qui compose son équipe doit pouvoir
  corriger une erreur d'affectation. Arbitré explicitement le 2026-07-25.
- **Décision — l'onglet « Comité » reste visible pour tous.** Il affiche les comités du membre
  consulté (information de lecture, déjà accessible ailleurs) ; seule l'**action** est gardée.
- **Décision — la migration rattache la permission aux TROIS rôles**, pas seulement à celui qu'on
  veut autoriser : `RESPONSABLE` **1**, `ADMINISTRATEUR` **1**, `MEMBRE` **0**. Deux raisons :
  1. **Sans ligne `roles_permissions`, la case est incochable.** `findGlobalPermissions` renvoie
     `role_permission_uuid: null` et `togglePermission` répond « Aucun élément trouvé » — c'est
     exactement le trou que comble `seed:sync-role-permissions`. Les permissions du transfert
     (2026-07-22) n'ont d'ailleurs de ligne que pour `RESPONSABLE` : elles sont **incochables pour
     `ADMINISTRATEUR` et `MEMBRE`** dans l'écran des rôles (dette existante, non traitée ici).
  2. **Statut 1 sur `RESPONSABLE` = aucune régression au déploiement.** La fonctionnalité continue
     de marcher comme avant la migration ; restreindre devient une action volontaire (décocher).
  Le rejeu de la migration **n'éteint jamais** un lien existant (un statut a pu être changé
  volontairement depuis l'écran des rôles) — il n'active que ce qui doit l'être.
- **⚠️ Piège à connaître — les permissions sont gelées dans le JWT au login** (`auth.service.ts`,
  `payload.permissions`), en plus du localStorage front. Après `migration:run`, **les sessions déjà
  ouvertes n'ont pas le nouveau slug** : un responsable connecté verra `403` jusqu'à sa
  reconnexion. Même famille que le gotcha « permissions chargées au login uniquement ».
- **Exécutée sur `soka_db` le 2026-07-25** (`npm run migration:run`, sur confirmation explicite).
  Vérifié en base : `membres_gerer_membres_comite` présent dans le module **Membres**, liens
  `roles_permissions` = ADMINISTRATEUR **1**, RESPONSABLE **1**, MEMBRE **0**.
- **⚠️ Effet de bord — `migration:run` a joué DEUX AUTRES migrations en attente**, hors du module
  membres/comités (elles étaient déjà dans le repo, non appliquées sur cette base) :
  `CreateAppSettings1782500000000` (crée la table `app_settings` + 4 réglages SMS) et
  `SeedSmsParametrePermissions1782500100000` (crée le module « Paramètres » et les permissions
  `parametres_voir_sms` / `parametres_gerer_sms`, accordées à ADMINISTRATEUR). Bilan global :
  `permissions` 47 → 50, `roles_permissions` 133 → 138. **À signaler à l'équipe** — `soka_db` est
  partagée et ces deux migrations relèvent du module SMS/paramètres de quelqu'un d'autre.
  À retenir : sur cette base, `migration:run` n'est jamais une opération « ma migration seule »,
  vérifier `typeorm_migrations` vs `src/migrations/` **avant** de lancer.
  ⚠️ Au passage, `1782500100000` est porté par **deux** migrations distinctes
  (`AddMemberTransferPermissions` et `SeedSmsParametrePermissions`) — collision de timestamp, sans
  conséquence ici mais l'ordre relatif entre les deux n'est pas garanti.
- **TODO :** recette navigateur à faire avec **reconnexion** : un responsable de comité peut
  ajouter/retirer ; case décochée dans Paramètres → Rôles + reconnexion ⇒ bloc « Ajouter à mon
  comité » et corbeille disparus, et `403` si l'appel est rejoué à la main.

---

## 2026-07-25 — Seed correctif : numéros de téléphone saisis avec la lettre « O » — module `membres`
**Contexte :** le front impose désormais **10 chiffres** sur les champs téléphone (connexion et
« mot de passe oublié », cf. `web/docs/JOURNAL.md` du 2026-07-25). Un audit de `soka_db` a montré
que **4 comptes** ont un numéro contenant la **lettre `O`** au lieu du chiffre `0` — ils étaient
déjà impossibles à connecter (le login se fait sur `users.phone_number`), et la lettre est
maintenant impossible à saisir. Sur 7668 comptes, 7663 ont bien 10 chiffres ; le 5ᵉ écart est un
compte de test à 8 chiffres (id 11054), laissé tel quel.
- **Fait :** `src/seeds/seed-fix-phone-letter-o.ts` + script `npm run seed:fix-phone-letter-o`.
  Corrige `users.phone_number` (identifiant de login) **et** `members.phone` (fiche membre) —
  4 lignes de chaque côté, les **mêmes 4 personnes** : BI PO CHARLES TRA, LIASU SOULEYMANE,
  GAYE BORIS PACOME GAHIE, AMENAN SIMONE KOUADIO.
- **Décision — les deux colonnes, pas seulement `users`.** Ne corriger que le login aurait fait
  diverger l'identifiant de connexion et le téléphone affiché sur la fiche membre.
- **Décision — `members.phone_whatsapp` volontairement exclu.** Cette colonne est de la saisie
  libre : on y trouve « NEANT », « V », un nom de famille (« KOUAME »), des espaces internes, un
  point en préfixe, « 0565730664ASS »… Un `REPLACE` automatique n'y a aucun sens ; il faut un
  arbitrage humain. Le seed **signale** ces valeurs sans y toucher.
- **Décision — SQL paramétré direct plutôt que le repository.** `UserEntity` porte un
  `@BeforeUpdate()` qui re-hash le mot de passe ; passer par `repo.save()` ferait transiter des
  champs qu'on ne veut pas réécrire. L'`UPDATE` ne touche que la colonne visée.
- **Garde-fous :** ne corrige que les valeurs `^[0-9Oo]{10}$` (donc résultat forcément à
  10 chiffres) ; ignore les lignes soft-deleted ; **refuse** une correction qui collisionnerait
  avec un numéro déjà pris ; **dry-run par défaut**, écriture seulement avec `-- --apply` ;
  écritures en transaction. Idempotent.
- **Simulation jouée** (`npm run seed:fix-phone-letter-o`, sans `--apply`) : **8 corrections**
  identifiées, **0 ignorée**, **0 collision**. Vérifié au préalable en SQL que les 4 numéros
  corrigés ne sont utilisés par personne.
- **TODO :** exécution réelle (`-- --apply`) **non faite** — écriture sur `soka_db`, à confirmer.
  Et arbitrage sur `members.phone_whatsapp` (~15 valeurs libres).

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

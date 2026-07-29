/**
 * MANIFESTE DES PERMISSIONS - source de vérité unique de l'application.
 *
 * Chaque domaine fonctionnel (= un contrôleur ou un groupe de contrôleurs) déclare ici les
 * actions qu'il expose. Le seed (`migrations/*-SeedPermissionCatalog`) en dérive les lignes de
 * `permissions` et les liens `roles_permissions`, et les contrôleurs s'y réfèrent via
 * `@RequirePermissions(PERM.<domaine>.<action>)`.
 *
 * **Convention de slug** : `<prefixe>_<action>` avec action ∈ {voir, creer, modifier, supprimer}.
 * Les slugs supplémentaires (`extra`) couvrent les actions métier qui ne rentrent pas dans le CRUD.
 *
 * ⚠️ **Ne JAMAIS renommer un slug existant.** Ils sont référencés côté web (`config/menus.ts`,
 * `<Protected permission="...">`) et stockés en base. Les slugs hérités, de forme libre
 * (`membres_voir_menu_liste_membres`…), sont conservés tels quels dans `legacy` : le seed les
 * respecte et ne crée que ce qui manque.
 *
 * ⚠️ Ajouter une permission ici ne suffit pas à l'appliquer : il faut aussi poser le décorateur
 * `@RequirePermissions` sur la route correspondante.
 */

export type PermissionAction = 'voir' | 'creer' | 'modifier' | 'supprimer';

export interface PermissionDef {
  slug: string;
  name: string;
  description: string;
}

export interface DomainDef {
  /** Clé de référence dans le code (`PERM.membres.voir`). */
  key: string;
  /** Module d'appartenance - regroupement affiché dans l'écran des rôles. */
  module: string;
  /** Libellé lisible du domaine. */
  label: string;
  /** Préfixe de slug pour les actions CRUD. */
  prefix: string;
  /** Actions CRUD exposées par le domaine. */
  actions: PermissionAction[];
  /** Slugs hérités à conserver tels quels (jamais renommés). */
  legacy?: PermissionDef[];
  /** Actions métier hors CRUD. */
  extra?: PermissionDef[];
}

const LIBELLE_ACTION: Record<PermissionAction, string> = {
  voir: 'Consulter',
  creer: 'Créer',
  modifier: 'Modifier',
  supprimer: 'Supprimer',
};

const CRUD: PermissionAction[] = ['voir', 'creer', 'modifier', 'supprimer'];

/** Modules fonctionnels. Le nom doit correspondre à `modules.name` (créé si absent). */
export const MODULES = {
  MEMBRES: 'Membres',
  STRUCTURE: 'Structure',
  REFERENTIELS: 'Référentiels',
  ACTIVITES: 'Activités',
  JOURNAL: 'Journal',
  FINANCES: 'Finances',
  ADMINISTRATION: 'Administration',
  IMPORTATIONS: 'Importations',
  STATISTIQUES: 'Statistiques',
  PARAMETRES: 'Paramètres',
} as const;

export const DOMAINS: DomainDef[] = [
  // ---------------------------------------------------------------- Membres
  {
    key: 'membres',
    module: MODULES.MEMBRES,
    label: 'Membres',
    prefix: 'membres',
    actions: CRUD,
    legacy: [
      { slug: 'membres_voir_menu_liste_membres', name: 'Voir le menu Liste des membres', description: 'Accès à la liste des membres.' },
      { slug: 'membres_acceder_alonglet_membre', name: 'Ouvrir la fiche d’un membre', description: 'Accès au détail d’un membre.' },
      { slug: 'membres_ajouter_un_membre', name: 'Ajouter un membre', description: 'Création d’un membre.' },
      { slug: 'membres_modifier_un_membre', name: 'Modifier un membre', description: 'Modification d’un membre.' },
      { slug: 'membres_supprimer_un_membre', name: 'Supprimer un membre', description: 'Suppression d’un membre.' },
    ],
  },
  {
    key: 'memberAccessoires',
    module: MODULES.MEMBRES,
    label: 'Accessoires d’un membre',
    prefix: 'membres_accessoires',
    actions: CRUD,
  },
  {
    key: 'memberVoyages',
    module: MODULES.MEMBRES,
    label: 'Voyages d’un membre',
    prefix: 'membres_voyages',
    actions: ['voir', 'creer', 'supprimer'],
  },
  {
    key: 'memberResponsabilites',
    module: MODULES.MEMBRES,
    label: 'Responsabilités d’un membre',
    prefix: 'membres_responsabilites',
    actions: ['voir', 'creer', 'supprimer'],
  },
  {
    key: 'transferts',
    module: MODULES.MEMBRES,
    label: 'Transferts de membres',
    prefix: 'membres_transferts',
    // ⚠️ Pas d'action `voir` ici : `membres_voir_menu_transferts` (ci-dessous) joue déjà ce rôle
    // et est le slug exigé par `member-transfer.controller.ts`. Une première version créait
    // `membres_transferts_voir` en doublon - deux slugs pour un même droit, dont un seul était
    // accordé : la fonctionnalité devenait invisible ou inaccessible selon le rôle.
    actions: [],
    legacy: [
      { slug: 'membres_voir_menu_transferts', name: 'Voir le menu Transferts', description: 'Accès à l’écran des transferts.' },
      { slug: 'membres_initier_transfert', name: 'Initier un transfert', description: 'Créer et annuler une demande de transfert.' },
      { slug: 'membres_approuver_transfert', name: 'Approuver un transfert', description: 'Approuver ou refuser une demande de transfert.' },
    ],
  },

  // -------------------------------------------------------------- Structure
  {
    key: 'structures',
    module: MODULES.STRUCTURE,
    label: 'Structures',
    prefix: 'structures',
    actions: CRUD,
  },
  {
    key: 'niveaux',
    module: MODULES.STRUCTURE,
    label: 'Niveaux hiérarchiques',
    prefix: 'niveaux',
    actions: CRUD,
    legacy: [
      { slug: 'parametres_voir_menu_niveaux', name: 'Voir le menu Niveaux', description: 'Accès au référentiel des niveaux.' },
    ],
  },
  {
    key: 'responsabilites',
    module: MODULES.STRUCTURE,
    label: 'Responsabilités',
    prefix: 'responsabilites',
    actions: CRUD,
  },
  {
    key: 'comites',
    module: MODULES.STRUCTURE,
    label: 'Comités',
    prefix: 'comites',
    actions: CRUD,
    legacy: [
      { slug: 'parametres_voir_menu_comites', name: 'Voir le menu Comités', description: 'Accès à l’écran des comités.' },
      { slug: 'membres_gerer_membres_comite', name: 'Gérer les membres d’un comité', description: 'Ajouter ou retirer un membre d’un comité.' },
    ],
    extra: [
      { slug: 'comites_designer_responsable', name: 'Désigner le responsable d’un comité', description: 'Nommer ou retirer le responsable d’un comité.' },
    ],
  },

  // ------------------------------------------------------------ Référentiels
  { key: 'accessoires', module: MODULES.REFERENTIELS, label: 'Accessoires', prefix: 'accessoires', actions: CRUD },
  { key: 'villes', module: MODULES.REFERENTIELS, label: 'Villes', prefix: 'villes', actions: CRUD },
  { key: 'civilites', module: MODULES.REFERENTIELS, label: 'Civilités', prefix: 'civilites', actions: CRUD },
  { key: 'pays', module: MODULES.REFERENTIELS, label: 'Pays', prefix: 'pays', actions: CRUD },
  { key: 'departements', module: MODULES.REFERENTIELS, label: 'Départements', prefix: 'departements', actions: CRUD },
  { key: 'divisions', module: MODULES.REFERENTIELS, label: 'Divisions', prefix: 'divisions', actions: CRUD },
  { key: 'formations', module: MODULES.REFERENTIELS, label: 'Formations', prefix: 'formations', actions: CRUD },
  { key: 'metiers', module: MODULES.REFERENTIELS, label: 'Métiers', prefix: 'metiers', actions: CRUD },
  { key: 'situationsMatrimoniales', module: MODULES.REFERENTIELS, label: 'Situations matrimoniales', prefix: 'situations_matrimoniales', actions: CRUD },
  { key: 'villesOrganisation', module: MODULES.REFERENTIELS, label: 'Villes de l’organisation', prefix: 'villes_organisation', actions: CRUD },
  { key: 'typesActivite', module: MODULES.REFERENTIELS, label: 'Types d’activité', prefix: 'types_activite', actions: CRUD },

  // --------------------------------------------------------------- Activités
  {
    key: 'activites',
    module: MODULES.ACTIVITES,
    label: 'Activités',
    prefix: 'activites',
    actions: CRUD,
    extra: [
      { slug: 'activites_gerer_participants', name: 'Gérer les participants', description: 'Inscrire ou retirer des participants à une activité.' },
      { slug: 'activites_gerer_presences', name: 'Gérer les présences', description: 'Pointer les présences d’une activité.' },
      { slug: 'activites_gerer_comites', name: 'Gérer les comités d’activité', description: 'Composer les comités d’organisation d’une activité.' },
      { slug: 'activites_gerer_quotas', name: 'Gérer les quotas', description: 'Définir les quotas de participation.' },
    ],
  },

  // ----------------------------------------------------------------- Journal
  {
    key: 'journalEditions',
    module: MODULES.JOURNAL,
    label: 'Éditions du journal',
    prefix: 'journal_editions',
    actions: CRUD,
  },
  { key: 'journalZones', module: MODULES.JOURNAL, label: 'Zones de diffusion', prefix: 'journal_zones', actions: CRUD },
  { key: 'journalDestinations', module: MODULES.JOURNAL, label: 'Destinations', prefix: 'journal_destinations', actions: CRUD },
  {
    key: 'journalDistribution',
    module: MODULES.JOURNAL,
    label: 'Distribution',
    prefix: 'journal_distribution',
    actions: ['voir', 'modifier'],
    extra: [
      { slug: 'journal_distribution_lancer', name: 'Lancer une distribution', description: 'Déclencher la distribution d’une édition.' },
    ],
  },
  {
    key: 'journalReception',
    module: MODULES.JOURNAL,
    label: 'Réceptions',
    prefix: 'journal_reception',
    actions: ['voir', 'modifier'],
  },

  // ---------------------------------------------------------------- Finances
  { key: 'dons', module: MODULES.FINANCES, label: 'Dons', prefix: 'dons', actions: CRUD },
  { key: 'donsPaiements', module: MODULES.FINANCES, label: 'Paiements de dons', prefix: 'dons_paiements', actions: CRUD },
  { key: 'abonnements', module: MODULES.FINANCES, label: 'Abonnements', prefix: 'abonnements', actions: CRUD },
  { key: 'abonnementsPaiements', module: MODULES.FINANCES, label: 'Paiements d’abonnements', prefix: 'abonnements_paiements', actions: ['voir', 'creer', 'modifier'] },
  { key: 'paiements', module: MODULES.FINANCES, label: 'Paiements', prefix: 'paiements', actions: ['voir', 'creer', 'modifier'] },

  // ---------------------------------------------------------- Administration
  {
    key: 'utilisateurs',
    module: MODULES.ADMINISTRATION,
    label: 'Comptes utilisateurs',
    prefix: 'utilisateurs',
    actions: CRUD,
    legacy: [
      { slug: 'collaborateurs_assigner_un_role_a_un_collaborateur', name: 'Assigner un rôle', description: 'Attribuer un rôle à un collaborateur.' },
    ],
  },
  {
    key: 'roles',
    module: MODULES.ADMINISTRATION,
    label: 'Rôles',
    prefix: 'roles',
    actions: [],
    legacy: [
      { slug: 'roles_voir_le_module_role', name: 'Voir le module Rôles', description: 'Accès au module des rôles.' },
      { slug: 'roles_ajouter_un_role', name: 'Ajouter un rôle', description: 'Création d’un rôle.' },
      { slug: 'roles_modifier_un_role', name: 'Modifier un rôle', description: 'Renommage d’un rôle.' },
      { slug: 'roles_activer_ou_desactiver_un_role', name: 'Activer / désactiver un rôle', description: 'Changer le statut d’un rôle et cocher ses permissions.' },
      { slug: 'parametres_voir_menu_roles', name: 'Voir le menu Rôles', description: 'Accès à l’écran des rôles.' },
    ],
  },
  { key: 'permissions', module: MODULES.ADMINISTRATION, label: 'Permissions', prefix: 'permissions', actions: CRUD },
  { key: 'modulesPerm', module: MODULES.ADMINISTRATION, label: 'Modules de permissions', prefix: 'modules_permissions', actions: CRUD },
  { key: 'userRoles', module: MODULES.ADMINISTRATION, label: 'Rôles des utilisateurs', prefix: 'utilisateurs_roles', actions: ['voir', 'creer', 'modifier', 'supprimer'] },

  // ------------------------------------------------------------ Importations
  {
    key: 'importations',
    module: MODULES.IMPORTATIONS,
    label: 'Importations',
    prefix: 'importations',
    actions: ['voir'],
    extra: [
      { slug: 'importations_analyser', name: 'Analyser un fichier', description: 'Lancer une analyse d’import sans écriture.' },
      { slug: 'importations_confirmer', name: 'Confirmer un import', description: 'Écrire réellement les données importées.' },
    ],
  },

  // ------------------------------------------------------------ Statistiques
  {
    key: 'statistiques',
    module: MODULES.STATISTIQUES,
    label: 'Statistiques',
    prefix: 'statistiques',
    actions: ['voir'],
    legacy: [
      { slug: 'dashboard_voir_menu_dashboard', name: 'Voir le tableau de bord', description: 'Accès au tableau de bord.' },
      { slug: 'exports_voir_menu_exports', name: 'Exporter les données', description: 'Lancer et télécharger les exports.' },
    ],
  },

  // -------------------------------------------------------------- Paramètres
  {
    key: 'parametresSms',
    module: MODULES.PARAMETRES,
    label: 'Paramètres SMS',
    prefix: 'parametres_sms',
    actions: [],
    // ⚠️ Ce sont les slugs RÉELLEMENT utilisés par `sms-settings.controller.ts`. Une première
    // version du manifeste en avait inventé quatre (`parametres_sms_consulter/_modifier/
    // _basculer/_tester`) qui n'existaient nulle part dans le code : le seed les avait créés,
    // ils n'étaient exigés par aucune route. Toujours relever les slugs SUR le contrôleur.
    legacy: [
      { slug: 'parametres_voir_menu_sms', name: 'Voir le menu SMS', description: 'Accès aux paramètres SMS.' },
      { slug: 'parametres_voir_sms', name: 'Consulter les fournisseurs SMS', description: 'Voir la configuration des fournisseurs SMS.' },
      { slug: 'parametres_gerer_sms', name: 'Gérer les fournisseurs SMS', description: 'Modifier la configuration, basculer de fournisseur, envoyer un SMS de test.' },
    ],
  },
];

/** Toutes les permissions du manifeste, à plat, dédoublonnées par slug. */
export function listAllPermissions(): Array<PermissionDef & { module: string }> {
  const parSlug = new Map<string, PermissionDef & { module: string }>();

  const ajouter = (def: PermissionDef, module: string) => {
    if (!parSlug.has(def.slug)) parSlug.set(def.slug, { ...def, module });
  };

  for (const domain of DOMAINS) {
    for (const action of domain.actions) {
      ajouter(
        {
          slug: `${domain.prefix}_${action}`,
          name: `${LIBELLE_ACTION[action]} - ${domain.label}`,
          description: `${LIBELLE_ACTION[action]} les éléments du domaine « ${domain.label} ».`,
        },
        domain.module,
      );
    }
    for (const def of domain.extra ?? []) ajouter(def, domain.module);
    for (const def of domain.legacy ?? []) ajouter(def, domain.module);
  }

  return [...parSlug.values()];
}

/**
 * Raccourci typé pour les contrôleurs : `PERM.membres.voir`, `PERM.comites.supprimer`…
 * Construit à partir du manifeste, donc impossible à désynchroniser du seed.
 */
export const PERM: Record<string, Record<string, string>> = Object.fromEntries(
  DOMAINS.map((domain) => [
    domain.key,
    {
      ...Object.fromEntries(
        domain.actions.map((action) => [action, `${domain.prefix}_${action}`]),
      ),
      ...Object.fromEntries(
        (domain.extra ?? []).map((def) => [
          def.slug.replace(`${domain.prefix}_`, ''),
          def.slug,
        ]),
      ),
      ...Object.fromEntries(
        (domain.legacy ?? []).map((def) => [def.slug, def.slug]),
      ),
    },
  ]),
);

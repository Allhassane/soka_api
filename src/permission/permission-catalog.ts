/**
 * CATALOGUE DES PERMISSIONS - source de vérité du référentiel (refonte du 2026-08-01).
 *
 * Un module = un écran/domaine de l'application, une permission = UNE capacité réelle :
 * une entrée de menu, une action (bouton), un onglet, ou une information sensible.
 * Chaque slug est UNIQUE et identique côté API (`@RequirePermissions('<slug>')`) et côté
 * web (`<Protected permission="…">`, `hasPermission('…')`, `config/menus.ts`).
 *
 * Ce qui a changé à la refonte (audit `AUDIT-PERMISSIONS-2026-08-01.md`) :
 *  - Les ~85 « alias techniques » (2 slugs pour 1 action : `formations_creer` côté API,
 *    `formations_ajouter_formations` côté web) sont SUPPRIMÉS : le web teste désormais le
 *    slug canonique. Le champ `absorbs` liste les anciens slugs : le seed fusionne (OU)
 *    leurs droits accordés dans la permission canonique avant de les supprimer.
 *  - Les permissions fantômes (cases qui n'ouvraient et ne fermaient rien : filtres purement
 *    clients, écrans jamais livrés, doublons) sont retirées du catalogue - le seed les
 *    supprime de la base.
 *  - Les LECTURES de référentiels (civilités, pays, formations, métiers, niveaux, types
 *    d'activité, cascade des structures…) ne sont PLUS des permissions : elles sont ouvertes
 *    à tout utilisateur authentifié via `@ReferentialRead()`. Motif : ces listes alimentent
 *    les formulaires des autres modules ; les garder sous permission fermait « Créer un
 *    membre » à qui ne portait pas 13 droits de lecture épars (audit H1/H8/H9). Les
 *    ÉCRITURES de référentiels restent sous permission.
 *  - Les capacités qui n'avaient pas de nom (participants / présence / quotas / comités
 *    d'une activité, statistiques financières d'une campagne, attribution des permissions
 *    d'un rôle…) ont désormais leur permission propre, posée sur les routes concernées.
 *
 * Sémantique des champs de seed (lus par `permission-catalog-sync.ts`) :
 *  - `absorbs`  : slugs SUPPRIMÉS de la base dont les droits accordés sont fusionnés (OU)
 *                 dans cette permission. À la fusion, un rôle qui avait l'ancien slug coché
 *                 garde la capacité - personne ne perd rien.
 *  - `seedFrom` : slugs VIVANTS dont l'état actuel sert de valeur initiale (OU) quand la
 *                 permission n'existe pas encore en base pour un rôle. Sert aux nouvelles
 *                 permissions issues d'un découpage (ex. les nouvelles puces Activités
 *                 héritent de l'état de `activites_creer`).
 *  - `defaults` : état initial explicite par rôle quand la permission est nouvelle et
 *                 qu'aucun `seedFrom` ne s'applique. ADMINISTRATEUR reçoit TOUJOURS tout.
 *
 * ⚠️ Ne JAMAIS renommer un slug conservé : il est stocké en base et référencé des deux
 * côtés. Les libellés (`name`), eux, sont libres - le seed les met à jour.
 * ⚠️ Une permission NOUVELLE naît décochée pour les rôles non couverts par
 * `seedFrom`/`defaults` : penser à l'ouvrir depuis Paramètres → Rôles.
 */

export interface CatalogPermission {
  /** Libellé affiché dans Paramètres → Rôles. */
  name: string;
  /** Identifiant technique stable, commun API + web. */
  slug: string;
  /** Sous-section d'affichage (onglet, groupe de la fiche…). */
  group?: string;
  /** Slugs supprimés de la base, droits fusionnés (OU) dans cette permission. */
  absorbs?: string[];
  /** Slugs vivants dont l'état initialise cette permission quand elle est nouvelle. */
  seedFrom?: string[];
  /** État initial par rôle (slug de rôle → coché) pour une permission nouvelle. */
  defaults?: Record<string, boolean>;
  /**
   * Rôles pour lesquels la permission est FORCÉE à cochée à chaque synchronisation
   * (élargissement seulement - jamais l'inverse). À réserver aux cas où l'interface
   * offre le geste à un rôle qui n'a jamais reçu le droit correspondant.
   */
  grantTo?: string[];
}

export interface CatalogModule {
  name: string;
  description: string;
  permissions: CatalogPermission[];
}

export const PERMISSION_CATALOG: CatalogModule[] = [
  {
    name: 'Tableau de bord',
    description: 'Écran d’accueil : actions prioritaires, comité de la structure et statistiques.',
    permissions: [
      {
        name: 'Accéder au tableau de bord',
        slug: 'dashboard_voir_menu_dashboard',
        absorbs: ['statistiques_voir'],
      },
      { name: 'Consulter les actions prioritaires', slug: 'dashboard_consulter_actions_prioritaires' },
      { name: 'Consulter le comité de sa structure', slug: 'dashboard_consulter_comite_structure' },
      { name: 'Filtrer les statistiques par périmètre', slug: 'dashboard_filtrer_statistiques_perimetre' },
      {
        name: 'Consulter les statistiques des départements',
        slug: 'dashboard_consulter_statistiques_departements',
      },
      {
        name: 'Consulter les statistiques de la jeunesse',
        slug: 'dashboard_consulter_statistiques_jeunesse',
      },
      {
        name: 'Exporter les données globales du tableau de bord',
        slug: 'dashboard_exporter_donnees_globales_tableau_bord',
      },
      { name: 'Exporter les données d\'une statistique', slug: 'dashboard_exporter_donnees_statistique' },
    ],
  },
  {
    name: 'Membres',
    description: 'Liste des membres et fiche membre (profil, structure, voyages, comités, historique).',
    permissions: [
      { name: 'Accéder au menu Membres', slug: 'membres_voir_menu_membres' },
      {
        name: 'Consulter la liste des membres',
        slug: 'membres_voir_menu_liste_membres',
        absorbs: ['membres_rechercher_membre', 'membres_filtrer_membres', 'structures_consulter_membres_structure'],
      },
      {
        name: 'Consulter la fiche complète d\'un membre',
        slug: 'membres_acceder_alonglet_membre',
        absorbs: [
          // La fiche est servie d'un bloc par l'API : ces 8 « lectures fines » ne masquaient
          // rien (audit H12) - on assume une fiche entière sous UN droit au libellé honnête.
          'membres_consulter_etat_civil_situation_familiale_membre',
          'membres_consulter_coordonnees_membre_mobile_e_mail',
          'membres_consulter_profession_membre_formation_metier_exerce',
          'membres_consulter_reperes_membre_anciennete_nombre_enfants',
          'membres_consulter_objets_pratique_membre',
          'membres_consulter_rattachement_pratique_membre',
          'membres_responsabilites_voir',
          'membres_accessoires_voir',
          'membres_exporter_fiche_membre_pdf',
        ],
      },
      { name: 'Créer un membre', slug: 'membres_ajouter_un_membre' },
      { name: 'Modifier un membre', slug: 'membres_modifier_un_membre' },
      { name: 'Supprimer un membre', slug: 'membres_supprimer_un_membre' },
      {
        name: 'Modifier la situation d\'un membre dans l\'organisation (responsabilité, accessoires)',
        slug: 'membres_modifier_situation_membre_sein_organisation',
        group: 'Fiche membre - onglet Structure',
        absorbs: [
          'membres_responsabilites_creer',
          'membres_responsabilites_supprimer',
          'membres_accessoires_creer',
          'membres_accessoires_modifier',
          'membres_accessoires_supprimer',
        ],
      },
      // Fiche membre - onglet Voyage
      {
        name: 'Consulter les voyages d\'études d\'un membre',
        slug: 'membres_voyages_voir',
        group: 'Fiche membre - onglet Voyage',
      },
      {
        name: 'Ajouter un voyage d\'études à un membre',
        slug: 'membres_voyages_creer',
        group: 'Fiche membre - onglet Voyage',
        absorbs: ['membres_modifier_voyage_etudes_membre'],
      },
      {
        name: 'Supprimer un voyage d\'études d\'un membre',
        slug: 'membres_voyages_supprimer',
        group: 'Fiche membre - onglet Voyage',
      },
      // Fiche membre - onglet Comité
      {
        name: 'Consulter les comités auxquels appartient un membre',
        slug: 'membres_consulter_comites_auxquels_appartient_membre',
        group: 'Fiche membre - onglet Comité',
      },
      {
        name: 'Ajouter un membre à son comité',
        slug: 'membres_gerer_membres_comite',
        group: 'Fiche membre - onglet Comité',
      },
      {
        name: 'Retirer un membre de son comité',
        slug: 'membres_retirer_membre_comite',
        group: 'Fiche membre - onglet Comité',
      },
      // Fiche membre - onglet Historique
      {
        name: 'Consulter l\'historique des transferts d\'un membre',
        slug: 'membres_consulter_historique_transferts_membre',
        group: 'Fiche membre - onglet Historique',
      },
    ],
  },
  {
    name: 'Transferts de membres',
    description: 'Demandes de transfert d’un membre d’une structure vers une autre.',
    permissions: [
      { name: 'Accéder au menu des transferts de membres', slug: 'membres_voir_menu_transferts' },
      {
        name: 'Consulter la liste des demandes de transfert',
        slug: 'transferts_consulter_liste_demandes_transfert',
      },
      {
        name: 'Consulter le détail d\'une demande de transfert',
        slug: 'transferts_consulter_detail_demande_transfert',
        absorbs: ['transferts_consulter_responsabilites_retirees_lors_transfert'],
      },
      { name: 'Créer une demande de transfert', slug: 'membres_initier_transfert' },
      {
        name: 'Approuver et appliquer un transfert',
        slug: 'membres_approuver_transfert',
        absorbs: [
          'transferts_traiter_demande_transfert',
          'transferts_choisir_structure_accueil_chaque_membre_transfere',
          'transferts_ajouter_commentaire_demande_transfert',
        ],
      },
      { name: 'Refuser un transfert', slug: 'transferts_refuser_transfert' },
      { name: 'Annuler une demande de transfert', slug: 'transferts_annuler_demande_transfert' },
    ],
  },
  {
    name: 'Validation des enregistrements',
    description:
      'Circuit à deux signatures (district puis chapitre) entre la saisie d’un membre et sa création. Cf. docs/VALIDATION-MEMBRES.md.',
    permissions: [
      {
        name: 'Accéder au menu des dossiers à valider',
        slug: 'membres_voir_menu_validations',
        defaults: { RESPONSABLE: true },
      },
      {
        name: 'Valider un enregistrement au niveau district',
        slug: 'membres_valider_district',
        defaults: { RESPONSABLE: true },
      },
      {
        name: 'Valider un enregistrement au niveau chapitre',
        slug: 'membres_valider_chapitre',
        defaults: { RESPONSABLE: true },
      },
    ],
  },
  {
    name: 'Importation des membres',
    description: 'Import de membres par fichier Excel : analyse, confirmation, échecs.',
    permissions: [
      {
        name: 'Accéder au module d\'importation',
        slug: 'importations_voir',
        absorbs: [
          'importations_charger_fichier_import_xlsx_xls',
          'importations_actualiser_liste_echecs_importation',
        ],
      },
      {
        name: 'Analyser un fichier d\'import (simulation sans enregistrement)',
        slug: 'importations_analyser',
      },
      { name: 'Confirmer l\'écriture en base des lignes importées', slug: 'importations_confirmer' },
      {
        name: 'Consulter et exporter les échecs d\'importation',
        slug: 'importations_consulter_echecs_importation',
        absorbs: [
          'importations_consulter_detail_erreurs_fichier_importe',
          'importations_exporter_erreurs_fichier_format_excel',
        ],
      },
    ],
  },
  {
    name: 'Abonnements',
    description: 'Campagnes d’abonnement, souscriptions et paiements associés.',
    permissions: [
      { name: 'Accéder au menu Abonnements', slug: 'abonnements_voir_menu_abonnements' },
      {
        name: 'Consulter les campagnes d\'abonnement (liste et détail)',
        slug: 'abonnements_voir',
        absorbs: [
          'abonnements_consulter_liste_campagnes_abonnement',
          'abonnements_consulter_detail_campagne_abonnement',
        ],
      },
      {
        name: 'Créer une campagne d\'abonnement',
        slug: 'abonnements_creer',
        absorbs: ['abonnements_ajouter_abonnements'],
      },
      {
        name: 'Modifier une campagne d\'abonnement (dont terminer)',
        slug: 'abonnements_modifier',
        absorbs: ['abonnements_modifier_abonnements', 'abonnements_terminer_campagne_abonnement'],
      },
      {
        name: 'Archiver une campagne d\'abonnement',
        slug: 'abonnements_supprimer',
        absorbs: ['abonnements_archiver_campagne_abonnement', 'abonnements_archiver_abonnements'],
      },
      {
        name: 'Filtrer les campagnes d\'abonnement par statut',
        slug: 'abonnements_filtrer_par_statut',
      },
      {
        name: 'Consulter les statistiques financières d\'une campagne (montant récolté, paiements réussis)',
        slug: 'abonnements_consulter_statistiques_campagne',
      },
      {
        name: 'Consulter la liste des paiements d\'une campagne d\'abonnement',
        slug: 'abonnements_paiements_voir',
      },
      {
        name: 'Souscrire à un abonnement',
        slug: 'abonnements_paiements_creer',
      },
      { name: 'Souscrire pour un bénéficiaire tiers', slug: 'abonnements_souscrire_beneficiaire_tiers' },
      {
        name: 'Vérifier le statut d\'un paiement d\'abonnement',
        slug: 'abonnements_paiements_modifier',
      },
      {
        // ⚠️ N'absorbe RIEN : les fantômes « filtrer par bénéficiaire » et « définir la
        // quantité » étaient cochés pour MEMBRE - les fusionner ici lui aurait donné le droit
        // d'EXPORT des transactions (constaté au premier seed local, refermé aussitôt).
        // Ces deux slugs sont simplement supprimés, sans transfert de droits.
        name: 'Exporter les transactions d\'une campagne d\'abonnement',
        slug: 'abonnements_exporter_transactions_campagne_abonnement',
      },
      // Transactions transverses (une seule table de paiements sert Abonnements ET Zaimu).
      {
        name: 'Consulter les transactions de paiement (toutes campagnes)',
        slug: 'paiements_voir',
        group: 'Transactions',
      },
      { name: 'Initier une transaction de paiement', slug: 'paiements_creer', group: 'Transactions' },
      {
        name: 'Vérifier / synchroniser une transaction de paiement',
        slug: 'paiements_modifier',
        group: 'Transactions',
      },
    ],
  },
  {
    name: 'Zaimu',
    description: 'Campagnes de zaimu, contributions et paiements associés.',
    permissions: [
      { name: 'Accéder au menu Zaimu', slug: 'donations_voir_menu_donations' },
      {
        name: 'Consulter les campagnes de zaimu (liste et détail)',
        slug: 'dons_voir',
        absorbs: ['zaimu_consulter_liste_campagnes_zaimu', 'zaimu_consulter_detail_campagne_zaimu'],
      },
      {
        name: 'Créer une campagne de zaimu',
        slug: 'dons_creer',
        absorbs: ['donations_ajouter_donations'],
      },
      {
        name: 'Modifier une campagne de zaimu (dont terminer)',
        slug: 'dons_modifier',
        absorbs: ['donations_modifier_donations', 'zaimu_terminer_campagne_zaimu'],
      },
      {
        name: 'Archiver une campagne de zaimu',
        slug: 'dons_supprimer',
        absorbs: ['zaimu_archiver_campagne_zaimu', 'donations_archiver_donations'],
      },
      { name: 'Filtrer les campagnes de zaimu par statut', slug: 'dons_filtrer_par_statut' },
      {
        name: 'Consulter les statistiques financières d\'une campagne (montant récolté, paiements réussis)',
        slug: 'zaimu_consulter_statistiques_campagne',
      },
      {
        name: 'Consulter la liste des paiements d\'une campagne de zaimu',
        slug: 'dons_paiements_voir',
      },
      { name: 'Faire un zaimu', slug: 'dons_paiements_creer' },
      { name: 'Faire un zaimu pour un bénéficiaire tiers', slug: 'zaimu_faire_zaimu_beneficiaire_tiers' },
      { name: 'Vérifier le statut d\'un paiement de zaimu', slug: 'dons_paiements_modifier' },
      { name: 'Annuler un paiement de zaimu', slug: 'dons_paiements_supprimer' },
      {
        // Même règle que côté abonnements : le fantôme « filtrer par bénéficiaire » est
        // supprimé SANS transfert (l'export ne doit hériter d'aucun droit de confort).
        name: 'Exporter les transactions d\'une campagne de zaimu',
        slug: 'zaimu_exporter_transactions_campagne_zaimu',
      },
    ],
  },
  {
    name: 'Journaux - Éditions',
    description: 'Éditions du journal : distribution, réception, analyse, besoins et impression.',
    permissions: [
      {
        name: 'Accéder au menu Journal',
        slug: 'journals_voir_le_module_journal',
        absorbs: ['journals_acceder_menu_editions'],
      },
      {
        name: 'Consulter les éditions (liste et détail)',
        slug: 'journal_editions_voir',
        absorbs: ['journals_consulter_detail_edition', 'journals_filtrer_editions_titre', 'journals_consulter_statistiques_edition'],
      },
      {
        name: 'Créer une édition (dont pièces jointes)',
        slug: 'journal_editions_creer',
        absorbs: [
          'editions_ajouter_editions',
          'journals_joindre_photo_couverture_edition',
          'journals_joindre_version_numerique_pdf_edition',
        ],
      },
      {
        name: 'Modifier une édition',
        slug: 'journal_editions_modifier',
        absorbs: ['editions_modifier_editions'],
      },
      {
        name: 'Supprimer une édition',
        slug: 'journal_editions_supprimer',
        absorbs: ['editions_supprimer_editions'],
      },
      {
        name: 'Consulter la distribution (zones, besoins, impression, abonnés)',
        slug: 'journal_distribution_voir',
        group: 'Édition - onglet Distribution',
        absorbs: [
          'journals_consulter_detail_distribution',
          'journals_filtrer_distributions_zone',
          'journals_consulter_quantites_attendues_livrees',
          'journals_consulter_taux_livraison_zones_quantites',
          'journals_consulter_repartition_zone',
          'journals_consulter_besoins_calcules_depuis_abonnements',
          'journals_consulter_taux_rattachement_abonnes_zone',
          'journals_consulter_repartition_besoins_zone',
          'journals_consulter_listings_impression',
          'journals_definir_capacite_colis_appliquer',
          'journals_consulter_liste_impression',
          'journals_consulter_recapitulatif_abonnes',
          'journals_consulter_etiquettes',
          'journals_imprimer_rapport_impression_imprimer_pdf',
          'journals_exporter_rapport_impression_excel',
        ],
      },
      {
        name: 'Lancer la distribution d\'une édition (notifications comprises)',
        slug: 'journal_distribution_lancer',
        group: 'Édition - onglet Distribution',
        absorbs: [
          'journals_verifier_retards_relancer_responsables',
          'journals_choisir_canal_notification_sms',
          'journals_personnaliser_message_notification_distribution',
        ],
      },
      {
        name: 'Confirmer ou compléter la réception d\'une zone',
        slug: 'journal_distribution_modifier',
        group: 'Édition - onglet Distribution',
      },
      {
        name: 'Consulter le suivi et l\'analytique de réception',
        slug: 'journal_reception_voir',
        group: 'Édition - onglet Réception',
        absorbs: [
          'journals_filtrer_districts_statut_tous_recus_attente_retard',
          'journals_consulter_analytique_reception',
          'journals_consulter_avancement_global_membres_servis',
          'journals_consulter_repartition_districts_statut',
          'journals_consulter_evolution_distribution_temps',
          'journals_consulter_suivi_responsable_district',
          'journals_filtrer_suivi_responsable_tous_retard_non_demarres_termines',
          'journals_exporter_suivi_responsable_csv',
        ],
      },
      {
        name: 'Valider le lot d\'un district',
        slug: 'journal_reception_modifier',
        group: 'Édition - onglet Réception',
      },
      {
        name: 'Cocher la réception d\'un membre',
        slug: 'journals_cocher_reception_membre',
        group: 'Édition - onglet Réception',
        // Le bouton « J'ai reçu mon journal » des actions prioritaires est offert au MEMBRE,
        // mais son droit était à 0 : le geste finissait en 403. Le service borne déjà le
        // self-service (chacun ne coche QUE sa propre réception) - l'octroi est donc sûr.
        grantTo: ['membre'],
      },
    ],
  },
  {
    name: 'Zones',
    description: 'Zones de diffusion du journal et destinations rattachées.',
    permissions: [
      { name: 'Accéder au menu Zones', slug: 'zones_voir_menu_zones' },
      {
        name: 'Consulter les zones',
        slug: 'journal_zones_voir',
        absorbs: ['zones_consulter_liste_zones', 'zones_filtrer_zones_nom'],
      },
      {
        name: 'Créer une zone (villes desservies et responsable compris)',
        slug: 'journal_zones_creer',
        absorbs: [
          'zones_ajouter_zones',
          'zones_rattacher_villes_desservies_zone',
          'zones_affecter_responsable_zone_telephone_whatsapp',
        ],
      },
      { name: 'Modifier une zone', slug: 'journal_zones_modifier', absorbs: ['zones_modifier_zones'] },
      { name: 'Supprimer une zone', slug: 'journal_zones_supprimer', absorbs: ['zones_supprimer_zones'] },
      {
        name: 'Consulter les destinations (annuaire des correspondants)',
        slug: 'journal_destinations_voir',
      },
      {
        name: 'Créer une destination',
        slug: 'journal_destinations_creer',
        absorbs: ['destinations_ajouter_destinations'],
      },
      {
        name: 'Modifier une destination',
        slug: 'journal_destinations_modifier',
        absorbs: ['destinations_modifier_destinations'],
      },
      {
        name: 'Supprimer une destination',
        slug: 'journal_destinations_supprimer',
        absorbs: ['destinations_supprimer_destinations'],
      },
    ],
  },
  {
    name: 'Exports',
    description: 'Exports asynchrones : suivi de progression et téléchargement des fichiers.',
    permissions: [
      { name: 'Accéder au menu Exports', slug: 'exports_voir_menu_exports' },
      {
        name: 'Consulter la liste et la progression de ses exports',
        slug: 'exports_consulter_liste_exports',
        absorbs: [
          'exports_consulter_progression_export',
          'exports_rechercher_export_nom_fichier',
          'exports_filtrer_exports_type_periode_statut',
          'exports_trier_exports',
        ],
      },
      { name: 'Télécharger un fichier d\'export', slug: 'exports_telecharger_fichier_export' },
    ],
  },
  {
    name: 'Activités',
    description: 'Activités de l’organisation, participants, présence, quotas et comités d’organisation.',
    permissions: [
      {
        name: 'Accéder au menu Activités',
        slug: 'activites_voir_menu_activites',
        absorbs: ['activites_voir'],
      },
      {
        name: 'Consulter la liste des activités',
        slug: 'activites_consulter_liste_activites',
        seedFrom: ['activites_voir'],
      },
      {
        name: 'Consulter le détail d\'une activité',
        slug: 'activites_consulter_detail_activite',
        seedFrom: ['activites_voir'],
      },
      { name: 'Créer une activité', slug: 'activites_creer', absorbs: ['activites_ajouter_activites'] },
      { name: 'Modifier une activité', slug: 'activites_modifier', absorbs: ['activites_modifier_activites'] },
      { name: 'Supprimer une activité', slug: 'activites_supprimer', absorbs: ['activites_supprimer_activites'] },
      {
        name: 'Consulter les participants et la feuille de présence',
        slug: 'activites_participants_voir',
        group: 'Détail d\'une activité',
        seedFrom: ['activites_voir'],
      },
      {
        name: 'Gérer les participants (inscrire, changer de rôle, retirer)',
        slug: 'activites_participants_gerer',
        group: 'Détail d\'une activité',
        seedFrom: ['activites_creer', 'activites_modifier'],
      },
      {
        name: 'Pointer la présence (unitaire et en masse)',
        slug: 'activites_presence_pointer',
        group: 'Détail d\'une activité',
        seedFrom: ['activites_creer', 'activites_modifier'],
      },
      {
        name: 'Gérer les quotas par structure',
        slug: 'activites_quotas_gerer',
        group: 'Détail d\'une activité',
        seedFrom: ['activites_creer', 'activites_modifier'],
      },
      {
        name: 'Gérer les comités d\'organisation d\'une activité',
        slug: 'activites_comites_gerer',
        group: 'Détail d\'une activité',
        seedFrom: ['activites_creer', 'activites_modifier'],
      },
      {
        name: 'Créer un type d\'activité',
        slug: 'types_activite_creer',
        group: 'Types d\'activité',
      },
      {
        name: 'Modifier un type d\'activité',
        slug: 'types_activite_modifier',
        group: 'Types d\'activité',
        absorbs: ['types_activites_modifier_types_activites'],
      },
      {
        name: 'Supprimer un type d\'activité',
        slug: 'types_activite_supprimer',
        group: 'Types d\'activité',
        absorbs: ['types_activites_supprimer_types_activites'],
      },
    ],
  },
  {
    name: 'Rôles',
    description: 'Rôles applicatifs et attribution de leurs permissions.',
    permissions: [
      { name: 'Accéder au menu Rôles', slug: 'parametres_voir_menu_roles' },
      { name: 'Consulter la liste des rôles', slug: 'roles_voir_le_module_role' },
      { name: 'Créer un rôle', slug: 'roles_ajouter_un_role' },
      { name: 'Modifier un rôle', slug: 'roles_modifier_un_role' },
      { name: 'Activer ou désactiver un rôle', slug: 'roles_activer_ou_desactiver_un_role' },
      {
        name: 'Consulter les permissions d\'un rôle',
        slug: 'roles_consulter_permissions_role',
        seedFrom: ['roles_voir_le_module_role'],
      },
      {
        name: 'Attribuer ou retirer une permission à un rôle',
        slug: 'roles_attribuer_retirer_permission_role',
        seedFrom: ['roles_activer_ou_desactiver_un_role'],
      },
    ],
  },
  {
    name: 'Modules de permissions',
    description: 'Modules du référentiel de permissions et permissions qu’ils contiennent.',
    permissions: [
      { name: 'Accéder au menu Modules de permissions', slug: 'parametres_voir_menu_modules_permissions' },
      { name: 'Consulter la liste des modules de permissions', slug: 'modules_permissions_voir' },
      { name: 'Créer un module de permissions', slug: 'modules_permissions_creer' },
      { name: 'Modifier un module de permissions', slug: 'modules_permissions_modifier' },
      { name: 'Supprimer un module de permissions', slug: 'modules_permissions_supprimer' },
      { name: 'Consulter les permissions d\'un module', slug: 'permissions_voir' },
      {
        name: 'Créer une permission dans un module',
        slug: 'permissions_creer',
        absorbs: ['permissions_ajouter_permissions'],
      },
      {
        name: 'Modifier une permission',
        slug: 'permissions_modifier',
        absorbs: ['permissions_modifier_permissions'],
      },
      {
        name: 'Supprimer une permission',
        slug: 'permissions_supprimer',
        absorbs: ['permissions_supprimer_permissions'],
      },
    ],
  },
  {
    name: 'Collaborateurs',
    description: 'Comptes collaborateurs et rôles qui leur sont assignés.',
    permissions: [
      {
        name: 'Consulter les collaborateurs (liste et détail)',
        slug: 'utilisateurs_voir',
        absorbs: [
          'collaborateurs_acceder_onglet_collaborateurs',
          'collaborateurs_consulter_detail_collaborateur',
        ],
      },
      { name: 'Créer un collaborateur', slug: 'utilisateurs_creer' },
      { name: 'Modifier un collaborateur', slug: 'utilisateurs_modifier' },
      {
        name: 'Supprimer un compte collaborateur (définitif)',
        slug: 'utilisateurs_supprimer',
        absorbs: ['collaborateurs_activer_desactiver_collaborateur'],
      },
      {
        name: 'Consulter les rôles assignés aux collaborateurs',
        slug: 'utilisateurs_roles_voir',
      },
      {
        name: 'Assigner un rôle à un collaborateur',
        slug: 'collaborateurs_assigner_un_role_a_un_collaborateur',
      },
    ],
  },
  {
    name: 'Structures',
    description: 'Arborescence des structures de l’organisation.',
    permissions: [
      { name: 'Accéder au menu Structures', slug: 'parametres_voir_menu_structures' },
      {
        name: 'Consulter l\'arbre complet des structures (avec effectifs)',
        slug: 'structures_voir',
        absorbs: [
          'structures_naviguer_niveau_structure_voir_structures_filles',
          'structures_acceder_propre_structure_gestionnaire',
        ],
      },
      {
        name: 'Créer une structure',
        slug: 'structures_creer',
        absorbs: ['structures_ajouter_structures'],
      },
      {
        name: 'Modifier une structure',
        slug: 'structures_modifier',
        absorbs: ['structures_modifier_structures'],
      },
      {
        name: 'Supprimer une structure',
        slug: 'structures_supprimer',
        absorbs: ['structures_supprimer_structures'],
      },
    ],
  },
  {
    name: 'Comités',
    description: 'Comités et leurs responsables.',
    permissions: [
      { name: 'Accéder au menu Comités', slug: 'parametres_voir_menu_comites' },
      { name: 'Consulter la liste des comités', slug: 'comites_voir' },
      { name: 'Créer un comité', slug: 'comites_creer', absorbs: ['comites_ajouter_comites'] },
      {
        name: 'Modifier un comité (responsable compris)',
        slug: 'comites_modifier',
        absorbs: [
          'comites_modifier_comites',
          'comites_assigner_responsable_comite',
          'comites_retirer_responsable_comite',
        ],
      },
      { name: 'Supprimer un comité', slug: 'comites_supprimer', absorbs: ['comites_supprimer_comites'] },
    ],
  },
  {
    name: 'Niveaux',
    description: 'Niveaux de découpage hiérarchique des structures (lecture libre pour tout connecté).',
    permissions: [
      { name: 'Accéder au menu Niveaux', slug: 'parametres_voir_menu_niveaux' },
      { name: 'Créer un niveau (ordre, libellé)', slug: 'niveaux_creer', absorbs: ['niveaux_ajouter_niveaux'] },
      { name: 'Modifier un niveau', slug: 'niveaux_modifier', absorbs: ['niveaux_modifier_niveaux'] },
      { name: 'Supprimer un niveau', slug: 'niveaux_supprimer', absorbs: ['niveaux_supprimer_niveaux'] },
    ],
  },
  {
    name: 'Départements',
    description: 'Référentiel des départements (lecture libre pour tout connecté).',
    permissions: [
      { name: 'Accéder au menu Départements', slug: 'parametres_voir_menu_departements' },
      { name: 'Créer un département', slug: 'departements_creer', absorbs: ['departements_ajouter_departements'] },
      { name: 'Modifier un département', slug: 'departements_modifier', absorbs: ['departements_modifier_departements'] },
      { name: 'Supprimer un département', slug: 'departements_supprimer', absorbs: ['departements_supprimer_departements'] },
    ],
  },
  {
    name: 'Divisions',
    description: 'Référentiel des divisions (lecture libre pour tout connecté).',
    permissions: [
      { name: 'Accéder au menu Divisions', slug: 'parametres_voir_menu_divisions' },
      { name: 'Créer une division', slug: 'divisions_creer', absorbs: ['divisions_ajouter_divisions'] },
      { name: 'Modifier une division', slug: 'divisions_modifier', absorbs: ['divisions_modifier_divisions'] },
      { name: 'Supprimer une division', slug: 'divisions_supprimer', absorbs: ['divisions_supprimer_divisions'] },
    ],
  },
  {
    name: 'Responsabilités',
    description: 'Référentiel des responsabilités occupables (lecture libre pour tout connecté).',
    permissions: [
      { name: 'Accéder au menu Responsabilités', slug: 'parametres_voir_menu_responsabilites' },
      { name: 'Créer une responsabilité', slug: 'responsabilites_creer', absorbs: ['responsabilites_ajouter_responsabilites'] },
      { name: 'Modifier une responsabilité', slug: 'responsabilites_modifier', absorbs: ['responsabilites_modifier_responsabilites'] },
      { name: 'Supprimer une responsabilité', slug: 'responsabilites_supprimer', absorbs: ['responsabilites_supprimer_responsabilites'] },
    ],
  },
  {
    name: 'Formations',
    description: 'Référentiel des formations et qualifications (lecture libre pour tout connecté).',
    permissions: [
      { name: 'Accéder au menu Formations', slug: 'parametres_voir_menu_formations' },
      { name: 'Créer une formation', slug: 'formations_creer', absorbs: ['formations_ajouter_formations'] },
      { name: 'Modifier une formation', slug: 'formations_modifier', absorbs: ['formations_modifier_formations'] },
      { name: 'Supprimer une formation (dont reversement)', slug: 'formations_supprimer', absorbs: ['formations_supprimer_formations'] },
    ],
  },
  {
    name: 'Métiers',
    description: 'Référentiel des métiers (lecture libre pour tout connecté).',
    permissions: [
      { name: 'Accéder au menu Métiers', slug: 'parametres_voir_menu_metiers' },
      { name: 'Créer un métier', slug: 'metiers_creer', absorbs: ['metiers_ajouter_metiers'] },
      { name: 'Modifier un métier', slug: 'metiers_modifier', absorbs: ['metiers_modifier_metiers'] },
      { name: 'Supprimer un métier (dont reversement)', slug: 'metiers_supprimer', absorbs: ['metiers_supprimer_metiers'] },
    ],
  },
  {
    name: 'Localités de résidence',
    description: 'Référentiel des localités de résidence (lecture libre pour tout connecté).',
    permissions: [
      { name: 'Accéder au menu Localités de résidence', slug: 'parametres_voir_menu_localite_de_residences' },
      { name: 'Créer une localité', slug: 'villes_creer', absorbs: ['localite_de_residence_ajouter_localite_de_residences'] },
      { name: 'Modifier une localité', slug: 'villes_modifier', absorbs: ['localite_de_residence_modifier_localite_de_residences'] },
      { name: 'Supprimer une localité (dont reversement)', slug: 'villes_supprimer', absorbs: ['localite_de_residence_supprimer_localite_de_residences'] },
    ],
  },
  {
    name: 'Villes de l\'organisation',
    description: 'Référentiel des villes de l’organisation (lecture libre pour tout connecté).',
    permissions: [
      {
        name: 'Accéder au menu Villes de l\'organisation',
        slug: 'villes_organisation_acceder_menu_villes_organisation',
      },
      { name: 'Créer une ville d\'organisation', slug: 'villes_organisation_creer', absorbs: ['organisations_ajouter_organisations'] },
      { name: 'Modifier une ville d\'organisation', slug: 'villes_organisation_modifier', absorbs: ['organisations_modifier_organisations'] },
      { name: 'Supprimer une ville d\'organisation', slug: 'villes_organisation_supprimer', absorbs: ['organisations_supprimer_organisations'] },
    ],
  },
  {
    name: 'Pays',
    description: 'Référentiel des pays (lecture libre pour tout connecté).',
    permissions: [
      { name: 'Accéder au menu Pays', slug: 'parametres_voir_menu_pays' },
      { name: 'Créer un pays', slug: 'pays_creer', absorbs: ['pays_ajouter_pays'] },
      { name: 'Modifier un pays', slug: 'pays_modifier', absorbs: ['pays_modifier_pays'] },
      { name: 'Supprimer un pays', slug: 'pays_supprimer', absorbs: ['pays_supprimer_pays'] },
    ],
  },
  {
    name: 'Civilités',
    description: 'Référentiel des civilités (lecture libre pour tout connecté).',
    permissions: [
      { name: 'Accéder au menu Civilités', slug: 'parametres_voir_menu_civilites' },
      { name: 'Créer une civilité (libellé, sigle, genre)', slug: 'civilites_creer', absorbs: ['civilites_ajouter_civilites'] },
      { name: 'Modifier une civilité', slug: 'civilites_modifier', absorbs: ['civilites_modifier_civilites'] },
      { name: 'Supprimer une civilité', slug: 'civilites_supprimer', absorbs: ['civilites_supprimer_civilites'] },
    ],
  },
  {
    name: 'Situations matrimoniales',
    description: 'Référentiel des situations matrimoniales (lecture libre pour tout connecté).',
    permissions: [
      {
        name: 'Accéder au menu Situations matrimoniales',
        slug: 'parametres_voir_menu_situation_matrimoniales',
      },
      {
        name: 'Créer une situation matrimoniale',
        slug: 'situations_matrimoniales_creer',
        absorbs: ['situation_matrimoniales_ajouter_situation_matrimoniales'],
      },
      {
        name: 'Modifier une situation matrimoniale',
        slug: 'situations_matrimoniales_modifier',
        absorbs: ['situation_matrimoniales_modifier_situation_matrimoniales'],
      },
      {
        name: 'Supprimer une situation matrimoniale',
        slug: 'situations_matrimoniales_supprimer',
        absorbs: ['situation_matrimoniales_supprimer_situation_matrimoniales'],
      },
    ],
  },
  {
    name: 'Accessoires',
    description: 'Référentiel des accessoires de pratique (lecture libre pour tout connecté).',
    permissions: [
      { name: 'Accéder au menu Accessoires', slug: 'parametres_voir_menu_accessoires' },
      { name: 'Créer un accessoire', slug: 'accessoires_creer', absorbs: ['accessoires_ajouter_accessoires'] },
      { name: 'Modifier un accessoire', slug: 'accessoires_modifier', absorbs: ['accessoires_modifier_accessoires'] },
      { name: 'Supprimer un accessoire', slug: 'accessoires_supprimer', absorbs: ['accessoires_supprimer_accessoires'] },
    ],
  },
  {
    name: 'Paramètres généraux',
    description: 'Configurations générales de l’application, dont les fournisseurs SMS.',
    permissions: [
      { name: 'Accéder au menu Paramètres', slug: 'parametres_voir_menu_parametres' },
      {
        name: 'Consulter les paramètres SMS',
        slug: 'parametres_voir_sms',
        absorbs: ['parametres_voir_menu_sms', 'parametres_consulter_bloc_configurations'],
      },
      { name: 'Gérer les paramètres SMS', slug: 'parametres_gerer_sms' },
      {
        name: 'Exécuter les migrations techniques',
        slug: 'migration_executer',
      },
    ],
  },
];

/** Toutes les permissions du catalogue à plat, avec leur module d'appartenance. */
export function listCatalogPermissions(): Array<{
  module: string;
  name: string;
  slug: string;
  description: string;
  absorbs: string[];
  seedFrom: string[];
  defaults: Record<string, boolean>;
  grantTo: string[];
}> {
  const lignes: Array<{
    module: string;
    name: string;
    slug: string;
    description: string;
    absorbs: string[];
    seedFrom: string[];
    defaults: Record<string, boolean>;
    grantTo: string[];
  }> = [];
  for (const mod of PERMISSION_CATALOG) {
    for (const p of mod.permissions) {
      lignes.push({
        module: mod.name,
        name: p.name,
        slug: p.slug,
        description: p.group ? `${mod.name} - ${p.group}` : mod.name,
        absorbs: p.absorbs ?? [],
        seedFrom: p.seedFrom ?? [],
        defaults: p.defaults ?? {},
        grantTo: p.grantTo ?? [],
      });
    }
  }
  return lignes;
}

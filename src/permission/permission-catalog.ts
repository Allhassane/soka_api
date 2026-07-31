/**
 * CATALOGUE DES PERMISSIONS - transcription du référentiel fonctionnel
 * `permissions/permissions-soka-digital.md` (racine du dépôt), qui est la SOURCE DE VÉRITÉ
 * métier : un module = une section « ## Module … », une permission = une puce.
 *
 * Utilisé par les seeds :
 *   npm run seed:reset-permissions   -> vide modules / permissions / roles_permissions
 *   npm run seed:permissions         -> vide puis recharge tout depuis ce catalogue
 *
 * ⚠️ **Slugs.** Le libellé vient du .md, le slug est l'identifiant technique stocké en base et
 * référencé par le code : `@RequirePermissions('<slug>')` côté API, `<Protected permission="…">`
 * et `config/menus.ts` côté web. Quand une entrée du .md correspond à un droit DÉJÀ contrôlé par
 * le code, on reprend le slug existant plutôt que d'en dériver un nouveau - sinon la
 * fonctionnalité se ferme pour tout le monde sauf `is_admin` (un slug absent de la table
 * `permissions` = refusé, cf. api/CLAUDE.md).
 *
 * ⚠️ **Alias.** Certaines routes déjà protégées n'ont aucune entrée dédiée dans le .md (ex. les
 * 3 verbes d'écriture des accessoires d'un membre, regroupés là-bas sous une seule ligne). Leur
 * slug est déclaré en `aliases` : le seed crée une permission supplémentaire, dans le même
 * module, accordée aux mêmes rôles. Les supprimer fermerait la route correspondante.
 *
 * ⚠️ **Ne jamais renommer un slug existant** : il est référencé dans le code et stocké en base.
 * Ajouter une permission = ajouter la puce dans le .md, l'ajouter ici, rejouer le seed.
 *
 * Fichier généré une première fois depuis le .md puis maintenu à la main.
 * Remplace `permission-manifest.ts` (conservé uniquement pour la migration historique
 * `1782800300000-SeedPermissionCatalog`, qui ne doit plus être rejouée).
 */

/** Slug supplémentaire exigé par le code, sans entrée propre dans le référentiel .md. */
export interface CatalogAlias {
  slug: string;
  /** Où ce slug est exigé - sert de description en base et de trace pour la revue. */
  reason: string;
}

export interface CatalogPermission {
  /** Libellé exact de la puce du .md (affiché dans l'écran d'attribution des rôles). */
  name: string;
  /** Identifiant technique stable. */
  slug: string;
  /** Sous-section « ### … » du .md, quand la puce en dépend. */
  group?: string;
  aliases?: CatalogAlias[];
}

export interface CatalogModule {
  /** Nom de la section « ## Module … » - devient `modules.name`. */
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
        aliases: [
          { slug: 'statistiques_voir', reason: 'API statistique.controller : tree, global, demographics, compare, growth, dashboard' },
        ],
      },
      { name: 'Consulter les actions prioritaires', slug: 'dashboard_consulter_actions_prioritaires' },
      { name: 'Consulter le comité de sa structure', slug: 'dashboard_consulter_comite_structure' },
      { name: 'Contacter un membre du comité', slug: 'dashboard_contacter_membre_comite' },
      { name: 'Filtrer les statistiques par périmètre', slug: 'dashboard_filtrer_statistiques_perimetre' },
      {
        name: 'Réinitialiser les filtres du tableau de bord',
        slug: 'dashboard_reinitialiser_filtres_tableau_bord',
      },
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
      { name: 'Accéder à l\'onglet Membres', slug: 'membres_voir_menu_membres' },
      { name: 'Consulter la liste des membres', slug: 'membres_voir_menu_liste_membres' },
      { name: 'Rechercher un membre', slug: 'membres_rechercher_membre' },
      { name: 'Filtrer les membres', slug: 'membres_filtrer_membres' },
      { name: 'Consulter la fiche d\'un membre', slug: 'membres_acceder_alonglet_membre' },
      { name: 'Créer un membre', slug: 'membres_ajouter_un_membre' },
      { name: 'Modifier un membre', slug: 'membres_modifier_un_membre' },
      { name: 'Supprimer un membre', slug: 'membres_supprimer_un_membre' },
      { name: 'Exporter la fiche d\'un membre en PDF', slug: 'membres_exporter_fiche_membre_pdf' },
      // Fiche membre - onglet Profil
      {
        name: 'Consulter l\'état civil et la situation familiale d\'un membre',
        slug: 'membres_consulter_etat_civil_situation_familiale_membre',
        group: 'Fiche membre - onglet Profil',
      },
      {
        name: 'Consulter les coordonnées d\'un membre (mobile, e-mail)',
        slug: 'membres_consulter_coordonnees_membre_mobile_e_mail',
        group: 'Fiche membre - onglet Profil',
      },
      {
        name: 'Consulter la profession d\'un membre (formation / métier exercé)',
        slug: 'membres_consulter_profession_membre_formation_metier_exerce',
        group: 'Fiche membre - onglet Profil',
      },
      {
        name: 'Consulter les repères d\'un membre (ancienneté, nombre d\'enfants)',
        slug: 'membres_consulter_reperes_membre_anciennete_nombre_enfants',
        group: 'Fiche membre - onglet Profil',
      },
      // Fiche membre - onglet Structure
      {
        name: 'Consulter la responsabilité d\'un membre',
        slug: 'membres_responsabilites_voir',
        group: 'Fiche membre - onglet Structure',
      },
      {
        name: 'Consulter les objets de pratique d\'un membre',
        slug: 'membres_consulter_objets_pratique_membre',
        group: 'Fiche membre - onglet Structure',
      },
      {
        name: 'Consulter les accessoires de pratique d\'un membre',
        slug: 'membres_accessoires_voir',
        group: 'Fiche membre - onglet Structure',
      },
      {
        name: 'Consulter le rattachement et la pratique d\'un membre',
        slug: 'membres_consulter_rattachement_pratique_membre',
        group: 'Fiche membre - onglet Structure',
      },
      {
        name: 'Modifier la situation d\'un membre au sein de l\'organisation',
        slug: 'membres_modifier_situation_membre_sein_organisation',
        group: 'Fiche membre - onglet Structure',
        aliases: [
          { slug: 'membres_responsabilites_creer', reason: 'API member-responsibility.controller : POST' },
          { slug: 'membres_responsabilites_supprimer', reason: 'API member-responsibility.controller : DELETE' },
          { slug: 'membres_accessoires_creer', reason: 'API member-accessories.controller : POST' },
          { slug: 'membres_accessoires_modifier', reason: 'API member-accessories.controller : PUT' },
          { slug: 'membres_accessoires_supprimer', reason: 'API member-accessories.controller : DELETE' },
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
      },
      {
        name: 'Modifier un voyage d\'études d\'un membre',
        slug: 'membres_modifier_voyage_etudes_membre',
        group: 'Fiche membre - onglet Voyage',
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
      { name: 'Créer une demande de transfert', slug: 'membres_initier_transfert' },
      {
        name: 'Consulter le détail d\'une demande de transfert',
        slug: 'transferts_consulter_detail_demande_transfert',
      },
      { name: 'Traiter une demande de transfert', slug: 'transferts_traiter_demande_transfert' },
      {
        name: 'Choisir la structure d\'accueil de chaque membre transféré',
        slug: 'transferts_choisir_structure_accueil_chaque_membre_transfere',
      },
      {
        name: 'Consulter les responsabilités retirées lors d\'un transfert',
        slug: 'transferts_consulter_responsabilites_retirees_lors_transfert',
      },
      {
        name: 'Ajouter un commentaire à une demande de transfert',
        slug: 'transferts_ajouter_commentaire_demande_transfert',
      },
      { name: 'Approuver et appliquer un transfert', slug: 'membres_approuver_transfert' },
      { name: 'Refuser un transfert', slug: 'transferts_refuser_transfert' },
      { name: 'Annuler une demande de transfert', slug: 'transferts_annuler_demande_transfert' },
    ],
  },
  {
    name: 'Importation des membres',
    description: 'Import de membres par fichier Excel : analyse, confirmation, échecs.',
    permissions: [
      { name: 'Accéder au module d\'importation', slug: 'importations_voir' },
      {
        name: 'Charger un fichier d\'import (.xlsx, .xls)',
        slug: 'importations_charger_fichier_import_xlsx_xls',
      },
      {
        name: 'Analyser un fichier d\'import (simulation sans enregistrement)',
        slug: 'importations_analyser',
      },
      { name: 'Confirmer l\'écriture en base des lignes importées', slug: 'importations_confirmer' },
      { name: 'Consulter les échecs d\'importation', slug: 'importations_consulter_echecs_importation' },
      {
        name: 'Consulter le détail des erreurs d\'un fichier importé',
        slug: 'importations_consulter_detail_erreurs_fichier_importe',
      },
      {
        name: 'Exporter les erreurs d\'un fichier au format Excel',
        slug: 'importations_exporter_erreurs_fichier_format_excel',
      },
      {
        name: 'Actualiser la liste des échecs d\'importation',
        slug: 'importations_actualiser_liste_echecs_importation',
      },
    ],
  },
  {
    name: 'Abonnements',
    description: 'Campagnes d’abonnement, souscriptions et paiements associés.',
    permissions: [
      {
        name: 'Accéder au menu Abonnements',
        slug: 'abonnements_voir',
        aliases: [
          { slug: 'abonnements_voir_menu_abonnements', reason: 'web config/menus.ts : entrée « Abonnements »' },
        ],
      },
      {
        name: 'Consulter la liste des campagnes d\'abonnement',
        slug: 'abonnements_consulter_liste_campagnes_abonnement',
      },
      {
        name: 'Créer une campagne d\'abonnement',
        slug: 'abonnements_creer',
        aliases: [
          { slug: 'abonnements_ajouter_abonnements', reason: 'web SubscriptionModal.tsx : bouton d’enregistrement' },
        ],
      },
      {
        name: 'Modifier une campagne d\'abonnement',
        slug: 'abonnements_modifier',
        aliases: [
          { slug: 'abonnements_modifier_abonnements', reason: 'web SubscriptionGrid.tsx : bouton « Modifier »' },
        ],
      },
      { name: 'Terminer une campagne d\'abonnement', slug: 'abonnements_terminer_campagne_abonnement' },
      {
        name: 'Archiver une campagne d\'abonnement',
        slug: 'abonnements_archiver_campagne_abonnement',
        aliases: [
          { slug: 'abonnements_supprimer', reason: 'API subscription.controller : DELETE /subscriptions/:uuid' },
          { slug: 'abonnements_archiver_abonnements', reason: 'web SubscriptionGrid.tsx : bouton « Archiver »' },
        ],
      },
      {
        name: 'Consulter le détail d\'une campagne d\'abonnement',
        slug: 'abonnements_consulter_detail_campagne_abonnement',
      },
      {
        name: 'Consulter les statistiques d\'une campagne',
        slug: 'abonnements_consulter_statistiques_campagne',
      },
      {
        name: 'Consulter la liste des paiements d\'une campagne',
        slug: 'abonnements_paiements_voir',
        aliases: [
          { slug: 'paiements_voir', reason: 'API payment.controller : liste, stats et exports asynchrones des paiements' },
        ],
      },
      { name: 'Filtrer les paiements par bénéficiaire', slug: 'abonnements_filtrer_paiements_beneficiaire' },
      {
        name: 'Filtrer les campagnes d\'abonnement par statut',
        slug: 'abonnements_filtrer_par_statut',
      },
      {
        name: 'Souscrire à un abonnement',
        slug: 'abonnements_paiements_creer',
        aliases: [
          { slug: 'paiements_creer', reason: 'API payment.controller : POST /payments' },
        ],
      },
      { name: 'Souscrire pour un bénéficiaire tiers', slug: 'abonnements_souscrire_beneficiaire_tiers' },
      {
        name: 'Définir la quantité d\'exemplaires souscrits',
        slug: 'abonnements_definir_quantite_exemplaires_souscrits',
      },
      {
        name: 'Vérifier le statut d\'un paiement',
        slug: 'abonnements_paiements_modifier',
        aliases: [
          { slug: 'paiements_modifier', reason: 'API payment.controller : PUT /payments/:uuid et /:uuid/status' },
        ],
      },
      {
        name: 'Exporter les transactions d\'une campagne d\'abonnement',
        slug: 'abonnements_exporter_transactions_campagne_abonnement',
      },
    ],
  },
  {
    name: 'Zaimu',
    description: 'Campagnes de zaimu, contributions et paiements associés.',
    permissions: [
      {
        name: 'Accéder au menu Zaimu',
        slug: 'dons_voir',
        aliases: [
          { slug: 'donations_voir_menu_donations', reason: 'web config/menus.ts : entrée « Zaimu »' },
        ],
      },
      { name: 'Consulter la liste des campagnes de zaimu', slug: 'zaimu_consulter_liste_campagnes_zaimu' },
      {
        name: 'Créer une campagne de zaimu',
        slug: 'dons_creer',
        aliases: [
          { slug: 'donations_ajouter_donations', reason: 'web DonationModal.tsx : bouton d’enregistrement' },
        ],
      },
      {
        name: 'Modifier une campagne de zaimu',
        slug: 'dons_modifier',
        aliases: [
          { slug: 'donations_modifier_donations', reason: 'web DonationGrid.tsx : bouton « Modifier »' },
        ],
      },
      { name: 'Terminer une campagne de zaimu', slug: 'zaimu_terminer_campagne_zaimu' },
      {
        name: 'Archiver une campagne de zaimu',
        slug: 'zaimu_archiver_campagne_zaimu',
        aliases: [
          { slug: 'dons_supprimer', reason: 'API donate.controller : DELETE /donate/:uuid' },
          { slug: 'donations_archiver_donations', reason: 'web DonationGrid.tsx : bouton « Archiver »' },
        ],
      },
      { name: 'Consulter le détail d\'une campagne de zaimu', slug: 'zaimu_consulter_detail_campagne_zaimu' },
      { name: 'Consulter les statistiques d\'une campagne', slug: 'zaimu_consulter_statistiques_campagne' },
      { name: 'Consulter la liste des paiements d\'une campagne de zaimu', slug: 'dons_paiements_voir' },
      { name: 'Filtrer les paiements par bénéficiaire', slug: 'zaimu_filtrer_paiements_beneficiaire' },
      {
        name: 'Filtrer les campagnes de zaimu par statut',
        slug: 'dons_filtrer_par_statut',
      },
      {
        name: 'Faire un zaimu',
        slug: 'dons_paiements_creer',
        aliases: [
          { slug: 'dons_paiements_supprimer', reason: 'API donate-payment.controller : DELETE /donate-payment/:uuid' },
        ],
      },
      { name: 'Faire un zaimu pour un bénéficiaire tiers', slug: 'zaimu_faire_zaimu_beneficiaire_tiers' },
      { name: 'Vérifier le statut d\'un paiement', slug: 'dons_paiements_modifier' },
      {
        name: 'Exporter les transactions d\'une campagne de zaimu',
        slug: 'zaimu_exporter_transactions_campagne_zaimu',
      },
    ],
  },
  {
    name: 'Journaux - Éditions',
    description: 'Éditions du journal : distribution, réception, analyse, besoins et impression.',
    permissions: [
      { name: 'Accéder au menu Journaux', slug: 'journals_voir_le_module_journal' },
      { name: 'Accéder au menu Éditions', slug: 'journals_acceder_menu_editions' },
      { name: 'Consulter la liste des éditions', slug: 'journal_editions_voir' },
      { name: 'Filtrer les éditions par titre', slug: 'journals_filtrer_editions_titre' },
      {
        name: 'Créer une édition',
        slug: 'journal_editions_creer',
        aliases: [
          { slug: 'editions_ajouter_editions', reason: 'web JournalEditionModal.tsx' },
        ],
      },
      {
        name: 'Joindre une photo de couverture à une édition',
        slug: 'journals_joindre_photo_couverture_edition',
      },
      {
        name: 'Joindre la version numérique (PDF) d\'une édition',
        slug: 'journals_joindre_version_numerique_pdf_edition',
      },
      {
        name: 'Modifier une édition',
        slug: 'journal_editions_modifier',
        aliases: [
          { slug: 'editions_modifier_editions', reason: 'web JournalEditionTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une édition',
        slug: 'journal_editions_supprimer',
        aliases: [
          { slug: 'editions_supprimer_editions', reason: 'web JournalEditionTable.tsx' },
        ],
      },
      { name: 'Consulter le détail d\'une édition', slug: 'journals_consulter_detail_edition' },
      {
        name: 'Vérifier les retards et relancer les responsables',
        slug: 'journals_verifier_retards_relancer_responsables',
      },
      // Édition - onglet Statistiques
      {
        name: 'Consulter les statistiques d\'une édition',
        slug: 'journals_consulter_statistiques_edition',
        group: 'Édition - onglet Statistiques',
      },
      {
        name: 'Consulter les quantités attendues et livrées',
        slug: 'journals_consulter_quantites_attendues_livrees',
        group: 'Édition - onglet Statistiques',
      },
      {
        name: 'Consulter les taux de livraison (zones et quantités)',
        slug: 'journals_consulter_taux_livraison_zones_quantites',
        group: 'Édition - onglet Statistiques',
      },
      {
        name: 'Consulter la répartition par zone',
        slug: 'journals_consulter_repartition_zone',
        group: 'Édition - onglet Statistiques',
      },
      // Édition - onglet Distribution
      {
        name: 'Consulter la liste des distributions',
        slug: 'journal_distribution_voir',
        group: 'Édition - onglet Distribution',
      },
      {
        name: 'Filtrer les distributions par zone',
        slug: 'journals_filtrer_distributions_zone',
        group: 'Édition - onglet Distribution',
      },
      {
        name: 'Lancer la distribution d\'une édition',
        slug: 'journal_distribution_lancer',
        group: 'Édition - onglet Distribution',
      },
      {
        name: 'Choisir le canal de notification (SMS)',
        slug: 'journals_choisir_canal_notification_sms',
        group: 'Édition - onglet Distribution',
      },
      {
        name: 'Personnaliser le message de notification de distribution',
        slug: 'journals_personnaliser_message_notification_distribution',
        group: 'Édition - onglet Distribution',
      },
      {
        name: 'Consulter le détail d\'une distribution',
        slug: 'journals_consulter_detail_distribution',
        group: 'Édition - onglet Distribution',
      },
      {
        name: 'Confirmer ou compléter la réception d\'une zone',
        slug: 'journal_distribution_modifier',
        group: 'Édition - onglet Distribution',
      },
      // Édition - onglet Réception
      {
        name: 'Consulter le suivi de réception',
        slug: 'journal_reception_voir',
        group: 'Édition - onglet Réception',
      },
      {
        name: 'Filtrer les districts par statut (tous, reçus, en attente, en retard)',
        slug: 'journals_filtrer_districts_statut_tous_recus_attente_retard',
        group: 'Édition - onglet Réception',
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
      },
      // Édition - onglet Analyse
      {
        name: 'Consulter l\'analytique de réception',
        slug: 'journals_consulter_analytique_reception',
        group: 'Édition - onglet Analyse',
      },
      {
        name: 'Consulter l\'avancement global des membres servis',
        slug: 'journals_consulter_avancement_global_membres_servis',
        group: 'Édition - onglet Analyse',
      },
      {
        name: 'Consulter la répartition des districts par statut',
        slug: 'journals_consulter_repartition_districts_statut',
        group: 'Édition - onglet Analyse',
      },
      {
        name: 'Consulter l\'évolution de la distribution dans le temps',
        slug: 'journals_consulter_evolution_distribution_temps',
        group: 'Édition - onglet Analyse',
      },
      {
        name: 'Consulter le suivi par responsable de district',
        slug: 'journals_consulter_suivi_responsable_district',
        group: 'Édition - onglet Analyse',
      },
      {
        name: 'Filtrer le suivi par responsable (tous, en retard, non démarrés, terminés)',
        slug: 'journals_filtrer_suivi_responsable_tous_retard_non_demarres_termines',
        group: 'Édition - onglet Analyse',
      },
      {
        name: 'Exporter le suivi par responsable (CSV)',
        slug: 'journals_exporter_suivi_responsable_csv',
        group: 'Édition - onglet Analyse',
      },
      // Édition - onglet Besoin (abonnements)
      {
        name: 'Consulter les besoins calculés depuis les abonnements',
        slug: 'journals_consulter_besoins_calcules_depuis_abonnements',
        group: 'Édition - onglet Besoin (abonnements)',
      },
      {
        name: 'Consulter le taux de rattachement des abonnés à une zone',
        slug: 'journals_consulter_taux_rattachement_abonnes_zone',
        group: 'Édition - onglet Besoin (abonnements)',
      },
      {
        name: 'Consulter la répartition des besoins par zone',
        slug: 'journals_consulter_repartition_besoins_zone',
        group: 'Édition - onglet Besoin (abonnements)',
      },
      // Édition - onglet Impression
      {
        name: 'Consulter les listings d\'impression',
        slug: 'journals_consulter_listings_impression',
        group: 'Édition - onglet Impression',
      },
      {
        name: 'Définir la capacité par colis et l\'appliquer',
        slug: 'journals_definir_capacite_colis_appliquer',
        group: 'Édition - onglet Impression',
      },
      {
        name: 'Consulter la liste d\'impression',
        slug: 'journals_consulter_liste_impression',
        group: 'Édition - onglet Impression',
      },
      {
        name: 'Consulter le récapitulatif des abonnés',
        slug: 'journals_consulter_recapitulatif_abonnes',
        group: 'Édition - onglet Impression',
      },
      {
        name: 'Consulter les étiquettes',
        slug: 'journals_consulter_etiquettes',
        group: 'Édition - onglet Impression',
      },
      {
        name: 'Imprimer le rapport d\'impression (Imprimer / PDF)',
        slug: 'journals_imprimer_rapport_impression_imprimer_pdf',
        group: 'Édition - onglet Impression',
      },
      {
        name: 'Exporter le rapport d\'impression (Excel)',
        slug: 'journals_exporter_rapport_impression_excel',
        group: 'Édition - onglet Impression',
      },
    ],
  },
  {
    name: 'Zones',
    description: 'Zones de diffusion du journal et destinations rattachées.',
    permissions: [
      {
        name: 'Accéder au menu Zones',
        slug: 'zones_voir_menu_zones',
        aliases: [
          { slug: 'journal_zones_voir', reason: 'API journal-zone.controller : GET' },
        ],
      },
      {
        name: 'Consulter la liste des zones',
        slug: 'zones_consulter_liste_zones',
        aliases: [
          { slug: 'journal_destinations_voir', reason: 'API journal-destination.controller : GET' },
        ],
      },
      { name: 'Filtrer les zones par nom', slug: 'zones_filtrer_zones_nom' },
      {
        name: 'Créer une zone (numéro, nom, région)',
        slug: 'journal_zones_creer',
        aliases: [
          { slug: 'zones_ajouter_zones', reason: 'web ZoneModal.tsx' },
        ],
      },
      { name: 'Rattacher des villes desservies à une zone', slug: 'zones_rattacher_villes_desservies_zone' },
      {
        name: 'Affecter un responsable de zone (téléphone, WhatsApp)',
        slug: 'zones_affecter_responsable_zone_telephone_whatsapp',
      },
      {
        name: 'Modifier une zone',
        slug: 'journal_zones_modifier',
        aliases: [
          { slug: 'zones_modifier_zones', reason: 'web ZoneTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une zone',
        slug: 'journal_zones_supprimer',
        aliases: [
          { slug: 'zones_supprimer_zones', reason: 'web ZoneTable.tsx' },
        ],
      },
      {
        name: 'Créer une destination',
        slug: 'journal_destinations_creer',
        aliases: [
          { slug: 'destinations_ajouter_destinations', reason: 'web JournalDestinationModal.tsx' },
        ],
      },
      {
        name: 'Modifier une destination',
        slug: 'journal_destinations_modifier',
        aliases: [
          { slug: 'destinations_modifier_destinations', reason: 'web JournalDestinationTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une destination',
        slug: 'journal_destinations_supprimer',
        aliases: [
          { slug: 'destinations_supprimer_destinations', reason: 'web JournalDestinationTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Exports',
    description: 'Exports asynchrones : suivi de progression et téléchargement des fichiers.',
    permissions: [
      { name: 'Accéder au menu Exports', slug: 'exports_voir_menu_exports' },
      { name: 'Consulter la liste de ses exports', slug: 'exports_consulter_liste_exports' },
      { name: 'Rechercher un export par nom de fichier', slug: 'exports_rechercher_export_nom_fichier' },
      {
        name: 'Filtrer les exports par type, par période et par statut',
        slug: 'exports_filtrer_exports_type_periode_statut',
      },
      { name: 'Trier les exports', slug: 'exports_trier_exports' },
      { name: 'Consulter la progression d\'un export', slug: 'exports_consulter_progression_export' },
      { name: 'Télécharger un fichier d\'export', slug: 'exports_telecharger_fichier_export' },
    ],
  },
  {
    name: 'Activités',
    description: 'Activités de l’organisation et leurs types.',
    permissions: [
      {
        name: 'Accéder au menu Activités',
        slug: 'activites_voir',
        aliases: [
          { slug: 'activites_voir_menu_activites', reason: 'web config/menus.ts : entrée « Activités »' },
        ],
      },
      { name: 'Consulter la liste des activités', slug: 'activites_consulter_liste_activites' },
      {
        name: 'Créer une activité',
        slug: 'activites_creer',
        aliases: [
          { slug: 'activites_ajouter_activites', reason: 'web ActivityModal.tsx' },
        ],
      },
      {
        name: 'Modifier une activité',
        slug: 'activites_modifier',
        aliases: [
          { slug: 'activites_modifier_activites', reason: 'web ActivityTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une activité',
        slug: 'activites_supprimer',
        aliases: [
          { slug: 'activites_supprimer_activites', reason: 'web ActivityTable.tsx' },
        ],
      },
      { name: 'Consulter le détail d\'une activité', slug: 'activites_consulter_detail_activite' },
      { name: 'Consulter la liste des types d\'activités', slug: 'types_activite_voir' },
      { name: 'Créer un type d\'activité', slug: 'types_activite_creer' },
      {
        name: 'Modifier un type d\'activité',
        slug: 'types_activite_modifier',
        aliases: [
          { slug: 'types_activites_modifier_types_activites', reason: 'web ActivityTypeTable.tsx' },
        ],
      },
      {
        name: 'Supprimer un type d\'activité',
        slug: 'types_activite_supprimer',
        aliases: [
          { slug: 'types_activites_supprimer_types_activites', reason: 'web ActivityTypeTable.tsx' },
        ],
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
      { name: 'Consulter les permissions d\'un rôle', slug: 'roles_consulter_permissions_role' },
      {
        name: 'Attribuer ou retirer une permission à un rôle',
        slug: 'roles_attribuer_retirer_permission_role',
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
        aliases: [
          { slug: 'permissions_ajouter_permissions', reason: 'web PermissionModal.tsx' },
        ],
      },
      {
        name: 'Modifier une permission',
        slug: 'permissions_modifier',
        aliases: [
          { slug: 'permissions_modifier_permissions', reason: 'web PermissionTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une permission',
        slug: 'permissions_supprimer',
        aliases: [
          { slug: 'permissions_supprimer_permissions', reason: 'web PermissionTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Collaborateurs',
    description: 'Comptes collaborateurs et rôles qui leur sont assignés.',
    permissions: [
      { name: 'Accéder à l\'onglet Collaborateurs', slug: 'collaborateurs_acceder_onglet_collaborateurs' },
      { name: 'Consulter la liste des collaborateurs', slug: 'utilisateurs_voir' },
      {
        name: 'Consulter le détail d\'un collaborateur',
        slug: 'collaborateurs_consulter_detail_collaborateur',
      },
      { name: 'Créer un collaborateur', slug: 'utilisateurs_creer' },
      { name: 'Modifier un collaborateur', slug: 'utilisateurs_modifier' },
      {
        name: 'Activer ou désactiver un collaborateur',
        slug: 'collaborateurs_activer_desactiver_collaborateur',
        aliases: [
          { slug: 'utilisateurs_supprimer', reason: 'API user.controller : DELETE /users/:uuid' },
        ],
      },
      {
        name: 'Assigner un rôle à un collaborateur',
        slug: 'collaborateurs_assigner_un_role_a_un_collaborateur',
        aliases: [
          { slug: 'utilisateurs_roles_voir', reason: 'API user-roles.controller : GET' },
        ],
      },
    ],
  },
  {
    name: 'Structures',
    description: 'Arborescence des structures de l’organisation.',
    permissions: [
      { name: 'Accéder au menu Structures', slug: 'parametres_voir_menu_structures' },
      { name: 'Consulter l\'arborescence des structures', slug: 'structures_voir' },
      {
        name: 'Naviguer dans un niveau de structure (voir les structures filles)',
        slug: 'structures_naviguer_niveau_structure_voir_structures_filles',
      },
      {
        name: 'Créer une structure au niveau courant (région, centre régional, centre, chapitre, district, groupe, sous-groupe)',
        slug: 'structures_creer',
        aliases: [
          { slug: 'structures_ajouter_structures', reason: 'web StructureModal.tsx' },
        ],
      },
      {
        name: 'Modifier une structure',
        slug: 'structures_modifier',
        aliases: [
          { slug: 'structures_modifier_structures', reason: 'web StructureTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une structure',
        slug: 'structures_supprimer',
        aliases: [
          { slug: 'structures_supprimer_structures', reason: 'web StructureTable.tsx' },
        ],
      },
      {
        name: 'Accéder à sa propre structure (gestionnaire)',
        slug: 'structures_acceder_propre_structure_gestionnaire',
      },
      { name: 'Consulter les membres d\'une structure', slug: 'structures_consulter_membres_structure' },
    ],
  },
  {
    name: 'Comités',
    description: 'Comités et leurs responsables.',
    permissions: [
      { name: 'Accéder au menu Comités', slug: 'parametres_voir_menu_comites' },
      { name: 'Consulter la liste des comités', slug: 'comites_voir' },
      {
        name: 'Créer un comité',
        slug: 'comites_creer',
        aliases: [
          { slug: 'comites_ajouter_comites', reason: 'web ComiteModal.tsx' },
        ],
      },
      {
        name: 'Modifier un comité',
        slug: 'comites_modifier',
        aliases: [
          { slug: 'comites_modifier_comites', reason: 'web ComiteTable.tsx' },
        ],
      },
      {
        name: 'Supprimer un comité',
        slug: 'comites_supprimer',
        aliases: [
          { slug: 'comites_supprimer_comites', reason: 'web ComiteTable.tsx' },
        ],
      },
      { name: 'Assigner un responsable à un comité', slug: 'comites_assigner_responsable_comite' },
      { name: 'Retirer le responsable d\'un comité', slug: 'comites_retirer_responsable_comite' },
    ],
  },
  {
    name: 'Niveaux',
    description: 'Niveaux de découpage hiérarchique des structures.',
    permissions: [
      { name: 'Accéder au menu Niveaux', slug: 'parametres_voir_menu_niveaux' },
      { name: 'Consulter la liste des niveaux de découpage', slug: 'niveaux_voir' },
      {
        name: 'Créer un niveau (ordre, libellé)',
        slug: 'niveaux_creer',
        aliases: [
          { slug: 'niveaux_ajouter_niveaux', reason: 'web LevelModal.tsx' },
        ],
      },
      {
        name: 'Modifier un niveau',
        slug: 'niveaux_modifier',
        aliases: [
          { slug: 'niveaux_modifier_niveaux', reason: 'web LevelTable.tsx' },
        ],
      },
      {
        name: 'Supprimer un niveau',
        slug: 'niveaux_supprimer',
        aliases: [
          { slug: 'niveaux_supprimer_niveaux', reason: 'web LevelTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Départements',
    description: 'Référentiel des départements.',
    permissions: [
      { name: 'Accéder au menu Départements', slug: 'parametres_voir_menu_departements' },
      { name: 'Consulter la liste des départements', slug: 'departements_voir' },
      {
        name: 'Créer un département',
        slug: 'departements_creer',
        aliases: [
          { slug: 'departements_ajouter_departements', reason: 'web DepartementModal.tsx' },
        ],
      },
      {
        name: 'Modifier un département',
        slug: 'departements_modifier',
        aliases: [
          { slug: 'departements_modifier_departements', reason: 'web DepartementTable.tsx' },
        ],
      },
      {
        name: 'Supprimer un département',
        slug: 'departements_supprimer',
        aliases: [
          { slug: 'departements_supprimer_departements', reason: 'web DepartementTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Divisions',
    description: 'Référentiel des divisions.',
    permissions: [
      { name: 'Accéder au menu Divisions', slug: 'parametres_voir_menu_divisions' },
      { name: 'Consulter la liste des divisions', slug: 'divisions_voir' },
      {
        name: 'Créer une division',
        slug: 'divisions_creer',
        aliases: [
          { slug: 'divisions_ajouter_divisions', reason: 'web DivisionModal.tsx' },
        ],
      },
      {
        name: 'Modifier une division',
        slug: 'divisions_modifier',
        aliases: [
          { slug: 'divisions_modifier_divisions', reason: 'web DivisionTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une division',
        slug: 'divisions_supprimer',
        aliases: [
          { slug: 'divisions_supprimer_divisions', reason: 'web DivisionTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Responsabilités',
    description: 'Référentiel des responsabilités occupables dans une structure.',
    permissions: [
      { name: 'Accéder au menu Responsabilités', slug: 'parametres_voir_menu_responsabilites' },
      { name: 'Consulter la liste des responsabilités', slug: 'responsabilites_voir' },
      {
        name: 'Créer une responsabilité',
        slug: 'responsabilites_creer',
        aliases: [
          { slug: 'responsabilites_ajouter_responsabilites', reason: 'web ResponsibilityModal.tsx' },
        ],
      },
      {
        name: 'Modifier une responsabilité',
        slug: 'responsabilites_modifier',
        aliases: [
          { slug: 'responsabilites_modifier_responsabilites', reason: 'web ResponsibilityTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une responsabilité',
        slug: 'responsabilites_supprimer',
        aliases: [
          { slug: 'responsabilites_supprimer_responsabilites', reason: 'web ResponsibilityTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Formations',
    description: 'Référentiel des formations et qualifications.',
    permissions: [
      { name: 'Accéder au menu Formations', slug: 'parametres_voir_menu_formations' },
      { name: 'Consulter la liste des formations / qualifications', slug: 'formations_voir' },
      {
        name: 'Créer une formation',
        slug: 'formations_creer',
        aliases: [
          { slug: 'formations_ajouter_formations', reason: 'web FormationModal.tsx' },
        ],
      },
      {
        name: 'Modifier une formation',
        slug: 'formations_modifier',
        aliases: [
          { slug: 'formations_modifier_formations', reason: 'web FormationTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une formation',
        slug: 'formations_supprimer',
        aliases: [
          { slug: 'formations_supprimer_formations', reason: 'web FormationTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Métiers',
    description: 'Référentiel des métiers.',
    permissions: [
      { name: 'Accéder au menu Métiers', slug: 'parametres_voir_menu_metiers' },
      { name: 'Consulter la liste des métiers', slug: 'metiers_voir' },
      {
        name: 'Créer un métier',
        slug: 'metiers_creer',
        aliases: [
          { slug: 'metiers_ajouter_metiers', reason: 'web JobModal.tsx' },
        ],
      },
      {
        name: 'Modifier un métier',
        slug: 'metiers_modifier',
        aliases: [
          { slug: 'metiers_modifier_metiers', reason: 'web JobTable.tsx' },
        ],
      },
      {
        name: 'Supprimer un métier',
        slug: 'metiers_supprimer',
        aliases: [
          { slug: 'metiers_supprimer_metiers', reason: 'web JobTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Localités de résidence',
    description: 'Référentiel des localités de résidence des membres.',
    permissions: [
      { name: 'Accéder au menu Localités de résidence', slug: 'parametres_voir_menu_localite_de_residences' },
      { name: 'Consulter la liste des localités', slug: 'villes_voir' },
      {
        name: 'Créer une localité',
        slug: 'villes_creer',
        aliases: [
          { slug: 'localite_de_residence_ajouter_localite_de_residences', reason: 'web CityModal.tsx' },
        ],
      },
      {
        name: 'Modifier une localité',
        slug: 'villes_modifier',
        aliases: [
          { slug: 'localite_de_residence_modifier_localite_de_residences', reason: 'web CityTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une localité',
        slug: 'villes_supprimer',
        aliases: [
          { slug: 'localite_de_residence_supprimer_localite_de_residences', reason: 'web CityTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Villes de l\'organisation',
    description: 'Référentiel des villes de l’organisation.',
    permissions: [
      {
        name: 'Accéder au menu Villes de l\'organisation',
        slug: 'villes_organisation_acceder_menu_villes_organisation',
      },
      { name: 'Consulter la liste des villes de l\'organisation', slug: 'villes_organisation_voir' },
      {
        name: 'Créer une ville d\'organisation',
        slug: 'villes_organisation_creer',
        aliases: [
          { slug: 'organisations_ajouter_organisations', reason: 'web OrganisationCityModal.tsx' },
        ],
      },
      {
        name: 'Modifier une ville d\'organisation',
        slug: 'villes_organisation_modifier',
        aliases: [
          { slug: 'organisations_modifier_organisations', reason: 'web OrganisationCityTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une ville d\'organisation',
        slug: 'villes_organisation_supprimer',
        aliases: [
          { slug: 'organisations_supprimer_organisations', reason: 'web OrganisationCityTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Pays',
    description: 'Référentiel des pays.',
    permissions: [
      { name: 'Accéder au menu Pays', slug: 'parametres_voir_menu_pays' },
      { name: 'Consulter la liste des pays', slug: 'pays_voir' },
      {
        name: 'Créer un pays',
        slug: 'pays_creer',
        aliases: [
          { slug: 'pays_ajouter_pays', reason: 'web CountryModal.tsx' },
        ],
      },
      {
        name: 'Modifier un pays',
        slug: 'pays_modifier',
        aliases: [
          { slug: 'pays_modifier_pays', reason: 'web CountryTable.tsx' },
        ],
      },
      {
        name: 'Supprimer un pays',
        slug: 'pays_supprimer',
        aliases: [
          { slug: 'pays_supprimer_pays', reason: 'web CountryTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Civilités',
    description: 'Référentiel des civilités.',
    permissions: [
      { name: 'Accéder au menu Civilités', slug: 'parametres_voir_menu_civilites' },
      { name: 'Consulter la liste des civilités', slug: 'civilites_voir' },
      {
        name: 'Créer une civilité (libellé, sigle, genre)',
        slug: 'civilites_creer',
        aliases: [
          { slug: 'civilites_ajouter_civilites', reason: 'web CivilityModal.tsx' },
        ],
      },
      {
        name: 'Modifier une civilité',
        slug: 'civilites_modifier',
        aliases: [
          { slug: 'civilites_modifier_civilites', reason: 'web CivilityTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une civilité',
        slug: 'civilites_supprimer',
        aliases: [
          { slug: 'civilites_supprimer_civilites', reason: 'web CivilityTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Situations matrimoniales',
    description: 'Référentiel des situations matrimoniales.',
    permissions: [
      {
        name: 'Accéder au menu Situations matrimoniales',
        slug: 'parametres_voir_menu_situation_matrimoniales',
      },
      { name: 'Consulter la liste des situations matrimoniales', slug: 'situations_matrimoniales_voir' },
      {
        name: 'Créer une situation matrimoniale',
        slug: 'situations_matrimoniales_creer',
        aliases: [
          { slug: 'situation_matrimoniales_ajouter_situation_matrimoniales', reason: 'web MaritalStatusModal.tsx' },
        ],
      },
      {
        name: 'Modifier une situation matrimoniale',
        slug: 'situations_matrimoniales_modifier',
        aliases: [
          { slug: 'situation_matrimoniales_modifier_situation_matrimoniales', reason: 'web MaritalStatusTable.tsx' },
        ],
      },
      {
        name: 'Supprimer une situation matrimoniale',
        slug: 'situations_matrimoniales_supprimer',
        aliases: [
          { slug: 'situation_matrimoniales_supprimer_situation_matrimoniales', reason: 'web MaritalStatusTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Accessoires',
    description: 'Référentiel des accessoires de pratique.',
    permissions: [
      { name: 'Accéder au menu Accessoires', slug: 'parametres_voir_menu_accessoires' },
      { name: 'Consulter la liste des accessoires de pratique', slug: 'accessoires_voir' },
      {
        name: 'Créer un accessoire',
        slug: 'accessoires_creer',
        aliases: [
          { slug: 'accessoires_ajouter_accessoires', reason: 'web AccessoryModal.tsx' },
        ],
      },
      {
        name: 'Modifier un accessoire',
        slug: 'accessoires_modifier',
        aliases: [
          { slug: 'accessoires_modifier_accessoires', reason: 'web AccessoryTable.tsx' },
        ],
      },
      {
        name: 'Supprimer un accessoire',
        slug: 'accessoires_supprimer',
        aliases: [
          { slug: 'accessoires_supprimer_accessoires', reason: 'web AccessoryTable.tsx' },
        ],
      },
    ],
  },
  {
    name: 'Paramètres généraux',
    description: 'Configurations générales de l’application, dont les fournisseurs SMS.',
    permissions: [
      { name: 'Accéder au menu Paramètres', slug: 'parametres_voir_menu_parametres' },
      { name: 'Consulter le bloc des configurations', slug: 'parametres_consulter_bloc_configurations' },
      {
        name: 'Consulter les paramètres SMS',
        slug: 'parametres_voir_sms',
        aliases: [
          { slug: 'parametres_voir_menu_sms', reason: 'web : entrée de menu « SMS » des paramètres' },
        ],
      },
      { name: 'Gérer les paramètres SMS', slug: 'parametres_gerer_sms' },
    ],
  },
];

/** Toutes les permissions à plat : entrées du .md + alias, avec leur module d'appartenance. */
export function listCatalogPermissions(): Array<{
  module: string;
  name: string;
  slug: string;
  description: string;
  isAlias: boolean;
}> {
  const lignes: Array<{ module: string; name: string; slug: string; description: string; isAlias: boolean }> = [];
  for (const mod of PERMISSION_CATALOG) {
    for (const p of mod.permissions) {
      lignes.push({
        module: mod.name,
        name: p.name,
        slug: p.slug,
        description: p.group ? `${mod.name} - ${p.group}` : mod.name,
        isAlias: false,
      });
      for (const a of p.aliases ?? []) {
        lignes.push({
          module: mod.name,
          name: `${p.name} (accès technique)`,
          slug: a.slug,
          description: `Alias technique de « ${p.name} ». ${a.reason}. Ne pas supprimer : la fonction se fermerait.`,
          isAlias: true,
        });
      }
    }
  }
  return lignes;
}

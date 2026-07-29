import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aligne les permissions de ROUTE sur les permissions de MENU déjà accordées.
 *
 * Le 2026-07-25, 248 routes ont reçu un `@RequirePermissions` et une politique d'ouverture
 * écrite à la main n'a couvert que 5 modules. Résultat vérifié en direct : pour un RESPONSABLE,
 * la sidebar affichait toujours Abonnements, Dons, Zones et Exports, mais toutes les routes
 * derrière renvoyaient **403** - et le bloc « Actions prioritaires » du tableau de bord cassait.
 *
 * Le défaut de la politique manuelle était sa source : mon jugement, au lieu de la configuration
 * réelle. Cette migration inverse le raisonnement - **le menu déjà actif fait foi**. Pour chaque
 * rôle, si le slug qui ouvre une entrée de menu est coché, alors les permissions de lecture des
 * routes servant cet écran le sont aussi. Par construction, aucun écran visible ne peut plus
 * renvoyer 403 : ce qui était accessible avant le verrouillage le reste.
 *
 * ⚠️ **Lectures uniquement.** Aucune permission `_creer` / `_modifier` / `_supprimer` n'est
 * accordée ici : l'administrateur les ouvre au cas par cas depuis Paramètres → Rôles.
 *
 * IDEMPOTENTE : ne coche que des liens à 0, n'en décoche aucun, n'en crée aucun.
 * `down()` est volontairement **sans effet** : impossible de distinguer ce que cette migration a
 * coché de ce qu'un administrateur a coché ensuite, et décocher à l'aveugle referme des écrans.
 */
export class AlignMenuAndRoutePermissions1782800500000
  implements MigrationInterface
{
  name = 'AlignMenuAndRoutePermissions1782800500000';

  /**
   * slug de menu (front : `web/config/menus.ts`) → permissions de lecture des routes servant
   * l'écran correspondant. Relevé écran par écran, pas déduit d'une convention de nommage.
   */
  private readonly implications: Array<[string, string[]]> = [
    ['dashboard_voir_menu_dashboard', [
      'statistiques_voir', 'structures_voir', 'membres_voir',
      // Le bloc « Actions prioritaires » du tableau de bord tape sur ces trois-là.
      'journal_reception_voir', 'abonnements_voir', 'dons_voir',
    ]],
    ['membres_voir_menu_liste_membres', ['membres_voir', 'structures_voir', 'niveaux_voir', 'membres_accessoires_voir', 'membres_voyages_voir', 'membres_responsabilites_voir']],
    ['membres_voir_menu_transferts', ['structures_voir', 'membres_voir']],
    ['abonnements_voir_menu_abonnements', ['abonnements_voir', 'abonnements_paiements_voir', 'paiements_voir']],
    ['donations_voir_menu_donations', ['dons_voir', 'dons_paiements_voir', 'paiements_voir']],
    ['exports_voir_menu_exports', ['structures_voir', 'membres_voir', 'paiements_voir']],
    ['activites_voir_menu_activites', ['activites_voir', 'types_activite_voir', 'membres_voir', 'structures_voir']],
    ['journals_voir_le_module_journal', ['journal_editions_voir', 'journal_zones_voir', 'journal_destinations_voir', 'journal_distribution_voir', 'journal_reception_voir']],
    ['zones_voir_menu_zones', ['journal_zones_voir', 'villes_voir']],
    ['parametres_voir_menu_roles', ['roles_voir_le_module_role', 'permissions_voir', 'modules_permissions_voir']],
    ['parametres_voir_menu_comites', ['comites_voir', 'roles_voir_le_module_role', 'niveaux_voir', 'membres_voir']],
    ['parametres_voir_menu_departements', ['departements_voir']],
    ['parametres_voir_menu_formations', ['formations_voir']],
    ['parametres_voir_menu_divisions', ['divisions_voir', 'departements_voir']],
    ['parametres_voir_menu_niveaux', ['niveaux_voir', 'villes_organisation_voir']],
    ['parametres_voir_menu_responsabilites', ['responsabilites_voir', 'niveaux_voir', 'roles_voir_le_module_role']],
    ['parametres_voir_menu_localite_de_residences', ['villes_voir', 'pays_voir']],
    ['parametres_voir_menu_civilites', ['civilites_voir']],
    ['parametres_voir_menu_metiers', ['metiers_voir']],
    ['parametres_voir_menu_pays', ['pays_voir']],
    ['parametres_voir_menu_situation_matrimoniales', ['situations_matrimoniales_voir']],
    ['parametres_voir_menu_accessoires', ['accessoires_voir']],
    ['parametres_voir_menu_structures', ['structures_voir', 'niveaux_voir']],
    ['parametres_voir_menu_modules_permissions', ['modules_permissions_voir', 'permissions_voir']],
  ];

  public async up(qr: QueryRunner): Promise<void> {
    for (const [slugMenu, slugsRoute] of this.implications) {
      // Rôles qui ouvrent effectivement cette entrée de menu.
      const roles: Array<{ role_uuid: string }> = await qr.query(
        `SELECT rp.role_uuid
           FROM roles_permissions rp
           JOIN permissions p ON p.uuid = rp.permission_uuid
          WHERE p.slug = ? AND rp.status = 1`,
        [slugMenu],
      );
      if (roles.length === 0) continue;

      await qr.query(
        `UPDATE roles_permissions rp
           JOIN permissions p ON p.uuid = rp.permission_uuid
            SET rp.status = 1
          WHERE rp.status = 0
            AND rp.role_uuid IN (?)
            AND p.slug IN (?)`,
        [roles.map((r) => r.role_uuid), slugsRoute],
      );
    }
  }

  public async down(): Promise<void> {
    // Sans effet : voir l'en-tête. Décocher à l'aveugle refermerait des écrans qu'un
    // administrateur a pu ouvrir volontairement depuis.
  }
}

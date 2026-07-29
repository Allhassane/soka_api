import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Les 3 permissions du transfert de membres (`docs/TRANSFERT-MEMBRES.md` §8).
 *
 * 🔒 `permissions` est une table PARTAGÉE entre tous les modules - cette migration n'y AJOUTE
 * que des lignes, n'en modifie ni n'en supprime aucune autre.
 *
 * Sans ces lignes la fonctionnalité est inutilisable sur un environnement neuf : un slug absent
 * de la table n'est porté par aucun rôle, donc `PermissionsGuard` refuse tout le monde sauf
 * `is_admin`.
 *
 * Conventions respectées :
 *  - le rattachement au module suit l'existant - les permissions `*_voir_menu_*` vont au module
 *    « Navigation », les permissions d'action au module « Membres ». Les uuid de modules sont
 *    RÉSOLUS depuis des permissions existantes plutôt que codés en dur (portable d'un
 *    environnement à l'autre).
 *  - aucun `UUID()` SQL (blocage binlog STATEMENT sur cette base) : les uuid sont générés côté
 *    Node et passés en paramètres.
 *
 * ⚠️ L'attribution de ces permissions aux rôles reste une décision d'administration, à faire
 * depuis l'écran Paramètres. Cette migration ne touche pas à `role_permissions`.
 */
export class AddMemberTransferPermissions1782500100000
  implements MigrationInterface
{
  name = 'AddMemberTransferPermissions1782500100000';

  /** slug, libellé, description, slug de référence d'où hériter le module. */
  private readonly permissions: Array<[string, string, string, string]> = [
    [
      'membres_voir_menu_transferts',
      'Membres Voir Menu Transferts',
      'Accéder au menu des transferts de membres',
      'membres_voir_menu_liste_membres',
    ],
    [
      'membres_initier_transfert',
      'Initier un transfert de membres',
      "Créer une demande de transfert de membres vers un autre district, et l'annuler",
      'membres_ajouter_un_membre',
    ],
    [
      'membres_approuver_transfert',
      'Approuver un transfert de membres',
      "Approuver ou refuser une demande de transfert arrivant sur son district, et choisir la structure d'accueil",
      'membres_ajouter_un_membre',
    ],
  ];

  private async moduleUuidOf(
    qr: QueryRunner,
    referenceSlug: string,
  ): Promise<string | null> {
    const rows = await qr.query(
      'SELECT module_uuid FROM `permissions` WHERE slug = ? LIMIT 1',
      [referenceSlug],
    );
    return rows[0]?.module_uuid ?? null;
  }

  public async up(qr: QueryRunner): Promise<void> {
    for (const [slug, name, description, referenceSlug] of this.permissions) {
      const existing = await qr.query(
        'SELECT 1 FROM `permissions` WHERE slug = ? LIMIT 1',
        [slug],
      );
      if (existing.length > 0) continue;

      const moduleUuid = await this.moduleUuidOf(qr, referenceSlug);

      await qr.query(
        'INSERT INTO `permissions` (`uuid`, `name`, `slug`, `description`, `module_uuid`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [randomUUID(), name, slug, description, moduleUuid],
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    const slugs = this.permissions.map(([slug]) => slug);

    // ⚠️ Deux pièges vérifiés en base sur cette table :
    //  1. elle s'appelle `roles_permissions` (pluriel des DEUX côtés) - cf.
    //     `@Entity('roles_permissions')` dans RolePermissionEntity ;
    //  2. ses colonnes `role_id` / `permission_id` valent **0 sur toutes les lignes** : le lien
    //     réel passe par `role_uuid` / `permission_uuid` (c'est ce que lit
    //     `RoleService.findGlobalPermissions`). Purger par `permission_id` ne supprimerait rien.
    await qr.query(
      'DELETE FROM `roles_permissions` WHERE `permission_uuid` IN (SELECT `uuid` FROM `permissions` WHERE `slug` IN (?, ?, ?))',
      slugs,
    );
    await qr.query('DELETE FROM `permissions` WHERE `slug` IN (?, ?, ?)', slugs);
  }
}

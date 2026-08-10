import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Les 3 permissions de la validation des enregistrements (`docs/VALIDATION-MEMBRES.md` §8).
 *
 * 🔒 `permissions` et `roles_permissions` sont des tables PARTAGÉES : cette migration n'y AJOUTE
 * que des lignes et **n'éteint jamais** un lien déjà actif.
 *
 * ⚠️ **Pourquoi une migration et pas `npm run seed:permissions`.** Le catalogue est bien la source
 * de vérité, mais au 2026-08-05 la base de dev est très en retard sur lui : un `seed:permissions`
 * y appliquerait **toute** la refonte du 2026-08-01 (+146 permissions, −11 slugs, +450 liens), donc
 * le travail en cours d'autres développeurs. Cette migration n'ajoute que les 3 lignes de cette
 * fonctionnalité ; le seed convergera le reste au merge global, sans conflit (upsert par slug).
 *
 * Conventions du repo respectées :
 *  - `module_uuid` **résolu** depuis une permission existante, jamais codé en dur (portable d'un
 *    environnement à l'autre) ;
 *  - aucun `UUID()` SQL - blocage binlog STATEMENT sur cette base : uuid générés côté Node ;
 *  - **un lien par rôle**, avec le `status` voulu. Sans ligne, la case de Paramètres → Rôles est
 *    **incochable** (« Aucun élément trouvé ») : c'est la dette laissée par
 *    `AddMemberTransferPermissions`, on ne la rejoue pas ici ;
 *  - `roles_permissions.role_id` / `permission_id` sont `NOT NULL` **sans défaut** et valent `0`
 *    sur toutes les lignes existantes : le lien réel passe par les `*_uuid`. On écrit donc 0.
 *
 * ⚠️ La permission ouvre l'écran ; elle ne désigne pas le signataire. Tous les responsables
 * partagent le rôle RESPONSABLE : c'est la règle R5 (niveau + ancre) qui décide qui signe quel
 * dossier, pas ce droit.
 */
export class AddMemberRegistrationPermissions1783000100000
  implements MigrationInterface
{
  name = 'AddMemberRegistrationPermissions1783000100000';

  /** slug, libellé, description, slug de référence d'où hériter le module. */
  private readonly permissions: Array<[string, string, string, string]> = [
    [
      'membres_voir_menu_validations',
      'Accéder au menu des dossiers à valider',
      "Voir l'écran des enregistrements de membres en attente de validation",
      'membres_voir_menu_liste_membres',
    ],
    [
      'membres_valider_district',
      'Valider un enregistrement au niveau district',
      "Signer ou refuser l'étape district d'un dossier d'enregistrement de membre",
      'membres_ajouter_un_membre',
    ],
    [
      'membres_valider_chapitre',
      'Valider un enregistrement au niveau chapitre',
      "Signer ou refuser l'étape chapitre d'un dossier d'enregistrement de membre",
      'membres_ajouter_un_membre',
    ],
  ];

  /** Rôles qui reçoivent le droit coché. Les autres reçoivent un lien décoché, pas rien. */
  private readonly rolesAccordes = ['ADMINISTRATEUR', 'RESPONSABLE'];

  public async up(qr: QueryRunner): Promise<void> {
    const roles: Array<{ uuid: string; name: string }> = await qr.query(
      'SELECT `uuid`, `name` FROM `roles` WHERE `deleted_at` IS NULL',
    );

    for (const [slug, name, description, referenceSlug] of this.permissions) {
      const existing: Array<{ uuid: string }> = await qr.query(
        'SELECT `uuid` FROM `permissions` WHERE `slug` = ? LIMIT 1',
        [slug],
      );

      let permissionUuid = existing[0]?.uuid;

      if (!permissionUuid) {
        const moduleRows = await qr.query(
          'SELECT `module_uuid` FROM `permissions` WHERE `slug` = ? LIMIT 1',
          [referenceSlug],
        );
        permissionUuid = randomUUID();

        await qr.query(
          'INSERT INTO `permissions` (`uuid`, `name`, `slug`, `description`, `module_uuid`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
          [
            permissionUuid,
            name,
            slug,
            description,
            moduleRows[0]?.module_uuid ?? null,
          ],
        );
      }

      for (const role of roles) {
        const lien = await qr.query(
          'SELECT `id`, `status` FROM `roles_permissions` WHERE `role_uuid` = ? AND `permission_uuid` = ? LIMIT 1',
          [role.uuid, permissionUuid],
        );

        const accorde = this.rolesAccordes.includes(role.name.toUpperCase());

        if (lien.length === 0) {
          await qr.query(
            'INSERT INTO `roles_permissions` (`uuid`, `role_uuid`, `permission_uuid`, `status`, `role_id`, `permission_id`) VALUES (?, ?, ?, ?, 0, 0)',
            [randomUUID(), role.uuid, permissionUuid, accorde ? 1 : 0],
          );
        } else if (accorde && Number(lien[0].status) === 0) {
          // Élargissement seulement : on n'éteint jamais un droit déjà accordé.
          await qr.query(
            'UPDATE `roles_permissions` SET `status` = 1 WHERE `id` = ?',
            [lien[0].id],
          );
        }
      }
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    const slugs = this.permissions.map(([slug]) => slug);
    const placeholders = slugs.map(() => '?').join(', ');

    await qr.query(
      `DELETE FROM \`roles_permissions\` WHERE \`permission_uuid\` IN (SELECT \`uuid\` FROM \`permissions\` WHERE \`slug\` IN (${placeholders}))`,
      slugs,
    );
    await qr.query(
      `DELETE FROM \`permissions\` WHERE \`slug\` IN (${placeholders})`,
      slugs,
    );
  }
}

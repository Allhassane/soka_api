import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';
import { ROLE_ADMIN_SLUG } from '../shared/constants/constants';
import {
  PARAMETRES_MODULE_NAME,
  PARAMETRES_MODULE_SLUG,
  PERM_GERER_SMS_NAME,
  PERM_PARAMETRES_GERER_SMS,
  PERM_PARAMETRES_VOIR_SMS,
  PERM_VOIR_SMS_NAME,
} from '../sms/sms.constants';

/**
 * Seed de la permission d'accès à la page « Paramètres SMS » et attribution au
 * rôle ADMINISTRATEUR.
 *
 * Pourquoi une migration : le `PermissionsGuard` ne contourne le contrôle que pour
 * `is_admin` (superadmin technique), PAS pour le rôle ADMINISTRATEUR. Sans cette
 * attribution, un ADMINISTRATEUR verrait la page mais recevrait 403. Le JWT ne
 * porte une permission QUE si elle est rattachée à un MODULE existant et liée au
 * rôle via `roles_permissions.status=1` (cf. RoleService.findGlobalPermissions).
 *
 * Faits vérifiés sur la base réelle (dump) - d'où la robustesse du SQL :
 *  - `roles.id` est CHAR(36) mais `roles_permissions.role_id`/`permission_id` sont
 *    INT NOT NULL : les lignes ADMINISTRATEUR existantes valent role_id=0/
 *    permission_id=0, le lien réel passant par role_uuid/permission_uuid. On copie
 *    donc 0/0 (ne JAMAIS injecter un char36 dans un INT -> erreur sous sql_mode
 *    STRICT -> avec migrationsRun:true, le boot prod AVORTERAIT).
 *  - `modules`/`permissions`/`roles_permissions` n'ont AUCUNE contrainte unique
 *    hors PK ; les `uuid` sont NOT NULL sans default -> on les génère en TS.
 *  - Les hooks @BeforeInsert (slug/uuid) NE s'exécutent PAS en SQL brut -> on
 *    fournit tout explicitement.
 *
 * Idempotente (chaque INSERT est précédé d'un test d'existence par slug / lien) et
 * gracieuse (no-op si le rôle ADMINISTRATEUR est absent sur cet environnement).
 */
export class SeedSmsParametrePermissions1782500100000
  implements MigrationInterface
{
  name = 'SeedSmsParametrePermissions1782500100000';

  private async scalar(
    qr: QueryRunner,
    sql: string,
    params: any[],
  ): Promise<string | null> {
    const rows = await qr.query(sql, params);
    if (!rows || rows.length === 0) return null;
    const first = rows[0];
    const key = Object.keys(first)[0];
    return first[key] ?? null;
  }

  /** Retourne l'uuid d'un module (créé si absent). */
  private async ensureModule(qr: QueryRunner): Promise<string> {
    const existing = await this.scalar(
      qr,
      'SELECT uuid FROM `modules` WHERE slug = ? LIMIT 1',
      [PARAMETRES_MODULE_SLUG],
    );
    if (existing) return existing;
    const uuid = randomUUID();
    await qr.query(
      'INSERT INTO `modules` (`uuid`, `name`, `slug`, `status`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [uuid, PARAMETRES_MODULE_NAME, PARAMETRES_MODULE_SLUG, 'enable'],
    );
    return uuid;
  }

  /** Retourne l'uuid d'une permission (créée si absente). */
  private async ensurePermission(
    qr: QueryRunner,
    moduleUuid: string,
    name: string,
    slug: string,
  ): Promise<string> {
    const existing = await this.scalar(
      qr,
      'SELECT uuid FROM `permissions` WHERE slug = ? LIMIT 1',
      [slug],
    );
    if (existing) return existing;
    const uuid = randomUUID();
    await qr.query(
      'INSERT INTO `permissions` (`uuid`, `name`, `module_uuid`, `slug`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [uuid, name, moduleUuid, slug],
    );
    return uuid;
  }

  /** Lie (ou réactive) une permission au rôle. role_id/permission_id = 0 (convention réelle). */
  private async linkToRole(
    qr: QueryRunner,
    roleUuid: string,
    permissionUuid: string,
  ): Promise<void> {
    const existing = await this.scalar(
      qr,
      'SELECT id FROM `roles_permissions` WHERE role_uuid = ? AND permission_uuid = ? LIMIT 1',
      [roleUuid, permissionUuid],
    );
    if (existing) {
      await qr.query(
        'UPDATE `roles_permissions` SET `status` = 1 WHERE role_uuid = ? AND permission_uuid = ?',
        [roleUuid, permissionUuid],
      );
      return;
    }
    await qr.query(
      'INSERT INTO `roles_permissions` (`uuid`, `role_uuid`, `permission_uuid`, `status`, `role_id`, `permission_id`) VALUES (?, ?, ?, 1, 0, 0)',
      [randomUUID(), roleUuid, permissionUuid],
    );
  }

  public async up(qr: QueryRunner): Promise<void> {
    const moduleUuid = await this.ensureModule(qr);
    const voirUuid = await this.ensurePermission(
      qr,
      moduleUuid,
      PERM_VOIR_SMS_NAME,
      PERM_PARAMETRES_VOIR_SMS,
    );
    const gererUuid = await this.ensurePermission(
      qr,
      moduleUuid,
      PERM_GERER_SMS_NAME,
      PERM_PARAMETRES_GERER_SMS,
    );

    const adminRoleUuid = await this.scalar(
      qr,
      'SELECT uuid FROM `roles` WHERE slug = ? LIMIT 1',
      [ROLE_ADMIN_SLUG],
    );
    if (!adminRoleUuid) {
      // Rôle ADMINISTRATEUR absent sur cet environnement : les permissions
      // existent et pourront être attribuées via l'UI. No-op gracieux.
      return;
    }
    await this.linkToRole(qr, adminRoleUuid, voirUuid);
    await this.linkToRole(qr, adminRoleUuid, gererUuid);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Détacher du/des rôle(s), supprimer les permissions, puis le module s'il est vide.
    await qr.query(
      'DELETE rp FROM `roles_permissions` rp JOIN `permissions` p ON p.uuid = rp.permission_uuid WHERE p.slug IN (?, ?)',
      [PERM_PARAMETRES_VOIR_SMS, PERM_PARAMETRES_GERER_SMS],
    );
    await qr.query('DELETE FROM `permissions` WHERE slug IN (?, ?)', [
      PERM_PARAMETRES_VOIR_SMS,
      PERM_PARAMETRES_GERER_SMS,
    ]);
    const moduleUuid = await this.scalar(
      qr,
      'SELECT uuid FROM `modules` WHERE slug = ? LIMIT 1',
      [PARAMETRES_MODULE_SLUG],
    );
    if (moduleUuid) {
      const remaining = await this.scalar(
        qr,
        'SELECT COUNT(*) AS c FROM `permissions` WHERE module_uuid = ?',
        [moduleUuid],
      );
      if (String(remaining) === '0') {
        await qr.query('DELETE FROM `modules` WHERE uuid = ?', [moduleUuid]);
      }
    }
  }
}

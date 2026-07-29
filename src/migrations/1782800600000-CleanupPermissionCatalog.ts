import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rattrape trois défauts introduits par le catalogue de permissions du 2026-07-25, tous
 * constatés lors de la vérification adversariale.
 *
 * **1. Quatre slugs SMS inventés.** Le manifeste déclarait `parametres_sms_consulter`,
 * `_modifier`, `_basculer`, `_tester` alors que `sms-settings.controller.ts` exige en réalité
 * `parametres_voir_sms` et `parametres_gerer_sms`. Le seed a donc créé 4 permissions que
 * **aucune route ne demande** : elles polluent l'écran des rôles et laissent croire à un droit
 * qui n'existe pas. On les supprime (avec leurs liens).
 *
 * **2. `membres_transferts_voir` faisait doublon** avec le slug historique
 * `membres_voir_menu_transferts`, seul exigé par `member-transfer.controller.ts`. Deux slugs
 * pour un même droit, dont un seul accordé.
 *
 * **3. Menu Transferts invisible pour tout le monde** : `membres_voir_menu_transferts` était à 0
 * sur les 4 rôles, alors que `membres_initier_transfert` / `membres_approuver_transfert` sont
 * accordés. Un rôle qui a le droit d'initier ou d'approuver un transfert doit voir l'écran.
 *
 * IDEMPOTENTE. `down()` sans effet : rétablir des slugs erronés n'a aucun intérêt.
 */
export class CleanupPermissionCatalog1782800600000
  implements MigrationInterface
{
  name = 'CleanupPermissionCatalog1782800600000';

  /** Slugs créés à tort : inexistants dans le code, donc exigés par aucune route. */
  private readonly parasites = [
    'parametres_sms_consulter',
    'parametres_sms_modifier',
    'parametres_sms_basculer',
    'parametres_sms_tester',
    'membres_transferts_voir',
  ];

  public async up(qr: QueryRunner): Promise<void> {
    // 1 + 2. Suppression des slugs parasites et de leurs liens.
    await qr.query(
      'DELETE rp FROM `roles_permissions` rp JOIN `permissions` p ON p.uuid = rp.permission_uuid WHERE p.slug IN (?)',
      [this.parasites],
    );
    await qr.query('DELETE FROM `permissions` WHERE `slug` IN (?)', [
      this.parasites,
    ]);

    // 3. Le droit de voir l'écran suit le droit d'agir dessus.
    await qr.query(
      `UPDATE roles_permissions rp
         JOIN permissions p ON p.uuid = rp.permission_uuid
          SET rp.status = 1
        WHERE p.slug = 'membres_voir_menu_transferts'
          AND rp.status = 0
          AND rp.role_uuid IN (
                SELECT role_uuid FROM (
                  SELECT rp2.role_uuid
                    FROM roles_permissions rp2
                    JOIN permissions p2 ON p2.uuid = rp2.permission_uuid
                   WHERE rp2.status = 1
                     AND p2.slug IN ('membres_initier_transfert', 'membres_approuver_transfert')
                ) AS r
              )`,
    );
  }

  public async down(): Promise<void> {
    // Sans effet : on ne recrée pas des slugs erronés.
  }
}

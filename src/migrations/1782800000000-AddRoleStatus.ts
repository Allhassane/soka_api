import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute `roles.status` - support de la désactivation/réactivation d'un rôle depuis
 * Paramètres → Rôles (`PATCH /roles/:uuid/status`).
 *
 * Pourquoi une colonne `status` et pas un soft delete : c'est la convention déjà en place sur
 * `modules`, `responsibilities` et `committees` (`varchar(36) NOT NULL DEFAULT 'enable'`), et
 * l'opération doit rester **réversible** depuis l'UI. `deleted_at` reste réservé à la suppression.
 *
 * ADDITIVE et NON-DESTRUCTIVE : aucune donnée n'est touchée. Le `DEFAULT 'enable'` renseigne
 * automatiquement les 3 lignes existantes (ADMINISTRATEUR / RESPONSABLE / MEMBRE), qui sont de
 * toute façon des rôles système non désactivables (`SYSTEM_ROLE_SLUGS`).
 *
 * Charset : on ne précise pas de `CHARACTER SET` - la colonne hérite du défaut de `roles`
 * (utf8mb4_unicode_ci). Toute comparaison future avec une autre colonne de `roles` reste donc
 * homogène (rappel : `committees` / `levels` sont en latin1, d'où les « Illegal mix of
 * collations » déjà rencontrés sur les jointures inter-tables).
 *
 * Idempotente : la colonne n'est ajoutée que si `information_schema` ne la voit pas déjà
 * (`migrationsRun: true` - une migration qui échoue bloque le démarrage de l'API).
 */
export class AddRoleStatus1782800000000 implements MigrationInterface {
  name = 'AddRoleStatus1782800000000';

  private async hasColumn(
    qr: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = await qr.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column],
    );
    return rows.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(qr, 'roles', 'status'))) {
      await qr.query(
        "ALTER TABLE `roles` ADD COLUMN `status` VARCHAR(36) NOT NULL DEFAULT 'enable'",
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.hasColumn(qr, 'roles', 'status')) {
      await qr.query('ALTER TABLE `roles` DROP COLUMN `status`');
    }
  }
}

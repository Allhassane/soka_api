import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Comités spécialisés (Digitalisation, Juridique, Dakko…) : responsable + membres.
 *
 * - Ajoute `committees.responsible_member_uuid` (membre désigné responsable, assigné
 *   par un admin depuis les Paramètres).
 * - Crée la table de liaison `committee_members` (many-to-many membre ↔ comité), avec
 *   contrainte d'unicité (committee_uuid, member_uuid) pour empêcher les doublons.
 *
 * N'ajoute qu'une colonne et une table neuves ; ne touche à aucune donnée existante.
 * Idempotente et réversible.
 */
export class CreateCommitteeMembersAndResponsible1782400000000
  implements MigrationInterface
{
  name = 'CreateCommitteeMembersAndResponsible1782400000000';

  private async hasTable(qr: QueryRunner, table: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    return r.length > 0;
  }

  private async hasColumn(
    qr: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(qr, 'committees', 'responsible_member_uuid'))) {
      await qr.query(
        `ALTER TABLE \`committees\` ADD COLUMN \`responsible_member_uuid\` CHAR(36) NULL AFTER \`admin_uuid\``,
      );
      await qr.query(
        `ALTER TABLE \`committees\` ADD INDEX \`IDX_committees_responsible\` (\`responsible_member_uuid\`)`,
      );
    }

    if (!(await this.hasTable(qr, 'committee_members'))) {
      await qr.query(`
        CREATE TABLE \`committee_members\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`uuid\` CHAR(36) NOT NULL,
          \`committee_uuid\` CHAR(36) NOT NULL,
          \`member_uuid\` CHAR(36) NOT NULL,
          \`admin_uuid\` CHAR(36) NOT NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          \`deleted_at\` DATETIME(6) NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`UQ_committee_members_uuid\` (\`uuid\`),
          UNIQUE INDEX \`uq_committee_member\` (\`committee_uuid\`, \`member_uuid\`),
          INDEX \`IDX_committee_members_committee\` (\`committee_uuid\`),
          INDEX \`IDX_committee_members_member\` (\`member_uuid\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.hasTable(qr, 'committee_members')) {
      await qr.query('DROP TABLE `committee_members`');
    }
    if (await this.hasColumn(qr, 'committees', 'responsible_member_uuid')) {
      await qr.query(
        `ALTER TABLE \`committees\` DROP INDEX \`IDX_committees_responsible\``,
      );
      await qr.query(
        `ALTER TABLE \`committees\` DROP COLUMN \`responsible_member_uuid\``,
      );
    }
  }
}

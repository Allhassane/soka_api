import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Réception structurelle d'une édition (cascade District → Membre) :
 *  - `journal_district_receptions` : réception du LOT d'un district (1/district),
 *    réceptionnaire = responsable du district (auto) ;
 *  - `journal_member_receptions`   : réception INDIVIDUELLE d'un membre (1/membre).
 *
 * Idempotent (`CREATE TABLE IF NOT EXISTS`). Aucune FK inter-tables (district_uuid /
 * member_uuid pointent vers structures/members d'autres collations) → insensible
 * aux collations, comme le reste du module journal.
 */
export class CreateJournalReception1781800000000 implements MigrationInterface {
  name = 'CreateJournalReception1781800000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `CREATE TABLE IF NOT EXISTS \`journal_district_receptions\` (
        \`created_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
        \`deleted_at\` datetime(6) DEFAULT NULL,
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`uuid\` char(36) NOT NULL,
        \`edition_uuid\` char(36) NOT NULL,
        \`district_uuid\` char(36) NOT NULL,
        \`district_name\` varchar(255) DEFAULT NULL,
        \`responsible_member_uuid\` char(36) DEFAULT NULL,
        \`responsible_name\` varchar(255) DEFAULT NULL,
        \`responsible_phone\` varchar(50) DEFAULT NULL,
        \`received_at\` datetime DEFAULT NULL,
        \`note\` text DEFAULT NULL,
        \`admin_uuid\` char(36) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_journal_district_reception_uuid\` (\`uuid\`),
        UNIQUE KEY \`uq_journal_district_reception\` (\`edition_uuid\`, \`district_uuid\`),
        KEY \`IDX_journal_district_reception_edition\` (\`edition_uuid\`),
        KEY \`IDX_journal_district_reception_district\` (\`district_uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    await qr.query(
      `CREATE TABLE IF NOT EXISTS \`journal_member_receptions\` (
        \`created_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
        \`deleted_at\` datetime(6) DEFAULT NULL,
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`uuid\` char(36) NOT NULL,
        \`edition_uuid\` char(36) NOT NULL,
        \`member_uuid\` char(36) NOT NULL,
        \`district_uuid\` char(36) DEFAULT NULL,
        \`received_at\` datetime DEFAULT NULL,
        \`admin_uuid\` char(36) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_journal_member_reception_uuid\` (\`uuid\`),
        UNIQUE KEY \`uq_journal_member_reception\` (\`edition_uuid\`, \`member_uuid\`),
        KEY \`IDX_journal_member_reception_edition\` (\`edition_uuid\`),
        KEY \`IDX_journal_member_reception_member\` (\`member_uuid\`),
        KEY \`IDX_journal_member_reception_district\` (\`district_uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS \`journal_member_receptions\``);
    await qr.query(`DROP TABLE IF EXISTS \`journal_district_receptions\``);
  }
}

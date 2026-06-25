import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute les index manquants sur les colonnes les plus filtrées du module Membre (audit P4).
 *
 * Contexte : aucune de ces colonnes n'était indexée alors qu'elles sont utilisées en
 * permanence (filtres de liste, COUNT de statistiques, résolution de responsabilité,
 * recherche de compte lié, vérification téléphone/email). `members.structure_uuid` est déjà
 * couvert par la FK `FK_members_structure_uuid` → non répété ici.
 *
 * ADDITIVE et NON-DESTRUCTIVE (index seulement, aucune donnée touchée). Idempotente :
 * chaque index n'est créé que s'il n'existe pas déjà.
 */
export class AddMemberModuleIndexes1782200100000
  implements MigrationInterface
{
  name = 'AddMemberModuleIndexes1782200100000';

  // [table, indexName, colonne]
  private readonly indexes: Array<[string, string, string]> = [
    ['members', 'IDX_members_department_uuid', 'department_uuid'],
    ['members', 'IDX_members_division_uuid', 'division_uuid'],
    ['members', 'IDX_members_phone', 'phone'],
    ['members', 'IDX_members_email', 'email'],
    ['member_responsibilities', 'IDX_member_resp_member_uuid', 'member_uuid'],
    ['member_responsibilities', 'IDX_member_resp_responsibility_uuid', 'responsibility_uuid'],
    ['users', 'IDX_users_member_uuid', 'member_uuid'],
    ['member_accessories', 'IDX_member_acc_member_uuid', 'member_uuid'],
    ['member_accessories', 'IDX_member_acc_accessory_uuid', 'accessory_uuid'],
  ];

  private async hasIndex(
    qr: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<boolean> {
    const rows = await qr.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, indexName],
    );
    return rows.length > 0;
  }

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
    for (const [table, indexName, column] of this.indexes) {
      if (
        (await this.hasColumn(qr, table, column)) &&
        !(await this.hasIndex(qr, table, indexName))
      ) {
        await qr.query(
          `CREATE INDEX \`${indexName}\` ON \`${table}\` (\`${column}\`)`,
        );
      }
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    for (const [table, indexName] of this.indexes) {
      if (await this.hasIndex(qr, table, indexName)) {
        await qr.query(`DROP INDEX \`${indexName}\` ON \`${table}\``);
      }
    }
  }
}

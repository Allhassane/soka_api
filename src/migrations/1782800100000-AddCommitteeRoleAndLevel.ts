import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un comité porte désormais un **rôle** (obligatoire à la création) et un **niveau** (facultatif),
 * sur le modèle de `responsibilities` qui porte déjà `role_uuid` + `level_uuid`.
 * ⚠️ `role_uuid` n'est PAS décoratif : depuis la fusion des droits (2026-07-25), tout membre listé
 * dans `committee_members` **hérite au login des permissions du rôle de son comité**
 * (`auth.service.ts` → `findCommitteeRoleUuids`). Changer le rôle d'un comité change donc les
 * droits de ses membres à leur prochaine connexion.
 *
 * **Collation.** Les deux colonnes sont déclarées en `latin1_general_ci`, comme le reste de
 * `committees` (`roles` est, lui, en `utf8mb4_unicode_ci`). Ce n'est pas un obstacle : MySQL
 * compare latin1 et utf8mb4 en convertissant vers utf8mb4, et la jointure `committees × roles`
 * est utilisée telle quelle. Le « Illegal mix of collations » déjà rencontré sur ce projet
 * opposait deux collations d'un MÊME charset (`utf8mb4_general_ci` vs `utf8mb4_unicode_ci`), cas
 * que MySQL ne sait pas trancher. `CommitteeService` résout tout de même rôle et niveau par
 * requêtes séparées et batchées (« pattern B »), pour éviter un N+1 sur la liste des comités.
 *
 * NULL autorisé : les comités déjà en base ne peuvent pas être backfillés (on ne sait pas quel
 * rôle leur attribuer). L'obligation porte sur le DTO de création, pas sur le schéma.
 * Pas de clé étrangère : le projet n'en pose pas sur ce type de lien (et une FK serait de toute
 * façon impossible entre deux collations différentes).
 *
 * ADDITIVE et NON-DESTRUCTIVE (deux colonnes + un index). Idempotente et réversible.
 */
export class AddCommitteeRoleAndLevel1782800100000
  implements MigrationInterface
{
  name = 'AddCommitteeRoleAndLevel1782800100000';

  private readonly table = 'committees';
  private readonly indexName = 'IDX_committees_role_uuid';

  private async hasColumn(
    qr: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column],
    );
    return r.length > 0;
  }

  private async hasIndex(
    qr: QueryRunner,
    table: string,
    indexName: string,
  ): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.STATISTICS
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, indexName],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    // Rôle de référence du comité - CHAR(36) comme `roles.uuid` côté longueur, mais en latin1
    // (collation de la table `committees`).
    if (!(await this.hasColumn(qr, this.table, 'role_uuid'))) {
      await qr.query(
        `ALTER TABLE \`${this.table}\` ADD COLUMN \`role_uuid\` CHAR(36)
         CHARACTER SET latin1 COLLATE latin1_general_ci NULL
         AFTER \`responsible_member_uuid\``,
      );
    }

    // Niveau de référence (facultatif) - VARCHAR(36) pour coller à `levels.uuid` (varchar).
    if (!(await this.hasColumn(qr, this.table, 'level_uuid'))) {
      await qr.query(
        `ALTER TABLE \`${this.table}\` ADD COLUMN \`level_uuid\` VARCHAR(36)
         CHARACTER SET latin1 COLLATE latin1_general_ci NULL
         AFTER \`role_uuid\``,
      );
    }

    // Index simple sur `role_uuid` : c'est la colonne filtrée (« quels comités pour ce rôle ? »).
    // Rien sur `level_uuid`, facultatif et non filtré aujourd'hui.
    if (
      (await this.hasColumn(qr, this.table, 'role_uuid')) &&
      !(await this.hasIndex(qr, this.table, this.indexName))
    ) {
      await qr.query(
        `CREATE INDEX \`${this.indexName}\` ON \`${this.table}\` (\`role_uuid\`)`,
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.hasIndex(qr, this.table, this.indexName)) {
      await qr.query(
        `DROP INDEX \`${this.indexName}\` ON \`${this.table}\``,
      );
    }
    if (await this.hasColumn(qr, this.table, 'level_uuid')) {
      await qr.query(
        `ALTER TABLE \`${this.table}\` DROP COLUMN \`level_uuid\``,
      );
    }
    if (await this.hasColumn(qr, this.table, 'role_uuid')) {
      await qr.query(
        `ALTER TABLE \`${this.table}\` DROP COLUMN \`role_uuid\``,
      );
    }
  }
}

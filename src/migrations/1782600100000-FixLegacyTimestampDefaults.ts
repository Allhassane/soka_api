import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `created_at` / `updated_at` restaient **NULL** sur tout membre et tout compte créés par
 * l'application (constaté le 2026-07-24 : 0 date sur les créations du jour, et **7664 lignes
 * `users` sur 7664** sans date de création).
 *
 * **Cause** - lue dans le source de TypeORM (`query-builder/InsertQueryBuilder.js`), où le
 * traitement des colonnes de date est explicitement désactivé :
 *
 * ```js
 * // for create and update dates we insert current date
 * // no, we don't do it because this constant is already in "default" value of the column
 * // } else if (column.isCreateDate || column.isUpdateDate) {
 * //     return "CURRENT_TIMESTAMP";
 * ```
 *
 * Autrement dit `@CreateDateColumn` / `@UpdateDateColumn` (`DateTimeEntity`) **n'écrivent
 * rien** : ils délèguent au `DEFAULT` de la colonne. Les tables créées par migration l'ont
 * (`datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)` - cf. `member_transfers`,
 * `member_responsibilities`), mais les tables **héritées** sont en `timestamp NULL DEFAULT
 * NULL` : l'INSERT omet la colonne, MySQL écrit NULL. Comme `synchronize` est OFF, l'écart
 * entre l'entité et le schéma réel n'a jamais été rattrapé, et il est resté invisible tant que
 * les lignes venaient de l'import (qui, lui, fournissait les dates explicitement).
 *
 * 🔒 `users` est une table **partagée** (module auth) : ce changement est purement additif - il
 * ne fait que remplir une colonne qui restait vide, aucune ligne existante n'est réécrite.
 *
 * ⚠️ **Pas de backfill.** Les lignes déjà en base gardent `created_at = NULL` : inventer une
 * date de création serait de la donnée fausse, plus nuisible qu'une donnée absente.
 *
 * ⚠️ **Effet de `ON UPDATE CURRENT_TIMESTAMP`** : `updated_at` sera désormais rafraîchi par
 * MySQL à chaque UPDATE, y compris ceux des autres modules qui ne le positionnaient pas. C'est
 * la sémantique attendue de la colonne, et celle qu'ont déjà les tables issues de migrations.
 * Un UPDATE qui fournit explicitement `updated_at` (c'est le cas de `MemberService.update`)
 * garde sa valeur.
 */
export class FixLegacyTimestampDefaults1782600100000 implements MigrationInterface {
  name = 'FixLegacyTimestampDefaults1782600100000';

  /** Tables héritées dont les colonnes de date n'ont pas de DEFAULT. */
  private readonly tables = ['members', 'users'];

  /** Le DEFAULT est-il déjà posé ? (migration idempotente, comme le reste du dossier) */
  private async hasDefault(
    qr: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = await qr.query(
      `SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return !!rows[0]?.COLUMN_DEFAULT;
  }

  private async tableExists(qr: QueryRunner, table: string): Promise<boolean> {
    return qr.hasTable(table);
  }

  public async up(qr: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      if (!(await this.tableExists(qr, table))) continue;

      if (!(await this.hasDefault(qr, table, 'created_at'))) {
        await qr.query(
          `ALTER TABLE \`${table}\` MODIFY \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP`,
        );
      }

      if (!(await this.hasDefault(qr, table, 'updated_at'))) {
        await qr.query(
          `ALTER TABLE \`${table}\` MODIFY \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
        );
      }
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Retour à l'état d'origine : colonnes nullables sans défaut.
    for (const table of this.tables) {
      if (!(await this.tableExists(qr, table))) continue;

      await qr.query(
        `ALTER TABLE \`${table}\` MODIFY \`created_at\` TIMESTAMP NULL DEFAULT NULL`,
      );
      await qr.query(
        `ALTER TABLE \`${table}\` MODIFY \`updated_at\` TIMESTAMP NULL DEFAULT NULL`,
      );
    }
  }
}

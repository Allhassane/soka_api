import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration INTÉGRITÉ — hiérarchie (étape 4 du MODELE-CIBLE).
 *
 * Restaure la hiérarchie depuis les données déjà présentes (sans ETL) puis pose l'intégrité :
 *  1) `structures.uuid` <- `id` (l'id char(36) EST l'uuid métier) ; `parent_uuid` <- `parent_id`.
 *  2) nettoyage des parents orphelins.
 *  3) index unique sur `structures.uuid` + FK self-ref `parent_uuid` et FK `members.structure_uuid`.
 *  4) table de fermeture `structure_closure` (sous-arbre/ancêtres en 1 requête) + peuplement.
 *  5) table dénormalisée `structure_stats` (peuplée ultérieurement par un job).
 *
 * Idempotente et non-destructive (UPDATE déterministes, pas de UUID() → pas de souci binlog).
 * Les FK des autres `*_uuid` de members (country, civility…) sont reportées à une migration
 * POST-ETL (ces colonnes sont encore vides aujourd'hui).
 */
export class AddHierarchyIntegrity1781360000000 implements MigrationInterface {
  name = 'AddHierarchyIntegrity1781360000000';

  private async hasIndex(qr: QueryRunner, table: string, index: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, index],
    );
    return r.length > 0;
  }
  private async hasFk(qr: QueryRunner, table: string, fk: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?
         AND constraint_type = 'FOREIGN KEY' LIMIT 1`,
      [table, fk],
    );
    return r.length > 0;
  }
  private async hasTable(qr: QueryRunner, table: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    // 1) Restaurer uuid + parent_uuid depuis les colonnes existantes (déterministe, sûr).
    await qr.query("UPDATE `structures` SET `uuid` = `id` WHERE `uuid` IS NULL");
    const hasParentId = await qr.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'structures' AND column_name = 'parent_id' LIMIT 1`,
    );
    if (hasParentId.length > 0) {
      await qr.query(
        "UPDATE `structures` SET `parent_uuid` = `parent_id` WHERE `parent_uuid` IS NULL AND `parent_id` IS NOT NULL",
      );
    }
    // 2) Nettoyer les parents orphelins (sinon la FK self-ref échoue).
    await qr.query(
      "UPDATE `structures` s LEFT JOIN `structures` p ON s.`parent_uuid` = p.`uuid` " +
        "SET s.`parent_uuid` = NULL WHERE s.`parent_uuid` IS NOT NULL AND p.`uuid` IS NULL",
    );
    // Nettoyer les members.structure_uuid orphelins (par sécurité avant la FK).
    await qr.query(
      "UPDATE `members` m LEFT JOIN `structures` s ON m.`structure_uuid` = s.`uuid` " +
        "SET m.`structure_uuid` = NULL WHERE m.`structure_uuid` IS NOT NULL AND s.`uuid` IS NULL",
    );

    // 3) Index unique sur structures.uuid (cible des FK).
    if (!(await this.hasIndex(qr, 'structures', 'UQ_structures_uuid'))) {
      await qr.query("ALTER TABLE `structures` ADD UNIQUE INDEX `UQ_structures_uuid` (`uuid`)");
    }
    // FK self-référente parent_uuid -> structures.uuid (anti-orphelin, SET NULL à la suppression).
    if (!(await this.hasFk(qr, 'structures', 'FK_structures_parent_uuid'))) {
      await qr.query(
        "ALTER TABLE `structures` ADD CONSTRAINT `FK_structures_parent_uuid` " +
          "FOREIGN KEY (`parent_uuid`) REFERENCES `structures`(`uuid`) ON DELETE SET NULL ON UPDATE CASCADE",
      );
    }
    // FK members.structure_uuid -> structures.uuid (RESTRICT : on ne supprime pas une structure avec des membres).
    if (!(await this.hasFk(qr, 'members', 'FK_members_structure_uuid'))) {
      await qr.query(
        "ALTER TABLE `members` ADD CONSTRAINT `FK_members_structure_uuid` " +
          "FOREIGN KEY (`structure_uuid`) REFERENCES `structures`(`uuid`) ON DELETE RESTRICT ON UPDATE CASCADE",
      );
    }

    // 4) Table de fermeture + peuplement (sous-arbre/ancêtres en 1 requête indexée).
    if (!(await this.hasTable(qr, 'structure_closure'))) {
      await qr.query(
        "CREATE TABLE `structure_closure` (" +
          "`ancestor_uuid` char(36) NOT NULL, `descendant_uuid` char(36) NOT NULL, `depth` int NOT NULL, " +
          "PRIMARY KEY (`ancestor_uuid`, `descendant_uuid`), KEY `IDX_closure_descendant` (`descendant_uuid`)" +
          ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      );
    }
    await qr.query("DELETE FROM `structure_closure`");
    await qr.query(
      "INSERT INTO `structure_closure` (`ancestor_uuid`, `descendant_uuid`, `depth`) " +
        "WITH RECURSIVE tree AS (" +
        "  SELECT `uuid` AS ancestor, `uuid` AS descendant, 0 AS depth FROM `structures` " +
        "  WHERE `deleted_at` IS NULL AND `uuid` IS NOT NULL " +
        "  UNION ALL " +
        "  SELECT t.ancestor, s.`uuid`, t.depth + 1 FROM tree t " +
        "  JOIN `structures` s ON s.`parent_uuid` = t.descendant AND s.`deleted_at` IS NULL " +
        ") SELECT ancestor, descendant, depth FROM tree",
    );
    // FK de la closure vers structures (cohérence + purge auto).
    if (!(await this.hasFk(qr, 'structure_closure', 'FK_closure_ancestor'))) {
      await qr.query(
        "ALTER TABLE `structure_closure` ADD CONSTRAINT `FK_closure_ancestor` " +
          "FOREIGN KEY (`ancestor_uuid`) REFERENCES `structures`(`uuid`) ON DELETE CASCADE ON UPDATE CASCADE",
      );
    }
    if (!(await this.hasFk(qr, 'structure_closure', 'FK_closure_descendant'))) {
      await qr.query(
        "ALTER TABLE `structure_closure` ADD CONSTRAINT `FK_closure_descendant` " +
          "FOREIGN KEY (`descendant_uuid`) REFERENCES `structures`(`uuid`) ON DELETE CASCADE ON UPDATE CASCADE",
      );
    }

    // 5) Table de stats dénormalisée (peuplée par un job ultérieur).
    if (!(await this.hasTable(qr, 'structure_stats'))) {
      await qr.query(
        "CREATE TABLE `structure_stats` (" +
          "`structure_uuid` char(36) NOT NULL, `total_members` int NOT NULL DEFAULT 0, " +
          "`total_men` int NOT NULL DEFAULT 0, `total_women` int NOT NULL DEFAULT 0, " +
          "`total_youth` int NOT NULL DEFAULT 0, `total_subgroups` int NOT NULL DEFAULT 0, " +
          "`computed_at` datetime(6) NULL, PRIMARY KEY (`structure_uuid`), " +
          "CONSTRAINT `FK_stats_structure` FOREIGN KEY (`structure_uuid`) " +
          "REFERENCES `structures`(`uuid`) ON DELETE CASCADE ON UPDATE CASCADE" +
          ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.hasTable(qr, 'structure_stats')) await qr.query('DROP TABLE `structure_stats`');
    if (await this.hasTable(qr, 'structure_closure')) await qr.query('DROP TABLE `structure_closure`');
    if (await this.hasFk(qr, 'members', 'FK_members_structure_uuid')) {
      await qr.query('ALTER TABLE `members` DROP FOREIGN KEY `FK_members_structure_uuid`');
    }
    if (await this.hasFk(qr, 'structures', 'FK_structures_parent_uuid')) {
      await qr.query('ALTER TABLE `structures` DROP FOREIGN KEY `FK_structures_parent_uuid`');
    }
    if (await this.hasIndex(qr, 'structures', 'UQ_structures_uuid')) {
      await qr.query('ALTER TABLE `structures` DROP INDEX `UQ_structures_uuid`');
    }
    // On ne dé-peuple pas uuid/parent_uuid (données restaurées, conservées).
  }
}

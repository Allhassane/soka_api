import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration ADDITIVE et NON-DESTRUCTIVE — alignement minimal du schéma sur les entités.
 *
 * Contexte : la base de prod ressemble à `soka_db.sql` (incomplète mais AVEC des données).
 * On NE peut donc PAS dropper/recréer. Cette migration ajoute UNIQUEMENT les colonnes
 * manquantes (cf. AUDIT-SCHEMA-2026-06-13 : members, structures, jobs, divisions, departments)
 * en NULL (ou avec défaut sûr), SANS toucher aux clés primaires, types existants, collations,
 * ni ajouter de contraintes FK (réservées à une migration ultérieure, après nettoyage des données).
 *
 * Idempotente : chaque colonne n'est ajoutée que si elle n'existe pas déjà (gère la divergence
 * local/prod, ex. `deleted_at` déjà posé en dev). Aucune instruction `UUID()` (évite le blocage
 * binlog STATEMENT). La population des données (uuid, FK…) relève de l'ETL (étape suivante).
 *
 * ⚠ NE PAS confondre avec la migration auto-générée par `migration:generate`, qui était destructrice
 * (DROP de created_at/updated_at, recréation des PK, UUID() par défaut, FK sur données sales).
 */
export class AddMissingColumns1781355870712 implements MigrationInterface {
  name = 'AddMissingColumns1781355870712';

  // [table, colonne, définition SQL]
  private readonly columns: Array<[string, string, string]> = [
    // --- members (31 colonnes de données manquantes) ---
    ['members', 'firstname', "varchar(100) COLLATE utf8mb4_unicode_ci NULL"],
    ['members', 'lastname', "varchar(100) COLLATE utf8mb4_unicode_ci NULL"],
    ['members', 'civility_uuid', 'varchar(50) NULL'],
    ['members', 'marital_status_uuid', 'varchar(50) NULL'],
    ['members', 'spouse_name', "varchar(100) COLLATE utf8mb4_unicode_ci NULL"],
    ['members', 'location', "varchar(100) COLLATE utf8mb4_unicode_ci NULL"],
    ['members', 'spouse_member', 'tinyint NOT NULL DEFAULT 0'],
    ['members', 'childrens', 'int NOT NULL DEFAULT 0'],
    ['members', 'country_uuid', 'char(36) NULL'],
    ['members', 'city_uuid', 'char(36) NULL'],
    ['members', 'town', 'varchar(191) NULL'],
    ['members', 'longitude', 'varchar(50) NULL'],
    ['members', 'latitude', 'varchar(50) NULL'],
    ['members', 'formation_uuid', 'char(36) NULL'],
    ['members', 'job_uuid', 'char(36) NULL'],
    ['members', 'phone', 'varchar(30) NULL'],
    ['members', 'phone_whatsapp', 'varchar(30) NULL'],
    ['members', 'tutor_name', 'varchar(100) NULL'],
    ['members', 'tutor_phone', 'varchar(30) NULL'],
    ['members', 'organisation_city_uuid', 'char(36) NULL'],
    ['members', 'membership_date', 'date NULL'],
    ['members', 'department_uuid', 'char(36) NULL'],
    ['members', 'division_uuid', 'char(36) NULL'],
    ['members', 'has_gohonzon', 'tinyint NOT NULL DEFAULT 0'],
    ['members', 'date_gohonzon', 'date NULL'],
    ['members', 'has_tokusso', 'tinyint NOT NULL DEFAULT 0'],
    ['members', 'date_tokusso', 'date NULL'],
    ['members', 'has_omamori', 'tinyint NOT NULL DEFAULT 0'],
    ['members', 'date_omamori', 'date NULL'],
    ['members', 'admin_uuid', 'varchar(36) NULL'],
    ['members', 'status', "varchar(36) NOT NULL DEFAULT 'enable'"],

    // --- structures (la hiérarchie) ---
    ['structures', 'uuid', 'char(36) NULL'],
    ['structures', 'parent_uuid', 'varchar(36) NULL'],
    ['structures', 'level_uuid', 'varchar(36) NULL'],
    ['structures', 'level_id', 'int NULL'],
    ['structures', 'admin_uuid', 'varchar(36) NULL'],

    // --- jobs ---
    ['jobs', 'uuid', 'char(36) NULL'],
    ['jobs', 'name', 'varchar(255) NULL'],
    ['jobs', 'slug', 'varchar(255) NULL'],
    ['jobs', 'admin_uuid', 'varchar(36) NULL'],
    ['jobs', 'status', "varchar(36) NOT NULL DEFAULT 'enable'"],

    // --- divisions ---
    ['divisions', 'slug', 'varchar(191) NULL'],
    ['divisions', 'description', 'text NULL'],
    ['divisions', 'department_uuid', 'char(36) NULL'],
    ['divisions', 'department_id', 'int NULL'],
    ['divisions', 'gender', "varchar(10) NOT NULL DEFAULT 'mixte'"],
    ['divisions', 'admin_uuid', 'varchar(255) NULL'],

    // --- departments ---
    ['departments', 'slug', 'varchar(255) NULL'],
    ['departments', 'description', 'text NULL'],
    ['departments', 'gender', "varchar(10) NOT NULL DEFAULT 'mixte'"],
    ['departments', 'admin_uuid', 'varchar(36) NULL'],

    // --- soft-delete manquant (idempotent : ignoré si déjà présent) ---
    ['members', 'deleted_at', 'datetime(6) NULL'],
    ['structures', 'deleted_at', 'datetime(6) NULL'],
    ['departments', 'deleted_at', 'datetime(6) NULL'],
    ['divisions', 'deleted_at', 'datetime(6) NULL'],
  ];

  private async hasColumn(qr: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows = await qr.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column],
    );
    return rows.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    for (const [table, column, definition] of this.columns) {
      if (!(await this.hasColumn(qr, table, column))) {
        await qr.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      }
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    // On ne supprime QUE les colonnes de données ajoutées (on conserve les `deleted_at`).
    for (const [table, column] of [...this.columns].reverse()) {
      if (column === 'deleted_at') continue;
      if (await this.hasColumn(qr, table, column)) {
        await qr.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
      }
    }
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration ADDITIVE et NON-DESTRUCTIVE — schéma du module Journal.
 *
 * Crée les tables du module (zones, destinations, éditions, distributions),
 * la table de liaison zone↔villes, et les colonnes « responsable de zone ».
 *
 * Conçue pour le DÉPLOIEMENT EN LIGNE (prod) où aucune table journal n'existe,
 * ET pour les environnements partiellement migrés (local) :
 *  - `CREATE TABLE IF NOT EXISTS` → ne recrée jamais une table existante ;
 *  - ajout de colonnes gardé par `information_schema` → idempotent ;
 *  - PAS de `UUID()` par défaut (l'app génère l'uuid via @BeforeInsert ; évite
 *    le blocage binlog STATEMENT déjà rencontré sur cette base) ;
 *  - PAS de contrainte FK (cohérent avec le reste du schéma migré).
 *
 * Collation utf8mb4_unicode_ci pour des jointures propres avec members.uuid /
 * structures.uuid / subscriptions.uuid / cities.uuid (déjà alignés).
 */
export class CreateJournalModule1781400000000 implements MigrationInterface {
  name = 'CreateJournalModule1781400000000';

  // Liste des valeurs de l'enum GlobalStatus (statut générique).
  private readonly globalStatusEnum =
    "enum('created','started','stopped','canceled','completed','deleted','archived','pending','init','success','accepted','fail')";

  private createTables(): string[] {
    const G = this.globalStatusEnum;
    return [
      // ---------------- journal_zones (avec responsable) ----------------
      `CREATE TABLE IF NOT EXISTS \`journal_zones\` (
        \`created_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
        \`deleted_at\` datetime(6) DEFAULT NULL,
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`uuid\` char(36) NOT NULL,
        \`number\` int NOT NULL,
        \`name\` varchar(191) NOT NULL,
        \`structure_uuid\` char(36) DEFAULT NULL,
        \`responsible_member_uuid\` char(36) DEFAULT NULL,
        \`responsible_phone\` varchar(30) DEFAULT NULL,
        \`responsible_phone_whatsapp\` varchar(30) DEFAULT NULL,
        \`history\` longtext DEFAULT NULL,
        \`admin_uuid\` char(36) NOT NULL,
        \`status\` ${G} NOT NULL DEFAULT 'created',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_journal_zones_uuid\` (\`uuid\`),
        KEY \`IDX_journal_zones_number\` (\`number\`),
        KEY \`IDX_journal_zones_structure\` (\`structure_uuid\`),
        KEY \`IDX_journal_zones_responsible\` (\`responsible_member_uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // ---------------- journal_destinations ----------------
      `CREATE TABLE IF NOT EXISTS \`journal_destinations\` (
        \`created_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
        \`deleted_at\` datetime(6) DEFAULT NULL,
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`uuid\` char(36) NOT NULL,
        \`zone_uuid\` char(36) NOT NULL,
        \`name\` varchar(191) NOT NULL,
        \`ville\` varchar(191) DEFAULT NULL,
        \`quartier\` varchar(191) DEFAULT NULL,
        \`correspondent_member_uuid\` char(36) DEFAULT NULL,
        \`correspondent_phone\` varchar(30) DEFAULT NULL,
        \`correspondent_phone_whatsapp\` varchar(30) DEFAULT NULL,
        \`nvx_id\` int NOT NULL DEFAULT 0,
        \`abonnes_12_mois\` int NOT NULL DEFAULT 0,
        \`total_abonnes\` int NOT NULL DEFAULT 0,
        \`history\` longtext DEFAULT NULL,
        \`admin_uuid\` char(36) NOT NULL,
        \`status\` ${G} NOT NULL DEFAULT 'created',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_journal_destinations_uuid\` (\`uuid\`),
        KEY \`IDX_journal_destinations_zone\` (\`zone_uuid\`),
        KEY \`IDX_journal_destinations_correspondent\` (\`correspondent_member_uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // ---------------- journal_editions ----------------
      `CREATE TABLE IF NOT EXISTS \`journal_editions\` (
        \`created_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
        \`deleted_at\` datetime(6) DEFAULT NULL,
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`uuid\` char(36) NOT NULL,
        \`number\` int NOT NULL,
        \`title\` varchar(191) NOT NULL,
        \`month\` int NOT NULL,
        \`year\` int NOT NULL,
        \`subscription_uuid\` char(36) DEFAULT NULL,
        \`distribution_start_at\` datetime NOT NULL,
        \`distribution_deadline_at\` datetime NOT NULL,
        \`total_printed\` int NOT NULL DEFAULT 0,
        \`history\` longtext DEFAULT NULL,
        \`admin_uuid\` char(36) NOT NULL,
        \`status\` ${G} NOT NULL DEFAULT 'created',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_journal_editions_uuid\` (\`uuid\`),
        KEY \`IDX_journal_editions_number\` (\`number\`),
        KEY \`IDX_journal_editions_subscription\` (\`subscription_uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // ---------------- journal_distributions ----------------
      `CREATE TABLE IF NOT EXISTS \`journal_distributions\` (
        \`created_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
        \`deleted_at\` datetime(6) DEFAULT NULL,
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`uuid\` char(36) NOT NULL,
        \`edition_uuid\` char(36) NOT NULL,
        \`zone_uuid\` char(36) NOT NULL,
        \`expected_quantity\` int NOT NULL DEFAULT 0,
        \`sent_quantity\` int NOT NULL DEFAULT 0,
        \`delivered_quantity\` int NOT NULL DEFAULT 0,
        \`status\` enum('pending','notified','in_progress','delivered','late','canceled') NOT NULL DEFAULT 'pending',
        \`channel\` enum('sms','whatsapp') NOT NULL DEFAULT 'sms',
        \`notified_at\` datetime DEFAULT NULL,
        \`sent_at\` datetime DEFAULT NULL,
        \`delivered_at\` datetime DEFAULT NULL,
        \`last_message\` text DEFAULT NULL,
        \`retry_count\` int NOT NULL DEFAULT 0,
        \`history\` longtext DEFAULT NULL,
        \`admin_uuid\` char(36) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_journal_distributions_uuid\` (\`uuid\`),
        KEY \`IDX_journal_distributions_edition\` (\`edition_uuid\`),
        KEY \`IDX_journal_distributions_zone\` (\`zone_uuid\`),
        UNIQUE KEY \`UQ_journal_distributions_edition_zone\` (\`edition_uuid\`,\`zone_uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

      // ---------------- journal_zone_cities (liaison zone↔villes) ----------------
      `CREATE TABLE IF NOT EXISTS \`journal_zone_cities\` (
        \`created_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
        \`deleted_at\` datetime(6) DEFAULT NULL,
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`uuid\` char(36) NOT NULL,
        \`zone_uuid\` char(36) NOT NULL,
        \`city_uuid\` char(36) NOT NULL,
        \`admin_uuid\` char(36) DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_journal_zone_cities_uuid\` (\`uuid\`),
        KEY \`IDX_jzc_zone\` (\`zone_uuid\`),
        KEY \`IDX_jzc_city\` (\`city_uuid\`),
        UNIQUE KEY \`UQ_jzc_zone_city\` (\`zone_uuid\`,\`city_uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ];
  }

  // Colonnes « responsable » à garantir sur journal_zones si la table préexistait
  // sans elles (cas des environnements migrés à la main).
  private readonly zoneResponsibleColumns: Array<[string, string]> = [
    [
      'responsible_member_uuid',
      'char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL',
    ],
    ['responsible_phone', 'varchar(30) DEFAULT NULL'],
    ['responsible_phone_whatsapp', 'varchar(30) DEFAULT NULL'],
  ];

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

  private async hasIndex(
    qr: QueryRunner,
    table: string,
    index: string,
  ): Promise<boolean> {
    const rows = await qr.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, index],
    );
    return rows.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    // 1) Tables (no-op si déjà présentes).
    for (const sql of this.createTables()) {
      await qr.query(sql);
    }

    // 2) Colonnes « responsable » sur journal_zones si absentes (table préexistante).
    for (const [column, definition] of this.zoneResponsibleColumns) {
      if (!(await this.hasColumn(qr, 'journal_zones', column))) {
        await qr.query(
          `ALTER TABLE \`journal_zones\` ADD COLUMN \`${column}\` ${definition}`,
        );
      }
    }
    if (!(await this.hasIndex(qr, 'journal_zones', 'IDX_journal_zones_responsible'))) {
      await qr.query(
        'ALTER TABLE `journal_zones` ADD KEY `IDX_journal_zones_responsible` (`responsible_member_uuid`)',
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Revert = suppression du schéma du module (ordre inverse des dépendances).
    await qr.query('DROP TABLE IF EXISTS `journal_zone_cities`');
    await qr.query('DROP TABLE IF EXISTS `journal_distributions`');
    await qr.query('DROP TABLE IF EXISTS `journal_editions`');
    await qr.query('DROP TABLE IF EXISTS `journal_destinations`');
    await qr.query('DROP TABLE IF EXISTS `journal_zones`');
  }
}

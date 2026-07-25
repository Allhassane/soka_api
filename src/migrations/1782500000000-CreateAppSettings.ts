import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  SETTING_SMS_ACTIVE_PROVIDER,
  SETTING_SMS_FAILOVER_ENABLED,
  settingProviderEnabledKey,
  SMS_PROVIDER_LETEXTO,
  SMS_PROVIDER_SMSPRO,
  SMS_DEFAULT_ACTIVE_PROVIDER,
} from '../sms/sms.constants';

/**
 * Table de réglages runtime `app_settings` (clé/valeur) + seed des toggles SMS.
 *
 * `synchronize` étant OFF, c'est le SEUL moyen de créer la table. Module isolé :
 * cette migration n'ajoute QU'UNE table neuve, ne touche à aucune table existante.
 *
 * Idempotente (CREATE si absente ; seed en `INSERT IGNORE` rejoué sans clobber des
 * valeurs déjà choisies par un admin) et réversible (DROP au revert).
 */
export class CreateAppSettings1782500000000 implements MigrationInterface {
  name = 'CreateAppSettings1782500000000';

  private async hasTable(qr: QueryRunner, table: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await this.hasTable(qr, 'app_settings'))) {
      await qr.query(`
        CREATE TABLE \`app_settings\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`uuid\` CHAR(36) NOT NULL DEFAULT (UUID()),
          \`setting_key\` VARCHAR(191) NOT NULL,
          \`setting_value\` TEXT NULL,
          \`type\` VARCHAR(16) NOT NULL DEFAULT 'string',
          \`description\` VARCHAR(255) NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          \`deleted_at\` DATETIME(6) NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`UQ_app_settings_uuid\` (\`uuid\`),
          UNIQUE INDEX \`UQ_app_settings_key\` (\`setting_key\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // Seed idempotent (exécuté même si la table préexiste ; ne clobbe pas une
    // valeur déjà positionnée grâce à INSERT IGNORE sur la clé unique).
    const seeds: Array<[string, string, string, string]> = [
      [
        SETTING_SMS_ACTIVE_PROVIDER,
        SMS_DEFAULT_ACTIVE_PROVIDER,
        'string',
        'Fournisseur SMS actif pour les envois transactionnels (auth).',
      ],
      [
        settingProviderEnabledKey(SMS_PROVIDER_LETEXTO),
        'true',
        'boolean',
        'Fournisseur LeTexto activé (éligible comme actif / cible de repli).',
      ],
      [
        settingProviderEnabledKey(SMS_PROVIDER_SMSPRO),
        'true',
        'boolean',
        'Fournisseur SMSPro Africa activé (éligible comme actif / cible de repli).',
      ],
      [
        SETTING_SMS_FAILOVER_ENABLED,
        'true',
        'boolean',
        'Repli automatique borné sur l’autre fournisseur si l’actif échoue.',
      ],
    ];
    for (const [key, value, type, description] of seeds) {
      await qr.query(
        `INSERT IGNORE INTO \`app_settings\` (\`uuid\`, \`setting_key\`, \`setting_value\`, \`type\`, \`description\`) VALUES (UUID(), ?, ?, ?, ?)`,
        [key, value, type, description],
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.hasTable(qr, 'app_settings')) {
      await qr.query('DROP TABLE `app_settings`');
    }
  }
}

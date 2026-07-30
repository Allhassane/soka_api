import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  SETTING_SMS_ACTIVE_PROVIDER,
  settingProviderEnabledKey,
  SMS_PROVIDER_LETEXTO,
  SMS_PROVIDER_SMSPRO,
} from '../sms/sms.constants';

/**
 * Bascule le fournisseur SMS actif de LeTexto vers **SMSPro Africa**.
 *
 * **Pourquoi une migration alors que le défaut est passé dans le `.env` ?**
 * `CreateAppSettings` a semé une ligne `sms.active_provider = 'letexto'` en base,
 * et la base est le niveau le plus fort de la hiérarchie de décision (cf.
 * `sms/sms.constants.ts`). Sans cette bascule, poser `SMS_ACTIVE_PROVIDER=smspro`
 * dans le `.env` n'aurait **aucun effet** sur les bases déjà migrées : le
 * fallback n'est lu que si la ligne est absente.
 *
 * **Pourquoi c'est sans risque d'écraser une décision humaine.** L'`UPDATE` ne
 * touche la ligne que si elle vaut encore exactement `letexto`, la valeur du
 * seed. Et à ce jour l'écran d'administration SMS n'existe pas côté web
 * (`parametre/sms` absent) : aucun administrateur n'a jamais pu changer cette
 * valeur, elle ne peut donc porter que le seed.
 *
 * Idempotente (un second passage ne trouve plus `letexto`) et réversible.
 */
export class SetSmsproAsDefaultProvider1782800900000
  implements MigrationInterface
{
  name = 'SetSmsproAsDefaultProvider1782800900000';

  private async hasTable(qr: QueryRunner, table: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    // Base neuve : `CreateAppSettings` (timestamp antérieur) sème déjà SMSPro
    // puisque la constante de défaut a changé. Rien à rattraper.
    if (!(await this.hasTable(qr, 'app_settings'))) return;

    // Un fournisseur ACTIF mais désactivé ne peut rien envoyer, et
    // `SmsSettingsService.setActiveProvider` refuse d'ailleurs cette
    // combinaison : on garantit l'invariant avant de basculer.
    await qr.query(
      `UPDATE \`app_settings\` SET \`setting_value\` = 'true'
       WHERE \`setting_key\` = ? AND \`setting_value\` <> 'true'`,
      [settingProviderEnabledKey(SMS_PROVIDER_SMSPRO)],
    );

    await qr.query(
      `UPDATE \`app_settings\` SET \`setting_value\` = ?
       WHERE \`setting_key\` = ? AND \`setting_value\` = ?`,
      [SMS_PROVIDER_SMSPRO, SETTING_SMS_ACTIVE_PROVIDER, SMS_PROVIDER_LETEXTO],
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (!(await this.hasTable(qr, 'app_settings'))) return;
    // Retour à l'état d'avant : uniquement si la valeur est bien celle que
    // cette migration a posée (on ne défait pas un choix ultérieur).
    await qr.query(
      `UPDATE \`app_settings\` SET \`setting_value\` = ?
       WHERE \`setting_key\` = ? AND \`setting_value\` = ?`,
      [SMS_PROVIDER_LETEXTO, SETTING_SMS_ACTIVE_PROVIDER, SMS_PROVIDER_SMSPRO],
    );
  }
}

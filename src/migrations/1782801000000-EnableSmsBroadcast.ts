import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  SETTING_SMS_BROADCAST_ENABLED,
  settingProviderEnabledKey,
  SMS_PROVIDER_LETEXTO,
  SMS_PROVIDER_SMSPRO,
} from '../sms/sms.constants';

/**
 * Active le mode **DIFFUSION** : chaque SMS transactionnel (1re connexion / mot
 * de passe oublié) part par **LeTexto ET SMSPro à la fois** - le membre reçoit
 * donc deux SMS portant le même mot de passe.
 *
 * **Pourquoi une migration et pas seulement le `.env` ?** `app_settings` est le
 * niveau le plus fort de la hiérarchie de décision (cf. `sms/sms.constants.ts`) :
 * sur une base déjà migrée, la ligne existe (ou est créée ici) et le `.env`
 * `SMS_BROADCAST_ENABLED` ne serait plus lu. Le seul moyen fiable d'imposer le
 * mode sur les environnements existants est d'écrire la ligne.
 *
 * Elle **réactive aussi les deux fournisseurs** : la diffusion n'envoie que par
 * les fournisseurs marqués `enabled` en base, un toggle resté à `false`
 * annulerait silencieusement le second SMS. (Le `*_ENABLED` du `.env` - crédentiels
 * et autorisation d'envoi réel - reste, lui, une condition indépendante.)
 *
 * Idempotente (INSERT IGNORE + UPDATE conditionnels) et réversible : le `down`
 * repasse en mode aiguillage sans toucher aux toggles fournisseurs, qui étaient
 * déjà `true` dans le seed d'origine.
 */
export class EnableSmsBroadcast1782801000000 implements MigrationInterface {
  name = 'EnableSmsBroadcast1782801000000';

  private async hasTable(qr: QueryRunner, table: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await this.hasTable(qr, 'app_settings'))) return;

    await qr.query(
      `INSERT IGNORE INTO \`app_settings\` (\`uuid\`, \`setting_key\`, \`setting_value\`, \`type\`, \`description\`)
       VALUES (UUID(), ?, 'true', 'boolean', ?)`,
      [
        SETTING_SMS_BROADCAST_ENABLED,
        'Diffusion : envoi de chaque SMS transactionnel par TOUS les fournisseurs activés (le membre reçoit 2 SMS).',
      ],
    );

    // La ligne peut préexister à 'false' (bascule manuelle, ou seed futur) :
    // cette migration a pour objet d'imposer la diffusion, on force la valeur.
    await qr.query(
      `UPDATE \`app_settings\` SET \`setting_value\` = 'true', \`type\` = 'boolean'
       WHERE \`setting_key\` = ? AND \`setting_value\` <> 'true'`,
      [SETTING_SMS_BROADCAST_ENABLED],
    );

    // Sans les deux toggles à 'true', la diffusion n'enverrait qu'un seul SMS.
    for (const provider of [SMS_PROVIDER_LETEXTO, SMS_PROVIDER_SMSPRO]) {
      await qr.query(
        `UPDATE \`app_settings\` SET \`setting_value\` = 'true'
         WHERE \`setting_key\` = ? AND \`setting_value\` <> 'true'`,
        [settingProviderEnabledKey(provider)],
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (!(await this.hasTable(qr, 'app_settings'))) return;
    await qr.query(
      `UPDATE \`app_settings\` SET \`setting_value\` = 'false'
       WHERE \`setting_key\` = ? AND \`setting_value\` = 'true'`,
      [SETTING_SMS_BROADCAST_ENABLED],
    );
  }
}

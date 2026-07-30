import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from 'src/shared/enums/app-env.enum';
import {
  isSmsProviderName,
  SMS_DEFAULT_ACTIVE_PROVIDER,
  type SmsProviderName,
} from 'src/sms/sms.constants';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return this.config.get<number>('APP_PORT') ?? 3000;
  }

  get host(): string {
    return this.config.get<string>('APP_HOST') ?? 'localhost';
  }

  get appUrl(): string {
    return `http://${this.host}:${this.port}/`;
  }

  get jwtSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in the environment');
    }
    return secret;
  }

  get jwtExpiresIn(): string {
    return this.config.get<string>('JWT_EXPIRES_IN') ?? '3600';
  }

  get dbUser(): string {
    return this.config.get<string>('DB_USER') ?? 'root';
  }

  get dbPassword(): string {
    return this.config.get<string>('DB_PASSWORD') ?? '';
  }

  get dbHost(): string {
    return this.config.get<string>('DB_HOST') ?? 'localhost';
  }

  get dbPort(): number {
    return Number(this.config.get<number>('DB_PORT') ?? 3306);
  }

  get dbName(): string {
    return this.config.get<string>('DB_NAME') ?? 'soka_db';
  }

  get nodeEnv(): AppEnv {
    return this.config.get<AppEnv>('APP_ENV', AppEnv.DEVELOPMENT);
  }

  get isProd(): boolean {
    return this.nodeEnv === AppEnv.PRODUCTION;
  }

  // --- SOKA Pay (microservice de paiement HUB2) ---

  get sokaPayBaseUrl(): string {
    return (this.config.get<string>('SOKA_PAY_BASE_URL') ?? 'http://localhost:3001').replace(/\/+$/, '');
  }

  get sokaPayApiKey(): string {
    return this.config.get<string>('SOKA_PAY_API_KEY') ?? '';
  }

  get sokaPayWebhookSecret(): string {
    return this.config.get<string>('SOKA_PAY_WEBHOOK_SECRET') ?? '';
  }

  /** URL de réception des callbacks SOKA Pay (défaut : route webhook de cette API). */
  get sokaPayCallbackUrl(): string {
    const explicit = this.config.get<string>('SOKA_PAY_CALLBACK_URL');
    if (explicit && explicit.trim()) return explicit.trim();
    return `${this.appUrl}api/webhooks/soka-pay`;
  }

  // --- SMS transactionnel ---

  /**
   * Fournisseur SMS par défaut, lu dans `.env` (`SMS_ACTIVE_PROVIDER`).
   *
   * **Point de résolution UNIQUE** : `SmsDispatcher` et `SmsSettingsService`
   * doivent tous deux passer par ici, sinon l'aiguilleur et l'écran de
   * paramètres peuvent afficher/utiliser deux fournisseurs différents.
   *
   * Une valeur inconnue retombe sur `SMS_DEFAULT_ACTIVE_PROVIDER` plutôt que de
   * bloquer le démarrage : un envoi de mot de passe ne doit jamais dépendre
   * d'une faute de frappe dans le `.env`. (Le schéma Joi refuse déjà les
   * valeurs hors liste ; cette garde couvre le cas où la validation est
   * contournée, par exemple en test.)
   */
  get smsDefaultProvider(): SmsProviderName {
    const raw = (this.config.get<string>('SMS_ACTIVE_PROVIDER') ?? '')
      .trim()
      .toLowerCase();
    return isSmsProviderName(raw) ? raw : SMS_DEFAULT_ACTIVE_PROVIDER;
  }
}

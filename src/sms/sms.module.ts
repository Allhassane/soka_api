import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SettingsModule } from 'src/settings/settings.module';
import { SmsService } from './sms.service';
import { LetextoSmsProvider } from './providers/letexto-sms.provider';
import { SmspproSmsProvider } from './providers/smspro-sms.provider';
import { SMS_PROVIDERS } from './sms-providers.token';
import { SmsProviderRegistry } from './sms-provider.registry';
import { SmsDispatcher } from './sms-dispatcher.service';
import { SmsSettingsService } from './sms-settings.service';
import { SmsSettingsController } from './sms-settings.controller';

/**
 * Sous-système SMS transactionnel (auth : 1re connexion + mot de passe oublié).
 *
 * Unifie LeTexto et SMSPro sous `ManagedSmsProvider`, avec un aiguilleur
 * (`SmsDispatcher`) qui lit le fournisseur actif en base (`SettingsService`) et
 * applique le failover - bascule à chaud sans redéploiement. Distinct du
 * sous-système de notifications du module Journal (TextO), qui reste inchangé.
 *
 * `SmsService` (LeTexto historique) est conservé le temps de valider le dispatcher
 * en prod (rollback possible), puis sera retiré.
 */
@Module({
  imports: [ConfigModule, SettingsModule],
  controllers: [SmsSettingsController],
  providers: [
    SmsService,
    LetextoSmsProvider,
    SmspproSmsProvider,
    {
      provide: SMS_PROVIDERS,
      useFactory: (letexto: LetextoSmsProvider, smspro: SmspproSmsProvider) => [
        letexto,
        smspro,
      ],
      inject: [LetextoSmsProvider, SmspproSmsProvider],
    },
    SmsProviderRegistry,
    SmsDispatcher,
    SmsSettingsService,
  ],
  exports: [SmsDispatcher, SmsService],
})
export class SmsModule {}

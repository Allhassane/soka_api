import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';

/**
 * Module SMS (LeTexto). À importer dans AuthModule (lot C) pour la 1re connexion
 * et le mot de passe oublié. Découplé du sous-système de notifications du module Journal.
 */
@Module({
  imports: [ConfigModule],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}

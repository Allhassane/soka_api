import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from './entities/app-setting.entity';
import { SettingsService } from './settings.service';

/**
 * Réglages runtime génériques (clé/valeur). Fournit `SettingsService`, réutilisable
 * au-delà du SMS. `AppSetting` est chargée via `autoLoadEntities` (dev) et le glob
 * des entités compilées (prod) - aucun enregistrement racine requis.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}

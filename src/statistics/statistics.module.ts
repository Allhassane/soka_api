import { Module } from '@nestjs/common';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

/**
 * Module Statistiques - volet MEMBRES (2026-08-19).
 *
 * Aucun `TypeOrmModule.forFeature` : le service travaille en **SQL agrégé** sur la
 * `DataSource` (injectée par `@InjectDataSource`), jamais par des entités chargées en
 * mémoire. C'est délibéré - un `find()` sur 8 000 membres pour en compter les femmes
 * serait absurde, et enregistrer les entités ici laisserait croire que le module peut
 * écrire. **Il ne peut pas** : il n'expose que des `GET`.
 *
 * Le journal de connexion (`login_logs`) est lu en SQL brut pour la même raison, et pour
 * éviter un cycle de modules : c'est `AuthModule` qui l'écrit.
 */
@Module({
  controllers: [StatisticsController],
  providers: [StatisticsService],
  exports: [StatisticsService],
})
export class StatisticsModule {}

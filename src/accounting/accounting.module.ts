import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonateEntity } from 'src/donate/entities/donate.entity';
import { PaymentEntity } from 'src/payments/entities/payment.entity';
import { PaymentModule } from 'src/payments/payment.module';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { ExportJobModule } from 'src/export-async/export-job.module';
import { AccountingController } from './accounting.controller';
import { AccountingExportController } from './accounting-export.controller';
import { AccountingExportService } from './accounting-export.service';
import { AccountingStatsController } from './accounting-stats.controller';
import { AccountingService } from './accounting.service';
import { AccHubSnapshotEntity } from './entities/acc-hub-snapshot.entity';
import { AccHubSnapshotLineEntity } from './entities/acc-hub-snapshot-line.entity';

/**
 * Module Comptabilité - concordance « Solde HUB2 = Solde App » + tableau de bord.
 *
 * 🚨 **`PaymentEntity`, `SubscriptionEntity` et `DonateEntity` sont enregistrées ici en LECTURE
 * seule.** Le module n'appelle jamais `PaymentService`, et aucune de ses méthodes n'écrit dans
 * ces tables : il n'a le droit d'écrire que dans ses propres tables `acc_*`. Le jour où
 * quelqu'un voudra « corriger » un paiement depuis cet écran, c'est cette règle qu'il faudra
 * discuter, pas contourner.
 *
 * `HubService` vient de `PaymentModule` (qui l'exporte) plutôt que d'être réinstancié : un second
 * client du guichet finirait par diverger sur le timeout, la clé et l'URL.
 *
 * ⚠️ **`ExportJobModule` est la seule écriture hors `acc_*`, et elle est déléguée** : le module
 * pose des lignes dans `export_jobs` (suivi des exports lancés depuis l'écran) **via le service
 * du module qui possède cette table**, jamais en direct. La règle qui compte tient : le module
 * Comptabilité n'écrit toujours RIEN dans `payments`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccHubSnapshotEntity,
      AccHubSnapshotLineEntity,
      PaymentEntity,
      SubscriptionEntity,
      DonateEntity,
    ]),
    PaymentModule,
    // Le suivi des jobs d'export appartient au module qui possède `export_jobs`.
    ExportJobModule,
  ],
  controllers: [AccountingController, AccountingStatsController, AccountingExportController],
  providers: [AccountingService, AccountingExportService],
  exports: [AccountingService],
})
export class AccountingModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonateEntity } from 'src/donate/entities/donate.entity';
import { PaymentEntity } from 'src/payments/entities/payment.entity';
import { PaymentModule } from 'src/payments/payment.module';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { AccountingController } from './accounting.controller';
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
  ],
  controllers: [AccountingController, AccountingStatsController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}

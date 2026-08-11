import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from 'src/payments/entities/payment.entity';
import { PaymentModule } from 'src/payments/payment.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';
import { AccHubSnapshotEntity } from './entities/acc-hub-snapshot.entity';
import { AccHubSnapshotLineEntity } from './entities/acc-hub-snapshot-line.entity';

/**
 * Module Comptabilité - première tranche : la concordance « Solde HUB2 = Solde App ».
 *
 * 🚨 **`PaymentEntity` est enregistrée ici en LECTURE seule.** Le module n'appelle jamais
 * `PaymentService`, et aucune de ses méthodes n'écrit dans `payments` : il n'a le droit d'écrire
 * que dans ses propres tables `acc_*`. Le jour où quelqu'un voudra « corriger » un paiement
 * depuis cet écran, c'est cette règle qu'il faudra discuter, pas contourner.
 *
 * `HubService` vient de `PaymentModule` (qui l'exporte) plutôt que d'être réinstancié : un second
 * client du guichet finirait par diverger sur le timeout, la clé et l'URL.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AccHubSnapshotEntity, AccHubSnapshotLineEntity, PaymentEntity]),
    PaymentModule,
  ],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}

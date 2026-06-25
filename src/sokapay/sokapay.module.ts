import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from 'src/config/config.module';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { SokaPayTransactionEntity } from './entities/sokapay-transaction.entity';
import { SokaPayController, SokaPayWebhookController } from './sokapay.controller';
import { SokaPayService } from './sokapay.service';

/**
 * Module d'intégration SOKA Pay (HUB2), 100 % isolé du reste de l'API SOKA.
 * - `HttpModule` : appels server-to-server vers l'API marchande SOKA Pay.
 * - `TypeOrmModule.forFeature` : table de liaison `sokapay_transactions` (+ accès
 *   en écriture au statut des cotisations `subscription_payments` au règlement).
 */
@Module({
  imports: [
    HttpModule,
    AppConfigModule,
    TypeOrmModule.forFeature([SokaPayTransactionEntity, SubscriptionPaymentEntity]),
  ],
  controllers: [SokaPayController, SokaPayWebhookController],
  providers: [SokaPayService],
  exports: [SokaPayService],
})
export class SokaPayModule {}

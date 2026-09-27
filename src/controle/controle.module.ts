import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from 'src/payments/entities/payment.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { ControleController } from './controle.controller';
import { ControleService } from './controle.service';

/**
 * Module Contrôle - cohérence paiements collectés / abonnés / journaux.
 *
 * 🚨 `PaymentEntity`, `SubscriptionEntity` et `StructureEntity` sont enregistrées en LECTURE : le
 * module n'écrit nulle part. `AccessScopeService` (sous-arbre d'une région) est `@Global`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([PaymentEntity, SubscriptionEntity, StructureEntity])],
  controllers: [ControleController],
  providers: [ControleService],
})
export class ControleModule {}

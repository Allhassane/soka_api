import { Module } from '@nestjs/common';
import { SubscriptionPaymentController } from './subscription-payment.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionPaymentEntity } from './entities/subscription-payment.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { UserModule } from 'src/users/user.module';
import { User } from 'src/users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { PaymentModule } from 'src/payments/payment.module';
import { DonateEntity } from 'src/donate/entities/donate.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { SubscriptionPaymentService } from './subscription-payment.service';

@Module({
  imports: [TypeOrmModule.forFeature(
    [
      SubscriptionPaymentEntity,
      User,
      MemberEntity,
      DonateEntity,
      SubscriptionEntity
    ]),LogActivitiesModule,UserModule,PaymentModule],
  controllers: [SubscriptionPaymentController],
  providers: [SubscriptionPaymentService],
  exports: [SubscriptionPaymentService]
})
export class SubscriptionPaymentModule {}

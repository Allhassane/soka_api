import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentEntity } from './entities/payment.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';
import { MemberEntity } from 'src/members/entities/member.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { DonateEntity } from 'src/donate/entities/donate.entity';
import { CinetPayService } from './cinetpay.service';
import { DonatePaymentEntity } from 'src/donate-payment/entities/donate-payment.entity';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { StructureModule } from 'src/structure/structure.module';
import { ExportJobModule } from '../export-async/export-job.module';


@Module({
  imports: [TypeOrmModule.forFeature([
      PaymentEntity,
      User,
      MemberEntity,
      SubscriptionEntity,
      DonateEntity,
      DonatePaymentEntity,
      SubscriptionPaymentEntity,
  ]),LogActivitiesModule,UserModule,StructureModule,ExportJobModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    CinetPayService
  ],
  exports: [PaymentService],
})
export class PaymentModule {}

import { Module } from '@nestjs/common';
import { DonatePaymentController } from './subscription-payment.controller';
import { DonatePaymentService } from './subscription-payment.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonatePaymentEntity } from './entities/subscription-payment.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { UserModule } from 'src/users/user.module';
import { User } from 'src/users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { PaymentModule } from 'src/payments/payment.module';
import { DonateEntity } from 'src/donate/entities/donate.entity';

@Module({
  imports: [TypeOrmModule.forFeature(
    [
      DonatePaymentEntity,
      User,
      MemberEntity,
      DonateEntity
    ]),LogActivitiesModule,UserModule,PaymentModule],
  controllers: [DonatePaymentController],
  providers: [DonatePaymentService],
})
export class DonatePaymentModule {}

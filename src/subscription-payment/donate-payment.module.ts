import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { UserModule } from 'src/users/user.module';
import { User } from 'src/users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { PaymentModule } from 'src/payments/payment.module';
import { DonateEntity } from 'src/donate/entities/donate.entity';
import { DonatePaymentEntity } from 'src/donate-payment/entities/donate-payment.entity';
import { DonatePaymentController } from 'src/donate-payment/donate-payment.controller';
import { DonatePaymentService } from 'src/donate-payment/donate-payment.service';

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
  exports: [DonatePaymentService]
})
export class DonatePaymentModule {}

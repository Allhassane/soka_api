// src/export-job/export-job.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportJobEntity } from './entities/export-job.entity';
import { ExportJobService } from './export-job.service';
import { ExportProcessorService } from './export-processor.service';
import { PaymentEntity } from '../payments/entities/payment.entity' //'src/payment/entities/payment.entity';
import { DonatePaymentEntity } from 'src/donate-payment/entities/donate-payment.entity';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { MemberEntity } from '../members/entities/member.entity'; //'src/member/entities/member.entity';
import { User } from '../users/entities/user.entity'; //'src/user/entities/user.entity';
import { StructureModule } from 'src/structure/structure.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExportJobEntity,
      PaymentEntity,
      DonatePaymentEntity,
      SubscriptionPaymentEntity,
      MemberEntity,
      User,
    ]),
    forwardRef(() => StructureModule),

  ],

  providers: [ExportJobService, ExportProcessorService],
  exports: [ExportJobService, ExportProcessorService],
})
export class ExportJobModule {}

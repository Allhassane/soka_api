import { Module } from '@nestjs/common';
import { DonateController } from './donate.controller';
import { DonateService } from './donate.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonateEntity } from './entities/donate.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { UserModule } from 'src/users/user.module';
import { User } from 'src/users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { PaymentModule } from 'src/payments/payment.module';

@Module({
  imports: [TypeOrmModule.forFeature([DonateEntity,User,MemberEntity]),LogActivitiesModule,UserModule,PaymentModule],
  controllers: [DonateController],
  providers: [DonateService],
})
export class DonateModule {}

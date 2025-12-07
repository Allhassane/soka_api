import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionEntity } from './entities/subscription.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { StructureModule } from 'src/structure/structure.module';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionEntity,User,SubscriptionPaymentEntity]),LogActivitiesModule,UserModule,StructureModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}

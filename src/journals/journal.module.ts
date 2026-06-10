import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalZoneEntity } from './entities/journal-zone.entity';
import { JournalDestinationEntity } from './entities/journal-destination.entity';
import { JournalEditionEntity } from './entities/journal-edition.entity';
import { JournalDistributionEntity } from './entities/journal-distribution.entity';
import { JournalZoneService } from './journal-zone.service';
import { JournalDestinationService } from './journal-destination.service';
import { JournalEditionService } from './journal-edition.service';
import { JournalDistributionService } from './journal-distribution.service';
import { JournalZoneController } from './journal-zone.controller';
import { JournalDestinationController } from './journal-destination.controller';
import { JournalEditionController } from './journal-edition.controller';
import { JournalDistributionController } from './journal-distribution.controller';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { UserModule } from 'src/users/user.module';
import { User } from 'src/users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { TextoSmsProvider } from './notifications/texto-sms.provider';
import { NotificationService } from './notifications/notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JournalZoneEntity,
      JournalDestinationEntity,
      JournalEditionEntity,
      JournalDistributionEntity,
      User,
      MemberEntity,
      SubscriptionEntity,
    ]),
    LogActivitiesModule,
    UserModule,
  ],
  controllers: [
    JournalZoneController,
    JournalDestinationController,
    JournalEditionController,
    JournalDistributionController,
  ],
  providers: [
    JournalZoneService,
    JournalDestinationService,
    JournalEditionService,
    JournalDistributionService,
    TextoSmsProvider,
    NotificationService,
  ],
  exports: [
    JournalZoneService,
    JournalDestinationService,
    JournalEditionService,
    JournalDistributionService,
    NotificationService,
  ],
})
export class JournalModule {}

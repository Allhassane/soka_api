import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalZoneEntity } from './entities/journal-zone.entity';
import { JournalZoneCityEntity } from './entities/journal-zone-city.entity';
import { JournalDestinationEntity } from './entities/journal-destination.entity';
import { JournalEditionEntity } from './entities/journal-edition.entity';
import { JournalDistributionEntity } from './entities/journal-distribution.entity';
import { JournalDistrictReceptionEntity } from './entities/journal-district-reception.entity';
import { JournalMemberReceptionEntity } from './entities/journal-member-reception.entity';
import { JournalZoneService } from './journal-zone.service';
import { JournalDestinationService } from './journal-destination.service';
import { JournalEditionService } from './journal-edition.service';
import { JournalDistributionService } from './journal-distribution.service';
import { JournalReceptionService } from './journal-reception.service';
import { JournalZoneController } from './journal-zone.controller';
import { JournalDestinationController } from './journal-destination.controller';
import { JournalEditionController } from './journal-edition.controller';
import { JournalDistributionController } from './journal-distribution.controller';
import { JournalReceptionController } from './journal-reception.controller';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { UserModule } from 'src/users/user.module';
import { User } from 'src/users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { CityEntity } from 'src/cities/entities/city.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { TextoSmsProvider } from './notifications/texto-sms.provider';
import { NotificationService } from './notifications/notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JournalZoneEntity,
      JournalZoneCityEntity,
      JournalDestinationEntity,
      JournalEditionEntity,
      JournalDistributionEntity,
      JournalDistrictReceptionEntity,
      JournalMemberReceptionEntity,
      User,
      MemberEntity,
      StructureEntity,
      CityEntity,
      SubscriptionEntity,
      SubscriptionPaymentEntity,
    ]),
    LogActivitiesModule,
    UserModule,
  ],
  controllers: [
    JournalZoneController,
    JournalDestinationController,
    JournalEditionController,
    JournalDistributionController,
    JournalReceptionController,
  ],
  providers: [
    JournalZoneService,
    JournalDestinationService,
    JournalEditionService,
    JournalDistributionService,
    JournalReceptionService,
    TextoSmsProvider,
    NotificationService,
  ],
  exports: [
    JournalZoneService,
    JournalDestinationService,
    JournalEditionService,
    JournalDistributionService,
    JournalReceptionService,
    NotificationService,
  ],
})
export class JournalModule {}

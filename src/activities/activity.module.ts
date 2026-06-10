import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEntity } from './entities/activity.entity';
import { ActivityParticipantEntity } from './entities/activity-participant.entity';
import { ActivityAttendanceEntity } from './entities/activity-attendance.entity';
import { ActivityService } from './activity.service';
import { ActivityParticipantService } from './activity-participant.service';
import { ActivityAttendanceService } from './activity-attendance.service';
import { ActivityStatsService } from './activity-stats.service';
import { ActivityTargetService } from './activity-target.service';
import { ActivityController } from './activity.controller';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { UserModule } from 'src/users/user.module';
import { User } from 'src/users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { StructureModule } from 'src/structure/structure.module';
import { StructureEntity } from 'src/structure/entities/structure.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ActivityEntity,
      ActivityParticipantEntity,
      ActivityAttendanceEntity,
      User,
      MemberEntity,
      StructureEntity,
    ]),
    LogActivitiesModule,
    UserModule,
    StructureModule,
  ],
  controllers: [ActivityController],
  providers: [
    ActivityService,
    ActivityParticipantService,
    ActivityAttendanceService,
    ActivityStatsService,
    ActivityTargetService,
  ],
  exports: [
    ActivityService,
    ActivityParticipantService,
    ActivityAttendanceService,
    ActivityStatsService,
    ActivityTargetService,
  ],
})
export class ActivityModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityTypeEntity } from './entities/activity-type.entity';
import { ActivityTypeService } from './activity-type.service';
import { ActivityTypeController } from './activity-type.controller';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { UserModule } from 'src/users/user.module';
import { User } from 'src/users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityTypeEntity, User]),
    LogActivitiesModule,
    UserModule,
  ],
  controllers: [ActivityTypeController],
  providers: [ActivityTypeService],
  exports: [ActivityTypeService],
})
export class ActivityTypeModule {}

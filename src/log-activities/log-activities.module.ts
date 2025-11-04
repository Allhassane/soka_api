import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogActivity } from './entities/log-activity.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';

@Module({
  imports: [TypeOrmModule.forFeature([LogActivity])],
  providers: [LogActivitiesService],
  exports: [LogActivitiesService],
})
export class LogActivitiesModule {}

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';
import { ResponsibilityEntity } from './entities/responsibility.entity';
import { ResponsibilityController } from './reponsibility.controller';
import { ResponsibilityService } from './reponsibility.service';
import { MemberResponsibilityModule } from 'src/⁠member-responsibility/⁠member-responsibility.module';
import { LevelModule } from 'src/level/level.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResponsibilityEntity, User]),
    LogActivitiesModule,
    UserModule,
    forwardRef(() => MemberResponsibilityModule),
    LevelModule,
  ],
  controllers: [ResponsibilityController],
  providers: [ResponsibilityService],
  exports: [ResponsibilityService],
})
export class ResponsibilityModule {}

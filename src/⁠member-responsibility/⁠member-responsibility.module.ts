import { forwardRef, Module } from '@nestjs/common';
import { MemberResponsibilityService } from './⁠member-responsibility.service';
import { MemberResponsibilityController } from './⁠member-responsibility.controller';
import { MemberResponsibilityEntity } from './entities/member-responsibility.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { UserModule } from 'src/users/user.module';
import { MemberModule } from 'src/members/member.module';
import { ResponsibilityModule } from 'src/responsibilities/reponsibility.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MemberResponsibilityEntity]),
    LogActivitiesModule,
    UserModule,
    forwardRef(() => ResponsibilityModule),
    forwardRef(() => MemberModule),
  ],
  controllers: [MemberResponsibilityController],
  providers: [MemberResponsibilityService],
  exports: [MemberResponsibilityService],
})
export class MemberResponsibilityModule {}

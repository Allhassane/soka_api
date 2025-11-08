import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemberService } from './member.service';
import { MemberController } from './member.controller';
import { MemberEntity } from './entities/member.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';
import { ResponsibilityModule } from 'src/responsibilities/reponsibility.module';
import { MemberResponsibilityModule } from 'src/⁠member-responsibility/⁠member-responsibility.module';
import { CivilityEntity } from 'src/civilities/entities/civility.entity';
import { CivilityModule } from 'src/civilities/civility.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MemberEntity, User,CivilityEntity]),
    LogActivitiesModule,
    UserModule,
    ResponsibilityModule,
    CivilityModule,
    forwardRef(() => MemberResponsibilityModule),
  ],
  controllers: [MemberController],
  providers: [MemberService],
  exports: [MemberService],
})
export class MemberModule {}

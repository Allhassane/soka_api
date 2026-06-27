import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommitteeService } from './committee.service';
import { CommitteeController } from './committee.controller';
import { CommitteesEntity } from './entities/committees.entity';
import { CommitteeMemberEntity } from './entities/committee-member.entity';
import { LogActivitiesModule } from '../log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommitteesEntity, CommitteeMemberEntity, User, MemberEntity]),
    LogActivitiesModule,
  ],
  controllers: [CommitteeController],
  providers: [CommitteeService],
  exports: [CommitteeService],
})
export class CommitteeModule {}

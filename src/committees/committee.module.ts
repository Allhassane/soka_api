import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommitteeService } from './committee.service';
import { CommitteeController } from './committee.controller';
import { CommitteesEntity } from './entities/committees.entity';
import { CommitteeMemberEntity } from './entities/committee-member.entity';
import { LogActivitiesModule } from '../log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { Role } from 'src/roles/entities/role.entity';
import { LevelEntity } from 'src/level/entities/level.entity';

@Module({
  imports: [
    // `Role` et `LevelEntity` sont enregistrés en repository seulement (pas d'import de
    // `RoleModule` / `LevelModule`) : un comité ne fait que STOCKER et RELIRE ces références,
    // il n'a besoin d'aucun service métier - et on évite les dépendances circulaires.
    TypeOrmModule.forFeature([
      CommitteesEntity,
      CommitteeMemberEntity,
      User,
      MemberEntity,
      Role,
      LevelEntity,
    ]),
    LogActivitiesModule,
  ],
  controllers: [CommitteeController],
  providers: [CommitteeService],
  exports: [CommitteeService],
})
export class CommitteeModule {}

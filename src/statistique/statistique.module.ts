import { forwardRef, Module } from '@nestjs/common';
import { StatistiqueController } from './statistique.controller';
import { StructureService } from '../structure/structure.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StructureEntity } from './entities/structure.entity';
import { LogActivitiesModule } from '../log-activities/log-activities.module';
import { UserModule } from '../users/user.module';
import { LevelModule } from 'src/level/level.module';
import { MemberEntity } from 'src/members/entities/member.entity';
import { LevelEntity } from 'src/level/entities/level.entity';
import { MemberResponsibilityEntity } from 'src/⁠member-responsibility/entities/member-responsibility.entity';
import { ResponsibilityEntity } from 'src/responsibilities/entities/responsibility.entity';
import { StructureTreeService } from 'src/structure/structure-tree.service';
import { StatistiqueService } from './statistique.service';
import { User } from 'src/users/entities/user.entity';
import { ExportJobModule } from 'src/export-async/export-job.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StructureEntity,
      MemberEntity,
      LevelEntity,
      MemberResponsibilityEntity,
      ResponsibilityEntity,
      User
    ]),
    LogActivitiesModule,
    UserModule,
    LevelModule,
    forwardRef(() => ExportJobModule), // ✅ Ajouter ceci

  ],
  controllers: [StatistiqueController],
  providers: [StructureService,StructureTreeService,StatistiqueService],
  exports: [StatistiqueService,StructureService,StructureTreeService]
})
export class StatistiqueModule {}

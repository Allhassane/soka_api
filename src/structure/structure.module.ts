import { forwardRef, Module } from '@nestjs/common';
import { StructureController } from './structure.controller';
import { StructureService } from './structure.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StructureEntity } from './entities/structure.entity';
import { LogActivitiesModule } from '../log-activities/log-activities.module';
import { UserModule } from '../users/user.module';
import { LevelModule } from 'src/level/level.module';
import { StructureTreeService } from './structure-tree.service';
import { MemberEntity } from 'src/members/entities/member.entity';
import { LevelEntity } from 'src/level/entities/level.entity';
import { MemberResponsibilityEntity } from 'src/⁠member-responsibility/entities/member-responsibility.entity';
import { ResponsibilityEntity } from 'src/responsibilities/entities/responsibility.entity';
import { AuthService } from 'src/auth/auth.service';
import { ExportJobModule } from 'src/export-async/export-job.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StructureEntity,MemberEntity,LevelEntity,MemberResponsibilityEntity,ResponsibilityEntity,]),
    LogActivitiesModule,
    UserModule,
    LevelModule,
    ExportJobModule,
    forwardRef(() => ExportJobModule),
  ],
  controllers: [StructureController],
  providers: [StructureService,StructureTreeService],
  exports: [StructureService,StructureTreeService]
})
export class StructureModule {}

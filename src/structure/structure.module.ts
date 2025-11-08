import { Module } from '@nestjs/common';
import { StructureController } from './structure.controller';
import { StructureService } from './structure.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StructureEntity } from './entities/structure.entity';
import { LogActivitiesModule } from '../log-activities/log-activities.module';
import { UserModule } from '../users/user.module';
import { LevelModule } from 'src/level/level.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StructureEntity]),
    LogActivitiesModule,
    UserModule,
    LevelModule,
  ],
  controllers: [StructureController],
  providers: [StructureService],
})
export class StructureModule {}

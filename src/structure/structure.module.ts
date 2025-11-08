import { Module } from '@nestjs/common';
import { StructureController } from './structure.controller';
import { StructureService } from './structure.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StructureEntity } from './entities/structure.entity';
import { LogActivitiesModule } from '../log-activities/log-activities.module';
import { UserModule } from '../users/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StructureEntity]),
    LogActivitiesModule,
    UserModule,
  ],
  controllers: [StructureController],
  providers: [StructureService],
})
export class StructureModule {}

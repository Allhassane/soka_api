import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormationService } from './formation.service';
import { FormationController } from './formation.controller';
import { FormationEntity } from './entities/formation.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { ReferentialMergeModule } from 'src/shared/services/referential-merge.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FormationEntity, User]),
    LogActivitiesModule,
    UserModule,
    ReferentialMergeModule,
  ],
  controllers: [FormationController],
  providers: [FormationService],
  exports: [FormationService],
})
export class FormationModule {}

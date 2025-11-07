import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormationService } from './formation.service';
import { FormationController } from './formation.controller';
import { FormationEntity } from './entities/formation.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([FormationEntity,User]),LogActivitiesModule,UserModule],
  controllers: [FormationController],
  providers: [FormationService],
  exports: [FormationService],
})
export class DivisionModule {}

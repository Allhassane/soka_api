import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaritalStatusService } from './marital-status.service';
import { MaritalStatusController } from './marital-status.controller';
import { MaritalStatusEntity } from './entities/marital-status.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([MaritalStatusEntity,User]),LogActivitiesModule,UserModule],
  controllers: [MaritalStatusController],
  providers: [MaritalStatusService],
  exports: [MaritalStatusService],
})
export class DivisionModule {}

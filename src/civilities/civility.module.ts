import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CivilityService } from './civility.service';
import { CivilityController } from './civility.controller';
import { CivilityEntity } from './entities/civility.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([CivilityEntity,User]),LogActivitiesModule,UserModule],
  controllers: [CivilityController],
  providers: [CivilityService],
  exports: [CivilityService],
})
export class CivilityModule {}

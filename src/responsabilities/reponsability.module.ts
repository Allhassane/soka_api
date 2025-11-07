import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResponsabilityService } from './reponsability.service';
import { ResponsabilityController } from './reponsability.controller';
import { ResponsabilityEntity } from './entities/responsability.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([ResponsabilityEntity,User]),LogActivitiesModule,UserModule],
  controllers: [ResponsabilityController],
  providers: [ResponsabilityService],
  exports: [ResponsabilityService],
})
export class DivisionModule {}

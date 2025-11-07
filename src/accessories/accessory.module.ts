import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { accessoryService } from './accessory.service';
import { AccessoryController } from './accessory.controller';
import { acccessoryEntity } from './entities/accessory.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([acccessoryEntity,User]),LogActivitiesModule,UserModule],
  controllers: [AccessoryController],
  providers: [accessoryService],
  exports: [accessoryService],
})
export class DivisionModule {}

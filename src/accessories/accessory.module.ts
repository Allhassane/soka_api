import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessoryService } from './accessory.service';
import { AccessoryController } from './accessory.controller';
import { AccessoryEntity } from './entities/accessory.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([AccessoryEntity,User]),LogActivitiesModule,UserModule],
  controllers: [AccessoryController],
  providers: [AccessoryService],
  exports: [AccessoryService],
})
export class AccessoryModule {}

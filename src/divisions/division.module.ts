import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DivisionService } from './division.service';
import { DivisionController } from './division.controller';
import { DivisionEntity } from './entities/division.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';
import { User } from 'src/users/entities/user.entity';
import { UserModule } from 'src/users/user.module';
import { DepartmentModule } from 'src/departments/department.module';
import { DepartmentEntity } from 'src/departments/entities/department.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DivisionEntity,User,DepartmentEntity]),LogActivitiesModule,UserModule,DepartmentModule],
  controllers: [DivisionController],
  providers: [DivisionService],
  exports: [DivisionService],
})
export class DivisionModule {}

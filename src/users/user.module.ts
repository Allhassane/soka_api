import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRole } from 'src/user-roles/entities/user-roles.entity';
import { LogActivitiesModule } from 'src/log-activities/log-activities.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, UserRole]),LogActivitiesModule ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

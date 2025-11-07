import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRoleService } from './user-roles.service';
import { UserRoleController } from './user-roles.controller';
import { UserRole } from './entities/user-roles.entity';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/roles/entities/role.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserRole,
      User,
      Role
    ]),
  ],
  controllers: [UserRoleController],
  providers: [UserRoleService],
  exports: [UserRoleService],
})
export class UserRoleModule {}

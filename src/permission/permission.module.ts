import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permission.service';
import { PermissionsController } from './permission.controller';
import { PermissionEntity } from './entities/permission.entity';
import { ModuleEntity } from '../module/entities/module.entity';
import { Role } from 'src/roles/entities/role.entity';
import { RolePermissionEntity } from 'src/role-permission/entities/role-permission.entity';
import { User } from 'src/users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PermissionEntity, ModuleEntity,Role,RolePermissionEntity,User])],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionModule {}

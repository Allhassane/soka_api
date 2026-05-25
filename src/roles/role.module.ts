import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { Role } from './entities/role.entity';
import { ModuleEntity } from 'src/module/entities/module.entity';
import { RolePermissionEntity } from 'src/role-permission/entities/role-permission.entity';
import { RolePermissionService } from 'src/role-permission/role-permission.service';
import { PermissionEntity } from 'src/permission/entities/permission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Role,ModuleEntity,RolePermissionEntity,PermissionEntity])],
  controllers: [RoleController],
  providers: [RoleService,RolePermissionService],
  exports: [RoleService],
})
export class RoleModule {}

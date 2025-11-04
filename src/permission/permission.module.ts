import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permission.service';
import { PermissionsController } from './permission.controller';
import { PermissionEntity } from './entities/permission.entity';
import { ModuleEntity } from '../module/entities/module.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PermissionEntity, ModuleEntity])],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionModule {}

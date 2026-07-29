import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, UseGuards } from '@nestjs/common';
import { PermissionsService } from './permission.service';
import { CreatePermissionsDto } from './dto/create-permissions.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { PermissionEntity } from './entities/permission.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { SuccessMessage } from 'src/shared/decorators/success-message.decorator';
import { AssignPermissionToRoleDto } from './dto/assign-permission-to-role.dto';
import { RevokePermissionFromRoleDto } from './dto/revoke-permission-from-role.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiTags('Permission')

@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permission')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @RequirePermissions('permissions_creer')
  @ApiOperation({ summary: 'Créer une nouvelle permission' })
  @ApiBody({ type: CreatePermissionsDto })
  @ApiResponse({ status: 201, description: 'Permission créée', type: PermissionEntity })
  async create(@Body() dto: CreatePermissionsDto): Promise<PermissionEntity> {
    return this.permissionsService.create(dto);
  }

  @Get()
  @RequirePermissions('permissions_voir')
  @ApiOperation({ summary: 'Récupérer toutes les permissions d’un module' })
  @ApiQuery({ name: 'module_uuid', description: 'UUID du module', required: true })
  @ApiResponse({ status: 200, description: 'Liste des permissions', type: [PermissionEntity] })
  async findAll(@Query('module_uuid') module_uuid: string): Promise<PermissionEntity[]> {
    return this.permissionsService.findAll(module_uuid);
  }

  @Get(':uuid')
  @RequirePermissions('permissions_voir')
  @ApiOperation({ summary: 'Récupérer une permission par UUID' })
  @ApiParam({ name: 'uuid', description: 'UUID de la permission' })
  @ApiResponse({ status: 200, description: 'Permission trouvée', type: PermissionEntity })
  async findOne(@Param('uuid') uuid: string): Promise<PermissionEntity> {
    return this.permissionsService.findOne(uuid);
  }

  @Put(':uuid')
  @RequirePermissions('permissions_modifier')
  @ApiOperation({ summary: 'Mettre à jour une permission' })
  @ApiParam({ name: 'uuid', description: 'UUID de la permission' })
  @ApiBody({ type: UpdatePermissionsDto })
  @ApiResponse({ status: 200, description: 'Permission mise à jour', type: PermissionEntity })
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdatePermissionsDto,
  ): Promise<PermissionEntity> {
    return this.permissionsService.update(uuid, dto);
  }

  @Delete(':uuid')
  @RequirePermissions('permissions_supprimer')
  @HttpCode(200)
  @ApiOperation({ summary: 'Supprimer une permission' })
  @ApiParam({ name: 'uuid', description: 'UUID de la permission' })
  @ApiResponse({ status: 200, description: 'Permission supprimée' })
  async remove(@Param('uuid') uuid: string): Promise<{ message: string }> {
    return this.permissionsService.remove(uuid);
  }

  
  @Post('assign-to-role')
  @RequirePermissions('permissions_creer')
  @ApiOperation({ summary: 'Assigner une permission à un rôle' })
  @SuccessMessage('Permission assignée au rôle')
  assignToRole(@Body() dto: AssignPermissionToRoleDto): Promise<void> {
    return this.permissionsService.assignToRole(dto);
  }

  @Post('revoke-from-role')
  @RequirePermissions('permissions_creer')
  @ApiOperation({ summary: 'Retirer une permission d’un rôle' })
  @SuccessMessage('Permission retirée du rôle')
  revokeFromRole(@Body() dto: RevokePermissionFromRoleDto): Promise<void> {
    return this.permissionsService.revokeFromRole(dto);
  }

  @Get('role/:role_uuid')
  @RequirePermissions('permissions_voir')
  @ApiOperation({ summary: 'Lister les permissions d’un rôle' })
  @SuccessMessage('Permissions du rôle récupérées')
  listForRole(@Param('role_uuid') role_uuid: string): Promise<PermissionEntity[]> {
    return this.permissionsService.listRolePermissions(role_uuid);
  }

  @Get('user/:user_uuid')
  @RequirePermissions('permissions_voir')
  @ApiOperation({
    summary:
      'Lister les permissions effectives d’un utilisateur (via ses rôles)',
  })
  @SuccessMessage('Permissions effectives de l’utilisateur récupérées')
  listForUser(@Param('user_uuid') user_uuid: string): Promise<PermissionEntity[]> {
    return this.permissionsService.listUserEffectivePermissions(user_uuid);
  }
}

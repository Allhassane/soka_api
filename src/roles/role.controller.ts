import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Put,
  UseGuards,
  Query,
  Patch,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dtos/create-role.dto';
import { Role } from './entities/role.entity';
import { SuccessMessage } from 'src/shared/decorators/success-message.decorator';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { UpdateRoleStatusDto } from './dtos/update-role-status.dto';
import { SetModulePermissionsDto } from './dtos/set-module-permissions.dto';
import { FindRolesQueryDto } from './dtos/find-roles-query.dto';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';

@ApiTags('Rôles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RoleController {
  constructor(
    private readonly roleService: RoleService,    
) {}

  @Post()
  @RequirePermissions('roles_ajouter_un_role')
  @SuccessMessage('Rôle créé avec succès')
  @ApiOperation({ summary: 'Créer un nouveau rôle' })
  @ApiResponse({ status: 201, description: 'Rôle créé' })
  @ApiResponse({ status: 409, description: 'Un rôle porte déjà ce nom' })
  create(@Body() createRoleDto: CreateRoleDto): Promise<Role> {
    return this.roleService.create(createRoleDto);
  }

  @Get()
  @SuccessMessage('Liste des rôles récupérés')
  @ApiOperation({
    summary: 'Liste des rôles (filtre `status` optionnel ; chaque item porte `is_system`)',
  })
  @ApiResponse({ status: 200, description: 'Retour paginé' })
  findAll(@Query() query: FindRolesQueryDto) {
    const { page, limit, status } = query;
    return this.roleService.findAll(page, limit, status);
  }

  @Put(':uuid')
  @RequirePermissions('roles_modifier_un_role')
  @SuccessMessage('Rôle mis à jour')
  @ApiOperation({ summary: 'Mettre à jour un rôle' })
  @ApiResponse({ status: 200, description: 'Rôle mis à jour' })
  @ApiResponse({ status: 403, description: 'Rôle système : non modifiable' })
  @ApiResponse({ status: 409, description: 'Un autre rôle porte déjà ce nom' })
  update(
    @Param('uuid') uuid: string,
    @Body() updateDto: UpdateRoleDto,
  ): Promise<Role> {
    return this.roleService.update(uuid, updateDto);
  }

  @Get(':uuid')
  @SuccessMessage('Détails du rôle récupérés')
  @ApiOperation({ summary: 'Trouver un rôle par UUID' })
  findOne(@Param('uuid') uuid: string): Promise<Role> {
    return this.roleService.findOneByUuid(uuid);
  }

  @Patch(':uuid/delete')
  @RequirePermissions('roles_activer_ou_desactiver_un_role')
  @SuccessMessage('Rôle supprimé (soft delete)')
  @ApiOperation({ summary: 'Supprimer un rôle (soft delete)' })
  @ApiResponse({ status: 200, description: 'Rôle supprimé avec succès' })
  @ApiResponse({ status: 403, description: 'Rôle système : non supprimable' })
  async softDelete(@Param('uuid') uuid: string): Promise<void> {
    await this.roleService.softDelete(uuid);
    return;
  }

  // Deux segments comme `:uuid/delete`, mais le second est littéral : aucun recouvrement.
  @Patch(':uuid/status')
  @RequirePermissions('roles_activer_ou_desactiver_un_role')
  @SuccessMessage('Statut du rôle mis à jour')
  @ApiOperation({ summary: 'Activer ou désactiver un rôle' })
  @ApiParam({ name: 'uuid', description: 'UUID du rôle' })
  @ApiResponse({ status: 200, description: 'Statut mis à jour' })
  @ApiResponse({ status: 403, description: 'Rôle système : statut non modifiable' })
  setStatus(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateRoleStatusDto,
  ): Promise<Role> {
    return this.roleService.setStatus(uuid, dto.status);
  }

  @Get('levels/:uuid')
  @SuccessMessage('Niveaux liés au rôle récupérés')
  @ApiOperation({ summary: 'Lister les niveaux liés à un rôle via son UUID' })
  findLevelsByRole(
    @Param('uuid') uuid: string,
  ): Promise<any> {
    return this.roleService.findLevelsByRoleUuid(uuid);
  }

  @Get(':uuid/permissions')
  @ApiParam({ name: 'uuid', description: 'UUID du rôle' })
  @ApiResponse({ status: 200, description: 'Permissions récupérées avec succès' })
  async findAllPermissions(@Param('uuid') uuid: string) {
    return this.roleService.findAllPermissions(uuid);
  }

  @Get(':uuid/global-permissions')
  @ApiParam({ name: 'uuid', description: 'UUID du rôle' })
  @ApiOperation({ summary: 'Recupérer toutes les permissions du role' })
  @ApiResponse({ status: 200, description: 'Permissions récupérées avec succès' })
  async findGlobalPermissions(@Param('uuid') uuid: string) {
    return this.roleService.findGlobalPermissions(uuid);
  }

  @Put('permissions/:uuid/toggle')
  @RequirePermissions('roles_activer_ou_desactiver_un_role')
  @ApiParam({ name: 'uuid', description: 'UUID du rôle-permission ' })
    @ApiOperation({ summary: 'Changer le status de la permission' })

  @ApiResponse({ status: 200, description: 'Permission mise à jour avec succès' })
  async togglePermission(@Param('uuid') uuid: string) {
    await this.roleService.togglePermission(uuid);
    return { message: 'Permission mise à jour avec succès' };
  }

  /**
   * Bascule en une fois toutes les permissions d'un module pour un rôle.
   * 4 segments : ne recouvre ni `PUT :uuid` (1) ni `PUT permissions/:uuid/toggle` (3).
   */
  @Put(':roleUuid/modules/:moduleUuid/permissions')
  @RequirePermissions('roles_activer_ou_desactiver_un_role')
  @SuccessMessage('Permissions du module mises à jour')
  @ApiParam({ name: 'roleUuid', description: 'UUID du rôle' })
  @ApiParam({ name: 'moduleUuid', description: 'UUID du module' })
  @ApiOperation({
    summary: 'Cocher / décocher toutes les permissions d’un module pour un rôle',
  })
  @ApiResponse({
    status: 200,
    description: 'Retourne { module_uuid, status, updated, created }',
  })
  @ApiResponse({ status: 404, description: 'Rôle ou module introuvable' })
  setModulePermissions(
    @Param('roleUuid') roleUuid: string,
    @Param('moduleUuid') moduleUuid: string,
    @Body() dto: SetModulePermissionsDto,
  ) {
    return this.roleService.setModulePermissions(roleUuid, moduleUuid, dto.status);
  }

  /**
   * Génère toutes les permissions pour un rôle donné
   * @param uuid UUID du rôle
   */
  @Post(':uuid/generate-permissions')
  @RequirePermissions('roles_ajouter_un_role')
  @ApiOperation({ summary: 'Générer toutes les permissions pour un rôle' })
  @ApiResponse({ status: 200, description: 'Permissions générées avec succès.' })
  @ApiResponse({ status: 404, description: 'Rôle introuvable.' })
  async generateRolePermissions(@Param('uuid') uuid: string) {
    // Vérifie si le rôle existe
    const role = await this.roleService.findOneByUuid(uuid);
    if (!role) {
      throw new NotFoundException('Rôle introuvable');
    }

    // Génère les permissions pour le rôle
    await this.roleService.generateRolePermissions(uuid);

    return {
      message: 'Permissions générées pour le rôle avec succès',
      role_uuid: uuid,
    };
  }
}

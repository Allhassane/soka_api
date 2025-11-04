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
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PaginationQueryDto } from 'src/shared/dtos/pagination-query.dto';

@ApiTags('Rôles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RoleController {
  constructor(
    private readonly roleService: RoleService,    
) {}

  @Post()
  @SuccessMessage('Rôle créé avec succès')
  @ApiOperation({ summary: 'Créer un nouveau rôle' })
  @ApiResponse({ status: 201, description: 'Rôle créé' })
  create(@Body() createRoleDto: CreateRoleDto): Promise<Role> {
    return this.roleService.create(createRoleDto);
  }

  @Get()
  @SuccessMessage('Liste des rôles récupérés')
  @ApiOperation({ summary: 'Liste des rôles' })
  @ApiResponse({ status: 200, description: 'Retour paginé' })
  findAll(@Query() query: PaginationQueryDto) {
    const { page, limit } = query;
    return this.roleService.findAll(page, limit);
  }

  @Put(':uuid')
  @SuccessMessage('Rôle mis à jour')
  @ApiOperation({ summary: 'Mettre à jour un rôle' })
  @ApiResponse({ status: 200, description: 'Rôle mis à jour' })
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
  @SuccessMessage('Rôle supprimé (soft delete)')
  @ApiOperation({ summary: 'Supprimer un rôle (soft delete)' })
  @ApiResponse({ status: 200, description: 'Rôle supprimé avec succès' })
  async softDelete(@Param('uuid') uuid: string): Promise<void> {
    await this.roleService.softDelete(uuid);
    return;
  }

  @Get('levels/:uuid')
  @SuccessMessage('Niveaux liés au rôle récupérés')
  @ApiOperation({ summary: 'Lister les niveaux liés à un rôle via son UUID' })
  findLevelsByRole(
    @Param('uuid') uuid: string,
  ): Promise<any> {
    console.log('Fetching levels for role with UUID:', uuid);
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
  @ApiParam({ name: 'uuid', description: 'UUID du rôle-permission ' })
    @ApiOperation({ summary: 'Changer le status de la permission' })

  @ApiResponse({ status: 200, description: 'Permission mise à jour avec succès' })
  async togglePermission(@Param('uuid') uuid: string) {
    await this.roleService.togglePermission(uuid);
    return { message: 'Permission mise à jour avec succès' };
  }

  /**
   * Génère toutes les permissions pour un rôle donné
   * @param uuid UUID du rôle
   */
  @Post(':uuid/generate-permissions')
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

import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, UseGuards } from '@nestjs/common';
import { PermissionsService } from './permission.service';
import { CreatePermissionsDto } from './dto/create-permissions.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { PermissionEntity } from './entities/permission.entity';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';

@ApiTags('Permission')

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('Permission')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle permission' })
  @ApiBody({ type: CreatePermissionsDto })
  @ApiResponse({ status: 201, description: 'Permission créée', type: PermissionEntity })
  async create(@Body() dto: CreatePermissionsDto): Promise<PermissionEntity> {
    return this.permissionsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Récupérer toutes les permissions d’un module' })
  @ApiQuery({ name: 'module_uuid', description: 'UUID du module', required: true })
  @ApiResponse({ status: 200, description: 'Liste des permissions', type: [PermissionEntity] })
  async findAll(@Query('module_uuid') module_uuid: string): Promise<PermissionEntity[]> {
    return this.permissionsService.findAll(module_uuid);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une permission par UUID' })
  @ApiParam({ name: 'uuid', description: 'UUID de la permission' })
  @ApiResponse({ status: 200, description: 'Permission trouvée', type: PermissionEntity })
  async findOne(@Param('uuid') uuid: string): Promise<PermissionEntity> {
    return this.permissionsService.findOne(uuid);
  }

  @Put(':uuid')
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
  @HttpCode(200)
  @ApiOperation({ summary: 'Supprimer une permission' })
  @ApiParam({ name: 'uuid', description: 'UUID de la permission' })
  @ApiResponse({ status: 200, description: 'Permission supprimée' })
  async remove(@Param('uuid') uuid: string): Promise<{ message: string }> {
    return this.permissionsService.remove(uuid);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import { MemberAccessoryService } from './member-accessories.service';
import { CreateMemberAccessoryDto } from './dtos/create-member-accessories.dto';
import { UpdateMemberAccessoryDto } from './dtos/update-member-accessories.dto';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { MemberAccessoryEntity } from './entities/member-accessories.entity';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiTags('Accessoire Utilisateurs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('member-accessories')
export class MemberAccessoriesController {
  constructor(private readonly service: MemberAccessoryService) {}

  @Post()
  @RequirePermissions('membres_modifier_situation_membre_sein_organisation')
  @ApiOperation({ summary: 'Assigner un accessoire à un utilisateur' })
  @ApiResponse({ status: 201, type: MemberAccessoryEntity })
  async create(
    @Body() dto: CreateMemberAccessoryDto,
  ): Promise<MemberAccessoryEntity> {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions('membres_acceder_alonglet_membre')
  @ApiOperation({
    summary: 'Lister toutes les affectations membre/accessoire',
  })
  async findAll() {
    return this.service.findAll();
  }

  @Get(':uuid')
  @RequirePermissions('membres_acceder_alonglet_membre')
  @ApiOperation({ summary: 'Voir une affectation utilisateur/accessoire' })
  @ApiParam({
    name: 'uuid',
    description: 'UUID de la liaison membre/accessoire',
  })
  @ApiResponse({ status: 200, type: MemberAccessoryEntity })
  async findOne(@Param('uuid') uuid: string): Promise<MemberAccessoryEntity> {
    return this.service.findOneByUuid(uuid);
  }

  @Put(':uuid')
  @RequirePermissions('membres_modifier_situation_membre_sein_organisation')
  @ApiOperation({ summary: 'Modifier une affectation membre/accessoire' })
  @ApiParam({
    name: 'uuid',
    description: 'UUID de la liaison membre/accessoire',
  })
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateMemberAccessoryDto,
  ): Promise<MemberAccessoryEntity> {
    return this.service.update(uuid, dto);
  }

  @Delete(':uuid')
  @RequirePermissions('membres_modifier_situation_membre_sein_organisation')
  @ApiOperation({
    summary: 'Supprimer un accessoire utilisateur/rôle (soft delete)',
  })
  @ApiParam({
    name: 'uuid',
    description: 'UUID de la liaison membre/accessoire',
  })
  async remove(@Param('uuid') uuid: string): Promise<void> {
    return this.service.softDelete(uuid);
  }
}

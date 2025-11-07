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
import { UserRoleService } from './user-roles.service';
import { CreateUserRoleDto } from './dtos/create-user-roles.dto';
import { UpdateUserRoleDto } from './dtos/update-user-roles.dto';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserRole } from './entities/user-roles.entity';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';

@ApiTags('User Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user-roles')
export class UserRoleController {
  constructor(private readonly service: UserRoleService) {}

  @Post()
  @ApiOperation({ summary: 'Assigner un rôle à un utilisateur' })
  @ApiResponse({ status: 201, type: UserRole })
  async create(@Body() dto: CreateUserRoleDto): Promise<UserRole> {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Lister les affectations utilisateurs/rôles paginées',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.service.findAll(Number(page), Number(limit));
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Voir une affectation utilisateur/rôle' })
  @ApiParam({ name: 'uuid', description: 'UUID de la liaison user/role' })
  @ApiResponse({ status: 200, type: UserRole })
  async findOne(@Param('uuid') uuid: string): Promise<UserRole> {
    return this.service.findOneByUuid(uuid);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Modifier une affectation utilisateur/rôle' })
  @ApiParam({ name: 'uuid', description: 'UUID de la liaison user/role' })
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<UserRole> {
    return this.service.update(uuid, dto);
  }

  @Delete(':uuid')
  @ApiOperation({
    summary: 'Supprimer une affectation utilisateur/rôle (soft delete)',
  })
  @ApiParam({ name: 'uuid', description: 'UUID de la liaison user/role' })
  async remove(@Param('uuid') uuid: string): Promise<void> {
    return this.service.softDelete(uuid);
  }
}

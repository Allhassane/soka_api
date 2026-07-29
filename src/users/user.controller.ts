import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { User } from './entities/user.entity';
import { ApiTags, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SuccessMessage } from 'src/shared/decorators/success-message.decorator';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PaginationQueryDto } from 'src/shared/dtos/pagination-query.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiTags('Utilisateurs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @RequirePermissions('utilisateurs_creer')
  @SuccessMessage('Utilisateur créé')
  @ApiResponse({ status: 201, type: User })
  create(
    @Body() dto: CreateUserDto,
    @Req() req: { user: User },
  ): Promise<User> {
    return this.userService.create(dto, req.user);
  }

  @Get()
  @RequirePermissions('utilisateurs_voir')
  @SuccessMessage('Liste des rôles récupérés')
  @ApiResponse({ status: 200, description: 'Retour paginé' })
  findAll(@Query() query: PaginationQueryDto) {
    const { page, limit } = query;
    return this.userService.findAll(page, limit);
  }

  @Get('search/:keyword')
  @RequirePermissions('utilisateurs_voir')
  @SuccessMessage('Résultats de la recherche')
  @ApiResponse({ status: 200, description: 'Utilisateurs trouvés' })
  search(@Param('keyword') keyword: string): Promise<User[]> {
    return this.userService.search(keyword);
  }

  @Get(':uuid')
  @RequirePermissions('utilisateurs_voir')
  @SuccessMessage('Détails de l’utilisateur')
  findOne(@Param('uuid') uuid: string): Promise<User> {
    return this.userService.findOneByUuid(uuid);
  }

  @Put(':uuid')
  @RequirePermissions('utilisateurs_modifier')
  @SuccessMessage('Utilisateur mis à jour')
  update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.userService.update(uuid, dto);
  }

  @Delete(':uuid')
  @RequirePermissions('utilisateurs_supprimer')
  @SuccessMessage('Utilisateur supprimé')
  remove(@Param('uuid') uuid: string): Promise<void> {
    return this.userService.remove(uuid);
  }
}

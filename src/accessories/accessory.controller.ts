import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AccessoryService } from './accessory.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateAccessoryDto } from './dto/create-accessory.dto';
import { UpdateAccessoryDto } from './dto/update-accessory.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { ReferentialRead } from 'src/auth/decorators/referential-read.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiBearerAuth()
@ApiTags('Accessoires')
@Controller('accessoires')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessoryController {
  constructor(private readonly accessoryService: AccessoryService) {}

  @Get()
  @ReferentialRead()
  @ApiOperation({ summary: 'Liste toutes les métiers ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.accessoryService.findAll(admin_uuid);
  }

  @Post()
  @RequirePermissions('accessoires_creer')
  @ApiOperation({ summary: 'Créer un métier ' })
  @ApiResponse({ status: 200, description: 'Métier créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateAccessoryDto, @Request() req) {
    return this.accessoryService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ReferentialRead()
  @ApiOperation({ summary: 'Récupérer une métier par UUID' })
  @ApiResponse({ status: 200, description: 'Métier trouvé.' })
  @ApiResponse({ status: 400, description: 'Metier non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.accessoryService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @RequirePermissions('accessoires_modifier')
 @ApiOperation({ summary: 'Modifier un métier' })
 @ApiResponse({ status: 200, description: 'Métier modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateAccessoryDto,
    ) {
    return this.accessoryService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @RequirePermissions('accessoires_supprimer')
  @ApiOperation({ summary: 'Supprimer un métier' })
  @ApiResponse({ status: 200, description: 'Métier supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Métier introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.accessoryService.delete(uuid,admin_uuid);
  }
}

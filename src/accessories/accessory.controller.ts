import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { accessoryService } from './accessory.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateAccessoryDto } from './dto/create-accessory.dto';
import { UpdateAccessoryDto } from './dto/update-accessory.dto';

@ApiBearerAuth()
@ApiTags('Accessoires')
@Controller('accessoires')
@UseGuards(JwtAuthGuard)
export class AccessoryController {
  constructor(private readonly accessoryService: accessoryService) {}

  @Get()
  @ApiOperation({ summary: 'Liste toutes les métiers ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.accessoryService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un métier ' })
  @ApiResponse({ status: 200, description: 'Métier créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateAccessoryDto, @Request() req) {
    return this.accessoryService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une métier par UUID' })
  @ApiResponse({ status: 200, description: 'Métier trouvé.' })
  @ApiResponse({ status: 400, description: 'Metier non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.accessoryService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
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
  @ApiOperation({ summary: 'Supprimer un métier' })
  @ApiResponse({ status: 200, description: 'Métier supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Métier introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.accessoryService.delete(uuid,admin_uuid);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { JournalZoneService } from './journal-zone.service';
import { CreateJournalZoneDto } from './dto/create-journal-zone.dto';
import { UpdateJournalZoneDto } from './dto/update-journal-zone.dto';

@ApiBearerAuth()
@ApiTags('Journal - Zones')
@Controller('journals/zones')
@UseGuards(JwtAuthGuard)
export class JournalZoneController {
  constructor(private readonly zoneService: JournalZoneService) {}

  @Get()
  @ApiOperation({ summary: 'Liste de toutes les zones de distribution' })
  @ApiResponse({ status: 200, description: 'Liste recuperee avec succes.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  findAll(@Request() req) {
    return this.zoneService.findAll(req.user.uuid as string);
  }

  @Post()
  @ApiOperation({ summary: 'Creer une zone' })
  @ApiBody({ type: CreateJournalZoneDto })
  @ApiResponse({ status: 201, description: 'Zone creee avec succes.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Auteur introuvable.' })
  store(@Body() payload: CreateJournalZoneDto, @Request() req) {
    return this.zoneService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Recuperer une zone par UUID' })
  @ApiParam({ name: 'uuid', description: 'UUID de la zone' })
  @ApiResponse({ status: 200, description: 'Zone trouvee.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Zone non trouvee.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.zoneService.findOne(uuid, req.user.uuid as string);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Modifier une zone' })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: UpdateJournalZoneDto })
  @ApiResponse({ status: 200, description: 'Zone modifiee avec succes.' })
  @ApiResponse({ status: 400, description: 'Champs invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Zone introuvable.' })
  update(
    @Param('uuid') uuid: string,
    @Request() req,
    @Body() payload: UpdateJournalZoneDto,
  ) {
    return this.zoneService.update(uuid, payload, req.user.uuid as string);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une zone (soft delete)' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Zone supprimee avec succes.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Zone introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    return this.zoneService.delete(uuid, req.user.uuid as string);
  }
}

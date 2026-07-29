import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
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
import { JournalDestinationService } from './journal-destination.service';
import { CreateJournalDestinationDto } from './dto/create-journal-destination.dto';
import { UpdateJournalDestinationDto } from './dto/update-journal-destination.dto';
import { JournalDestinationPaginationQueryDto } from './dto/journal-destination-pagination-query.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiBearerAuth()
@ApiTags('Journal - Destinations')
@Controller('journals/destinations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JournalDestinationController {
  constructor(private readonly service: JournalDestinationService) {}

  @Get()
  @RequirePermissions('journal_destinations_voir')
  @ApiOperation({
    summary: 'Liste des destinations (centres/chapitres)',
    description: 'Filtre optionnel par zone via le query param zone_uuid.',
  })
  @ApiResponse({ status: 200, description: 'Retour paginé' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  findAll(@Request() req, @Query() query: JournalDestinationPaginationQueryDto) {
    const { page, limit, zone_uuid, search } = query;
    return this.service.findAll(
      req.user.uuid as string,
      page,
      limit,
      zone_uuid,
      search,
    );
  }

  @Post()
  @RequirePermissions('journal_destinations_creer')
  @ApiOperation({
    summary: 'Creer une destination',
    description: 'Si correspondent_member_uuid est fourni, les telephones sont hydrates depuis le membre s ils ne sont pas explicitement fournis.',
  })
  @ApiBody({ type: CreateJournalDestinationDto })
  @ApiResponse({ status: 201, description: 'Destination creee avec succes.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Zone, membre correspondant ou auteur introuvable.' })
  store(@Body() payload: CreateJournalDestinationDto, @Request() req) {
    return this.service.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @RequirePermissions('journal_destinations_voir')
  @ApiOperation({ summary: 'Recuperer une destination par UUID' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Destination trouvee.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Destination non trouvee.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.service.findOne(uuid, req.user.uuid as string);
  }

  @Put(':uuid')
  @RequirePermissions('journal_destinations_modifier')
  @ApiOperation({ summary: 'Modifier une destination' })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: UpdateJournalDestinationDto })
  @ApiResponse({ status: 200, description: 'Destination modifiee avec succes.' })
  @ApiResponse({ status: 400, description: 'Champs invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Destination introuvable.' })
  update(
    @Param('uuid') uuid: string,
    @Request() req,
    @Body() payload: UpdateJournalDestinationDto,
  ) {
    return this.service.update(uuid, payload, req.user.uuid as string);
  }

  @Delete(':uuid')
  @RequirePermissions('journal_destinations_supprimer')
  @ApiOperation({ summary: 'Supprimer une destination (soft delete)' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Destination supprimee avec succes.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Destination introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    return this.service.delete(uuid, req.user.uuid as string);
  }
}

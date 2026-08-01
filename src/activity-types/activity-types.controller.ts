import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { ActivityTypesService } from './activity-types.service';
import { CreateActivityTypeDto } from './dto/create-activity-type.dto';
import { UpdateActivityTypeDto } from './dto/update-activity-type.dto';
import { ActivityTypeFamily } from './entities/activity-type.entity';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { ReferentialRead } from 'src/auth/decorators/referential-read.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiBearerAuth()
@ApiTags('Activity Types')
@Controller('activity-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ActivityTypesController {
  constructor(private readonly activityTypesService: ActivityTypesService) {}

  @Get()
  @ReferentialRead()
  @ApiOperation({
    summary: "Liste des types d'activité",
    description: "Filtre optionnel par famille : 'traditionnelle' ou 'sporadique'.",
  })
  @ApiQuery({ name: 'family', required: false, enum: ActivityTypeFamily })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  @ApiResponse({ status: 401, description: 'Non autorisé.' })
  findAll(@Request() req, @Query('family') family?: ActivityTypeFamily) {
    return this.activityTypesService.findAll(req.user.uuid as string, family);
  }

  @Get(':uuid')
  @ReferentialRead()
  @ApiOperation({ summary: "Récupérer un type d'activité par UUID" })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: "Type d'activité trouvé." })
  @ApiResponse({ status: 404, description: "Type d'activité introuvable." })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.activityTypesService.findOne(uuid, req.user.uuid as string);
  }

  @Post()
  @RequirePermissions('types_activite_creer')
  @ApiOperation({ summary: "Créer un type d'activité" })
  @ApiBody({ type: CreateActivityTypeDto })
  @ApiResponse({ status: 201, description: "Type d'activité créé avec succès." })
  @ApiResponse({ status: 400, description: 'Champs invalides.' })
  create(@Body() payload: CreateActivityTypeDto, @Request() req) {
    return this.activityTypesService.create(payload, req.user.uuid as string);
  }

  @Put(':uuid')
  @RequirePermissions('types_activite_modifier')
  @ApiOperation({ summary: "Modifier un type d'activité" })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: UpdateActivityTypeDto })
  @ApiResponse({ status: 200, description: "Type d'activité mis à jour." })
  @ApiResponse({ status: 404, description: "Type d'activité introuvable." })
  update(
    @Param('uuid') uuid: string,
    @Body() payload: UpdateActivityTypeDto,
    @Request() req,
  ) {
    return this.activityTypesService.update(uuid, payload, req.user.uuid as string);
  }

  @Delete(':uuid')
  @RequirePermissions('types_activite_supprimer')
  @ApiOperation({ summary: "Supprimer un type d'activité (soft delete)" })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: "Type d'activité supprimé." })
  @ApiResponse({ status: 404, description: "Type d'activité introuvable." })
  delete(@Param('uuid') uuid: string, @Request() req) {
    return this.activityTypesService.delete(uuid, req.user.uuid as string);
  }
}

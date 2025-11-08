import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateResponsibilityDto } from './dto/create-responsibility.dto';
import { UpdateResponsibilityDto } from './dto/update-responsibility.dto';
import { ResponsibilityService } from './reponsibility.service';

@ApiBearerAuth()
@ApiTags('Responsabilité')
@Controller('responsibilities')
@UseGuards(JwtAuthGuard)
export class ResponsibilityController {
  constructor(private readonly responsibilityService: ResponsibilityService) {}

  @Get()
  @ApiOperation({ summary: 'Liste de toutes les reponsabilités ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.responsibilityService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une reponsabilité ' })
  @ApiResponse({ status: 200, description: 'reponsabilité créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateResponsibilityDto, @Request() req) {
    return this.responsibilityService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une reponsabilité par UUID' })
  @ApiResponse({ status: 200, description: 'reponsabilité trouvé.' })
  @ApiResponse({ status: 400, description: 'reponsabilité non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.responsibilityService.findOne(uuid, admin_uuid);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Modifier une responsabilité' })
  @ApiResponse({ status: 200, description: 'Localité modifié avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
  update(
    @Param('uuid') uuid: string,
    @Request() req,
    @Body() payload: UpdateResponsibilityDto,
  ) {
    return this.responsibilityService.update(uuid, payload, req.user.uuid);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une responsabilité' })
  @ApiResponse({
    status: 200,
    description: 'Responsabilité supprimé avec succès.',
  })
  @ApiResponse({ status: 400, description: 'Responsabilité introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.responsibilityService.delete(uuid, admin_uuid);
  }
}

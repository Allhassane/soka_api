import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { JournalEditionService } from './journal-edition.service';
import { CreateJournalEditionDto } from './dto/create-journal-edition.dto';
import { UpdateJournalEditionDto } from './dto/update-journal-edition.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { PaginationQueryDto } from 'src/shared/dtos/pagination-query.dto';

@ApiBearerAuth()
@ApiTags('Journal - Editions')
@Controller('journals/editions')
@UseGuards(JwtAuthGuard)
export class JournalEditionController {
  constructor(private readonly service: JournalEditionService) {}

  @Get()
  @ApiOperation({ summary: 'Liste de toutes les editions du journal' })
  @ApiResponse({ status: 200, description: 'Retour paginé' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  findAll(@Request() req, @Query() query: PaginationQueryDto) {
    const { page, limit } = query;
    return this.service.findAll(req.user.uuid as string, page, limit);
  }

  @Post()
  @ApiOperation({
    summary: 'Creer une edition',
    description: 'distribution_deadline_at est calculee automatiquement = distribution_start_at + 2 jours (regle metier).',
  })
  @ApiBody({ type: CreateJournalEditionDto })
  @ApiResponse({ status: 201, description: 'Edition creee avec succes.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants ou invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Campagne d abonnement liee introuvable.' })
  store(@Body() payload: CreateJournalEditionDto, @Request() req) {
    return this.service.store(payload, req.user.uuid as string);
  }

  @Post('upload')
  @ApiOperation({
    summary: 'Upload d un fichier d edition (couverture ou version numerique)',
    description:
      'Stocke le fichier dans uploads/journals et renvoie son URL relative (a stocker dans cover_image / digital_file). Champ multipart « file ».',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = './uploads/journals';
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          cb(null, `${Date.now()}-${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 Mo
    }),
  )
  @ApiResponse({ status: 201, description: 'Fichier stocke. Renvoie { url, filename }.' })
  @ApiResponse({ status: 400, description: 'Aucun fichier recu.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'Aucun fichier reçu (champ multipart « file » attendu).',
      );
    }
    return {
      url: `/uploads/journals/${file.filename}`,
      filename: file.originalname,
    };
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Recuperer une edition par UUID' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Edition trouvee.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Edition non trouvee.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.service.findOne(uuid, req.user.uuid as string);
  }

  @Put(':uuid')
  @ApiOperation({
    summary: 'Modifier une edition',
    description: 'Si distribution_start_at est modifiee, la deadline est recalculee automatiquement.',
  })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: UpdateJournalEditionDto })
  @ApiResponse({ status: 200, description: 'Edition modifiee avec succes.' })
  @ApiResponse({ status: 400, description: 'Champs invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Edition introuvable.' })
  update(
    @Param('uuid') uuid: string,
    @Body() payload: UpdateJournalEditionDto,
    @Request() req,
  ) {
    return this.service.update(uuid, payload, req.user.uuid as string);
  }

  @Put(':uuid/status')
  @ApiOperation({ summary: 'Changer le statut d une edition' })
  @ApiParam({ name: 'uuid', description: 'UUID de l edition' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: Object.values(GlobalStatus) } },
      required: ['status'],
    },
  })
  @ApiResponse({ status: 200, description: 'Statut modifie avec succes.' })
  @ApiResponse({ status: 400, description: 'Statut invalide.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Edition introuvable.' })
  changeStatus(
    @Param('uuid') uuid: string,
    @Body('status') status: GlobalStatus,
    @Request() req,
  ) {
    return this.service.changeStatus(uuid, status, req.user.uuid as string);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une edition (soft delete)' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Edition supprimee avec succes.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Edition introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    return this.service.delete(uuid, req.user.uuid as string);
  }
}

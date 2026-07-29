import {
  Controller,
  Post,
  Get,
  Query,
  Request,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { ImportService } from './import.service';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';

@ApiTags('Importation')
@Controller('import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('members/preview')
  @RequirePermissions('importations_analyser')
  @ApiOperation({
    summary:
      'Dry-run : analyse un fichier Excel de membres (validation + résolution) sans rien écrire',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  async previewMembers(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Aucun fichier reçu (champ multipart « file » attendu).',
      );
    }
    return this.importService.dryRun(file.buffer);
  }

  @Post('members')
  @RequirePermissions('importations_confirmer')
  @ApiOperation({
    summary:
      'Commit : importe réellement (création/mise à jour) + persiste les lignes en échec',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  async commitMembers(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { uuid: string } },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Aucun fichier reçu (champ multipart « file » attendu).',
      );
    }
    return this.importService.commit(
      file.buffer,
      req.user.uuid,
      file.originalname,
    );
  }

  @Get('members/stats')
  @RequirePermissions('importations_voir')
  @ApiOperation({ summary: 'Statistiques : total des membres en base + total des échecs persistés' })
  async stats() {
    return this.importService.stats();
  }

  @Get('members/batches')
  @RequirePermissions('importations_voir')
  @ApiOperation({
    summary:
      'Liste paginée des fichiers chargés ayant encore des erreurs (nb d\'erreurs en suspens)',
  })
  async batches(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.importService.listBatches(
      parseInt(page ?? '1', 10),
      parseInt(limit ?? '10', 10),
    );
  }

  @Get('members/failures')
  @RequirePermissions('importations_voir')
  @ApiOperation({
    summary:
      'Liste paginée des lignes en échec (filtrable par fichier via le paramètre « batch »)',
  })
  async failures(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('batch') batch?: string,
  ) {
    return this.importService.listFailures(
      parseInt(page ?? '1', 10),
      parseInt(limit ?? '10', 10),
      batch,
    );
  }

  @Get('members/failures/export')
  @RequirePermissions('importations_voir')
  @ApiOperation({
    summary:
      'Télécharge en Excel (.xlsx, ré-importable) les erreurs d\'un fichier chargé (paramètre « batch »)',
  })
  async exportFailures(
    @Res() res: Response,
    @Query('batch') batch?: string,
  ): Promise<void> {
    const { buffer, filename } = await this.importService.exportFailuresXlsx(batch);
    // @Res() => réponse pilotée à la main : contourne l'enveloppe JSON globale (ResponseInterceptor).
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}

import { Body, Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { MigrationService } from './migration.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { ApiTags } from '@nestjs/swagger';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Migration')
@Controller('migration')
export class MigrationController {
    constructor(private readonly migrationService: MigrationService) {}

    @Get(':option')
    @ApiOperation({ summary: 'Migration des données' })
    @ApiResponse({ status: 200, description: 'Données migrées avec succès.' })
    @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
    @ApiParam({ name: 'option', type: 'enum', enum: ['departments', 'divisions', 'civilities', 'accessories', 'structures', 'members'], description: 'Option de migration', required: true })
    migrate(@Param('option') option: string, @Request() req: any ) {
        return this.migrationService.migrate(option, req.user.uuid);
    }
}

import { Body, Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { MigrationService } from './migration.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('Migration')
@Controller('migration')
export class MigrationController {
    constructor(private readonly migrationService: MigrationService) {}

    /**
     * ⚠️ Route d'ÉCRITURE DE MASSE : ré-importe membres, comptes et responsabilités depuis la
     * base héritée `soka_db_old`. Elle n'était protégée que par `JwtAuthGuard` - donc ouverte à
     * tout compte authentifié, y compris un simple membre - et je l'avais initialement classée
     * « technique » dans les exemptions du garde-fou : c'est cette exemption qui était l'erreur.
     *
     * Le slug `migration_executer` n'est **volontairement pas** au catalogue de permissions :
     * un slug absent de la table `permissions` est refusé à tout le monde sauf `is_admin`
     * (cf. `PermissionsGuard`). L'outil reste donc utilisable par un administrateur technique
     * sans jamais pouvoir être accordé par erreur depuis l'écran des rôles.
     */
    @Get(':option')
    @RequirePermissions('migration_executer')
    @ApiOperation({ summary: 'Migration des données (administrateur technique uniquement)' })
    @ApiResponse({ status: 200, description: 'Données migrées avec succès.' })
    @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
    @ApiParam({ name: 'option', type: 'enum', enum: ['departments', 'divisions', 'civilities', 'accessories', 'structures', 'members'], description: 'Option de migration', required: true })
    migrate(@Param('option') option: string, @Request() req: any ) {
        return this.migrationService.migrate(option, req.user.uuid);
    }
}

import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { SuccessMessage } from 'src/shared/decorators/success-message.decorator';
import { SmsSettingsService } from './sms-settings.service';
import {
  SetActiveProviderDto,
  SetBroadcastDto,
  SetFailoverDto,
  TestSmsDto,
  ToggleProviderDto,
} from './dto/update-sms-settings.dto';
import {
  PERM_PARAMETRES_GERER_SMS,
  PERM_PARAMETRES_VOIR_SMS,
} from './sms.constants';

/**
 * Administration des fournisseurs SMS (page « Paramètres SMS »).
 *
 * Gardé par `PermissionsGuard` (jamais RolesGuard, qui est un stub ; jamais @Public).
 * Le contrôle client n'est que du confort : ces gardes serveur sont la vraie sécurité.
 * Aucun endpoint ne renvoie de credential.
 */
@ApiTags('Paramètres SMS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/settings/sms')
export class SmsSettingsController {
  constructor(private readonly service: SmsSettingsService) {}

  @Get()
  @RequirePermissions(PERM_PARAMETRES_VOIR_SMS)
  @SuccessMessage('État des fournisseurs SMS récupéré')
  @ApiOperation({
    summary: 'État SMS : fournisseur actif, toggles, failover, soldes',
  })
  @ApiResponse({ status: 200, description: 'État courant' })
  getState() {
    return this.service.getState(true);
  }

  @Put('active-provider')
  @RequirePermissions(PERM_PARAMETRES_GERER_SMS)
  @SuccessMessage('Fournisseur SMS actif mis à jour')
  @ApiOperation({ summary: 'Choisir le fournisseur SMS actif (bascule à chaud)' })
  setActive(@Body() dto: SetActiveProviderDto) {
    return this.service.setActiveProvider(dto.active_provider);
  }

  @Patch('providers/:name')
  @RequirePermissions(PERM_PARAMETRES_GERER_SMS)
  @SuccessMessage('Fournisseur SMS mis à jour')
  @ApiOperation({ summary: 'Activer / désactiver un fournisseur' })
  toggleProvider(
    @Param('name') name: string,
    @Body() dto: ToggleProviderDto,
  ) {
    return this.service.setProviderEnabled(name, dto.enabled);
  }

  @Patch('broadcast')
  @RequirePermissions(PERM_PARAMETRES_GERER_SMS)
  @SuccessMessage('Mode diffusion SMS mis à jour')
  @ApiOperation({
    summary:
      'Activer / désactiver la diffusion (envoi par TOUS les fournisseurs à la fois)',
  })
  setBroadcast(@Body() dto: SetBroadcastDto) {
    return this.service.setBroadcast(dto.enabled);
  }

  @Patch('failover')
  @RequirePermissions(PERM_PARAMETRES_GERER_SMS)
  @SuccessMessage('Repli automatique mis à jour')
  @ApiOperation({ summary: 'Activer / désactiver le failover automatique' })
  setFailover(@Body() dto: SetFailoverDto) {
    return this.service.setFailover(dto.enabled);
  }

  @Post('test')
  @RequirePermissions(PERM_PARAMETRES_GERER_SMS)
  @SuccessMessage('SMS de test traité')
  @ApiOperation({
    summary: 'Envoyer un SMS de contrôle via un fournisseur précis',
  })
  test(@Body() dto: TestSmsDto) {
    return this.service.test(dto.provider, dto.to);
  }
}

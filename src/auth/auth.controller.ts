import {
  Controller,
  Post,
  UseGuards,
  Request,
  Get,
  Headers as RequestHeaders,
  UnauthorizedException,
  ForbiddenException,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { LoginDto } from './dtos/login.dto';
import { JwtAuthGuard } from './guards/auth.guard';
import { User } from 'src/users/entities/user.entity';
import { SuccessMessage } from 'src/shared/decorators/success-message.decorator';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { JwtPayload } from './interfaces/auth.interface';
import { contexteDeRequete } from './login-journal.service';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiOperation({ summary: 'Connexion avec email + mot de passe' })
  @ApiBody({ type: LoginDto })
  login(@Request() req: { user: User }) {
    // Le contexte (IP, navigateur) sert au journal de connexion, pas à l'authentification.
    return this.authService.login(req.user, contexteDeRequete(req));
  }

  @Get('user')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Trouver les details du user connecté' })
  @ApiBearerAuth()
  async getAuthUser(@RequestHeaders('authorization') authHeader: string) {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedException('Token manquant');
    }

    return this.authService.getAuthenticatedUser(token);
  }

  @Post('logout')
  @SuccessMessage('Déconnexion réussie')
  @ApiOperation({
    summary:
      'Déconnexion (JWT est stateless, supprimer le token coté client pour déconnexion)',
  })
  logout() {}

  @Patch('reset-password/:uuid')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Réinitialiser son mot de passe (soi-même ou admin)' })
  async resetPassword(
    @Param('uuid') uuid: string,
    @Body() resetPasswordDto: ResetPasswordDto,
    @Request() req: { user: JwtPayload },
  ) {
    const requester = req.user;
    if (requester?.uuid !== uuid && requester?.is_admin !== true) {
      throw new ForbiddenException(
        'Vous ne pouvez réinitialiser que votre propre mot de passe.',
      );
    }
    return this.authService.resetPassword(uuid, resetPasswordDto.newPassword);
  }

  // « Mot de passe oublié » (public) : génère un nouveau mot de passe et l'envoie par SMS.
  // ⚠️ Répond en erreur explicite (404 / 403 / 429 / 503) - voir requestPasswordReset :
  // la page d'accueil affiche ce message tel quel dans une alerte.
  @Post('forgot-password')
  @ApiOperation({
    summary:
      'Mot de passe oublié : génère un nouveau mot de passe et l envoie par SMS',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'SMS envoyé ; `data.retry_after` = délai (s) avant une relance',
  })
  @ApiResponse({ status: 403, description: 'Compte désactivé' })
  @ApiResponse({ status: 404, description: 'Aucun compte pour ce numéro' })
  @ApiResponse({ status: 429, description: 'Relance trop rapprochée (5 min)' })
  @ApiResponse({ status: 503, description: "L'envoi du SMS a échoué" })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.phone_number);
  }
}

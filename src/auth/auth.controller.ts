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
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { LoginDto } from './dtos/login.dto';
import { JwtAuthGuard } from './guards/auth.guard';
import { User } from 'src/users/entities/user.entity';
import { SuccessMessage } from 'src/shared/decorators/success-message.decorator';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { JwtPayload } from './interfaces/auth.interface';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiOperation({ summary: 'Connexion avec email + mot de passe' })
  @ApiBody({ type: LoginDto })
  login(@Request() req: { user: User }) {
    return this.authService.login(req.user);
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
}

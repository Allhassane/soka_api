// src/auth/strategies/local.strategy.ts
import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { contexteDeRequete } from '../login-journal.service';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'phone_number',
      passwordField: 'password',
      session: false,
      // La requête est passée au callback UNIQUEMENT pour journaliser l'IP et le
      // navigateur des tentatives (2026-08-19) : sans elle, un balayage de mots de passe
      // à 4 chiffres réparti sur des centaines de comptes reste invisible. Aucun autre
      // usage - la validation, elle, ne dépend que du couple identifiant/mot de passe.
      passReqToCallback: true,
    });
  }

  async validate(
    req: unknown,
    phone_number: string,
    password: string,
  ): Promise<Omit<User, 'password'>> {
    const user = await this.authService.validateUser(
      phone_number,
      password,
      contexteDeRequete(req),
    );
    if (!user) throw new UnauthorizedException('Identifiants invalides');
    return user;
  }
}

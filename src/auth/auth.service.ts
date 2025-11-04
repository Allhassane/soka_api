import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../users/user.service';
import { User } from '../users/entities/user.entity';
import { DecodedJwt, JwtPayload } from './interfaces/auth.interface';
import { RoleService } from 'src/roles/role.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly roleService: RoleService
  ) {}

  async validateUser(
    identifier: string,
    password: string,
  ): Promise<Omit<User, 'password'> | null> {
    const normalized = (identifier ?? '').replace(/\s+/g, '').trim();

    const user = await this.userService.findByLoginWithPassword(normalized);
    if (!user) return null;

    if (!user.is_active) {
      throw new UnauthorizedException('Compte désactivé');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    const { password: _password, ...userWithoutPassword } = user;
    void _password;
    return userWithoutPassword as Omit<User, 'password'>;
  }

    async login(user: User) {
  const payload: JwtPayload = {
    sub: user.id,
    uuid: user.uuid,
    ...(user.email ? { email: user.email } : {}),
    ...(user.phone_number ? { phone_number: user.phone_number } : {}),
  };

  const token = this.jwtService.sign(payload);
  const decoded = this.jwtService.decode(token) as null | { exp?: number };

  // Récupération des rôles de l'utilisateur
  const roles = await this.userService.findUserRoles(user.uuid);

  // Récupération des permissions globales liées au rôle
  let globalPermissions: any[] = [];
  if (roles && roles.length > 0) {
    const firstRole = roles[0]; // Si multi-rôles, on prend le 1er
    const rolePermData =
      await this.roleService.findGlobalPermissions(firstRole.role_uuid);

    globalPermissions = rolePermData.permissions || [];
  }

  return {
    user: {
      id: user.id,
      uuid: user.uuid,
      email: user.email ?? null,
      phone_number: user.phone_number,
      roles,
      global_permissions: globalPermissions, // Permissions depuis le rôle (allPermissions)
    },
    access_token: token,
    expires_in: typeof decoded?.exp === 'number' ? decoded.exp : null,
  };
}


  async getAuthenticatedUser(token: string): Promise<Omit<User, 'password'>> {
    try {
      const decoded: unknown = this.jwtService.verify(token);

      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        !('sub' in decoded)
      ) {
        throw new UnauthorizedException('Token mal formé');
      }

      const { sub } = decoded as DecodedJwt;

      const user = await this.userService.findByIdWithRole(sub);
      if (!user) {
        throw new UnauthorizedException('Utilisateur introuvable');
      }

      const { password: _password, ...userWithoutPassword } = user;
      void _password;
      return userWithoutPassword as Omit<User, 'password'>;
    } catch (error) {
      void error;
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from 'src/shared/decorators/public.decorator';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { JwtPayload } from '../interfaces/auth.interface';

/**
 * Contrôle d'autorisation par permission (slug).
 * À utiliser APRÈS le JwtAuthGuard : `@UseGuards(JwtAuthGuard, PermissionsGuard)`
 * afin que `req.user` (le payload JWT enrichi : permissions[] + is_admin) soit disponible.
 *
 * - Route `@Public()` ou sans `@RequirePermissions` => laissée passer.
 * - Superadmin technique (`is_admin === true`) => contourne le contrôle.
 * - Sinon : exige que l'utilisateur possède au moins une des permissions requises.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;

    if (!user) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }

    // Le superadmin technique (compte bootstrap) contourne le contrôle de permissions.
    if (user.is_admin === true) return true;

    const userPermissions = Array.isArray(user.permissions)
      ? user.permissions
      : [];
    const hasPermission = required.some((p) => userPermissions.includes(p));

    if (!hasPermission) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission d'effectuer cette action",
      );
    }
    return true;
  }
}

import { SetMetadata } from '@nestjs/common';

/**
 * Déclare la/les permission(s) (slug) requise(s) sur une route.
 * Vérifié par le PermissionsGuard. Plusieurs slugs => l'un d'eux suffit (OU logique).
 *
 * Exemple : @RequirePermissions('roles_ajouter_un_role')
 */
export const REQUIRE_PERMISSIONS_KEY = 'require_permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);

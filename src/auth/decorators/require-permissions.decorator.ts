import { SetMetadata } from '@nestjs/common';

/**
 * Déclare la/les permission(s) (slug) requise(s) sur une route.
 * Vérifié par le PermissionsGuard. Plusieurs slugs => l'un d'eux suffit (OU logique).
 *
 * Exemple : @RequirePermissions('roles_ajouter_un_role')
 */
export const REQUIRE_PERMISSIONS_KEY = 'require_permissions';

/**
 * Registre des slugs **réellement contrôlés côté API**, alimenté à l'exécution par le décorateur
 * lui-même (donc toujours exhaustif et jamais à maintenir à la main - y compris quand le slug est
 * passé via une constante, ex. `@RequirePermissions(MANAGE_COMMITTEE_MEMBERS)`).
 *
 * À quoi ça sert : seuls ces slugs ont besoin de voyager dans le JWT (c'est la seule chose que lit
 * `PermissionsGuard`). Les autres permissions ne pilotent que l'affichage du menu et des boutons,
 * et transitent déjà par `user.global_permissions` dans le corps de la réponse de login.
 * Y limiter `payload.permissions` **borne la taille du token** : sans ce filtre, un utilisateur
 * cumulant plusieurs rôles (via `user_roles` et via ses comités) dépasse les 4 096 octets du
 * cookie de session, que le navigateur jette alors silencieusement ⇒ boucle sur la page de login.
 *
 * Les décorateurs s'exécutent à l'import des contrôleurs, donc avant toute requête : le registre
 * est complet au premier login.
 */
export const ENFORCED_PERMISSION_SLUGS = new Set<string>();

export const RequirePermissions = (...permissions: string[]) => {
  for (const permission of permissions) {
    if (permission) ENFORCED_PERMISSION_SLUGS.add(permission);
  }
  return SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
};

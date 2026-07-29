import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Permissions EFFECTIVES d'un utilisateur, résolues à la demande depuis la base.
 *
 * Remplace l'embarquement des slugs dans le JWT. Deux raisons, dans cet ordre :
 *
 * 1. **Le token finit dans un cookie plafonné à 4 096 o** que le navigateur jette en silence
 *    au-delà - la connexion boucle alors sur la page de login, sans message. Ce plafond a été
 *    atteint deux fois (46 slugs d'admin le 2026-07-25, puis 138 slugs après la protection de
 *    248 routes). Le contourner à chaque fois par un filtre revenait à repousser un mur : le
 *    supprimer suppose de ne plus rien y mettre qui grossisse avec l'application.
 * 2. **Les droits n'étaient plus figés jusqu'à la reconnexion.** Accorder une permission prend
 *    désormais effet en moins d'une fenêtre de cache.
 *
 * Coût : une requête par utilisateur et par fenêtre de cache - pas une par requête HTTP.
 */
@Injectable()
export class EffectivePermissionsService {
  /** Durée de validité d'une entrée. Compromis entre fraîcheur des droits et charge SQL. */
  private static readonly TTL_MS = 30_000;
  /** Garde-fou mémoire : au-delà, on repart d'un cache vide plutôt que de fuir. */
  private static readonly TAILLE_MAX = 5_000;

  private readonly cache = new Map<string, { at: number; slugs: Set<string> }>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Invalide un utilisateur (ou tout le cache) après un changement de droits. */
  invalider(userUuid?: string): void {
    if (userUuid) this.cache.delete(userUuid);
    else this.cache.clear();
  }

  async slugsFor(user: {
    uuid?: string | null;
    member_uuid?: string | null;
  }): Promise<Set<string>> {
    const userUuid = user?.uuid;
    if (!userUuid) return new Set();

    const maintenant = Date.now();
    const enCache = this.cache.get(userUuid);
    if (enCache && maintenant - enCache.at < EffectivePermissionsService.TTL_MS) {
      return enCache.slugs;
    }

    const slugs = await this.charger(userUuid, user.member_uuid ?? null);

    if (this.cache.size >= EffectivePermissionsService.TAILLE_MAX) this.cache.clear();
    this.cache.set(userUuid, { at: maintenant, slugs });
    return slugs;
  }

  /**
   * DEUX requêtes : d'abord les uuid de rôles (union des trois provenances), puis leurs
   * permissions actives.
   *
   * ⚠️ **Ne pas refondre en une seule requête avec `IN (SELECT … UNION …)`.** C'était la
   * première version : MySQL l'exécutait en `DEPENDENT SUBQUERY`, ré-évaluée pour chaque ligne
   * de `roles_permissions`, soit **2 121 ms mesurées** par résolution. Passer une liste de
   * valeurs littérales supprime la dépendance et laisse l'optimiseur utiliser les index
   * (`IDX_user_roles_user_uuid`, `IDX_roles_permissions_role_uuid`, migration 1782800700000).
   *
   * ⚠️ Filtres à ne pas retirer : `deleted_at` sur les trois liaisons (un rôle retiré ne doit
   * plus rien accorder) et `status <> 'disable'` sur le rôle, la responsabilité et le comité.
   */
  private async charger(
    userUuid: string,
    memberUuid: string | null,
  ): Promise<Set<string>> {
    const roles = await this.dataSource.query(
      `SELECT ur.role_uuid AS role_uuid
         FROM user_roles ur
        WHERE ur.user_uuid = ? AND ur.is_active = 1 AND ur.deleted_at IS NULL
        UNION
       SELECT resp.role_uuid
         FROM member_responsibilities mr
         JOIN responsibilities resp
           ON resp.uuid = mr.responsibility_uuid AND resp.deleted_at IS NULL
        WHERE mr.member_uuid = ? AND mr.deleted_at IS NULL
          AND resp.role_uuid IS NOT NULL
          AND COALESCE(resp.status, 'enable') <> 'disable'
        UNION
       SELECT c.role_uuid
         FROM committee_members cm
         JOIN committees c ON c.uuid = cm.committee_uuid AND c.deleted_at IS NULL
        WHERE cm.member_uuid = ? AND cm.deleted_at IS NULL
          AND c.role_uuid IS NOT NULL
          AND COALESCE(c.status, 'enable') <> 'disable'`,
      [userUuid, memberUuid, memberUuid],
    );

    const roleUuids = [
      ...new Set<string>((roles ?? []).map((r: any) => r.role_uuid).filter(Boolean)),
    ];

    const slugs =
      roleUuids.length === 0
        ? new Set<string>() // (ne PAS envoyer `IN ()`, SQL invalide)
        : await this.slugsDesRoles(roleUuids);

    /**
     * Repli MEMBRE — **doit rester aligné sur `auth.service.ts`**, qui applique le même repli au
     * `global_permissions` renvoyé au front. Sans lui, un compte sans aucune source de rôle
     * voyait ses permissions dans l'interface (via le repli du login) et se faisait refuser par
     * l'API (via ce service) : des boutons visibles menant à des 403.
     */
    if (slugs.size > 0) return slugs;

    const membre = await this.dataSource.query(
      "SELECT `uuid` FROM `roles` WHERE `slug` = 'membre' AND `deleted_at` IS NULL LIMIT 1",
    );
    const membreUuid = membre?.[0]?.uuid;
    return membreUuid ? this.slugsDesRoles([membreUuid]) : slugs;
  }

  /** Slugs actifs d'un lot de rôles. Une requête, index sur `roles_permissions.role_uuid`. */
  private async slugsDesRoles(roleUuids: string[]): Promise<Set<string>> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT p.slug AS slug
         FROM roles_permissions rp
         JOIN permissions p ON p.uuid = rp.permission_uuid
         JOIN roles r ON r.uuid = rp.role_uuid
        WHERE rp.status = 1
          AND r.deleted_at IS NULL
          AND COALESCE(r.status, 'enable') <> 'disable'
          AND rp.role_uuid IN (?)`,
      [roleUuids],
    );

    return new Set<string>((rows ?? []).map((r: any) => r.slug).filter(Boolean));
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';
import { syncPermissionCatalog } from '../permission/permission-catalog-sync';

/**
 * Synchronise la base sur le catalogue de permissions REFONDU du 2026-08-01
 * (`src/permission/permission-catalog.ts`) - suite de l'audit
 * `AUDIT-PERMISSIONS-2026-08-01.md` : 344 permissions dont 96 fantômes et ~85 alias
 * techniques (« 2 slugs, 1 action »), remplacées par un catalogue canonique où chaque
 * capacité réelle (menu, action, onglet, information sensible) porte UN slug, identique
 * côté API et côté web.
 *
 * Ce que fait la synchronisation (logique partagée avec `npm run seed:permissions`,
 * détail dans `permission-catalog-sync.ts`) :
 *  - upsert des modules et permissions PAR SLUG (uuid conservés) ;
 *  - les droits accordés existants sont PRÉSERVÉS et ne peuvent que s'élargir : quand un
 *    alias supprimé était coché pour un rôle, la permission canonique qui l'absorbe
 *    devient cochée (`absorbs`) - personne ne perd une capacité ;
 *  - les nouvelles permissions (participants / présence / quotas / comités d'activité,
 *    statistiques financières de campagne, attribution des permissions d'un rôle…)
 *    héritent de l'état du droit dont elles sont découpées (`seedFrom`) ;
 *  - suppression des permissions hors catalogue et de leurs liens, purge des ~684 lignes
 *    `roles_permissions` orphelines (rôles supprimés) ;
 *  - une ligne `roles_permissions` par rôle × permission (sans ligne, la case de
 *    Paramètres → Rôles est incochable), `role_id`/`permission_id` à 0 (jointure
 *    numérique piégée - cf. api/CLAUDE.md).
 *
 * En PROD, `migrationsRun: true` applique cette migration seule au démarrage de l'API :
 * le catalogue de la base converge vers celui du code sans intervention manuelle.
 * Une sauvegarde JSON des trois tables est écrite dans `backups/` avant toute écriture
 * (best-effort).
 *
 * ⚠️ `down()` est un no-op : la transformation absorbe et supprime des lignes dont la
 * recomposition exacte n'est pas dérivable du seul état final. Le retour arrière passe
 * par la sauvegarde JSON (ou l'instantané SQL pris avant déploiement).
 *
 * ⚠️ Effet à l'écran après RECONNEXION (permissions d'affichage posées au login) ;
 * côté API < 30 s (cache `EffectivePermissionsService`).
 */
export class SyncPermissionCatalogV21782902000000 implements MigrationInterface {
  name = 'SyncPermissionCatalogV21782902000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rapport = await syncPermissionCatalog(queryRunner.manager, { backup: true });
    console.log(
      `[SyncPermissionCatalogV2] permissions +${rapport.permissionsInserees} / -${rapport.permissionsSupprimees.length}, ` +
        `liens +${rapport.liensInseres} / élargis ${rapport.liensElargis} / -${rapport.liensSupprimes}, ` +
        `orphelins purgés ${rapport.liensOrphelinsPurges}. Actifs par rôle : ${JSON.stringify(rapport.actifsParRole)}` +
        (rapport.backupFile ? ` (sauvegarde : ${rapport.backupFile})` : ''),
    );
  }

  public async down(): Promise<void> {
    // Volontairement vide : restauration par la sauvegarde JSON de `backups/`
    // (`permissions-avant-sync-*.json`) ou l'instantané SQL pris avant déploiement.
  }
}

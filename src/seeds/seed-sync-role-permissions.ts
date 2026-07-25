import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import AppDataSource from '../data-source';
import { Role } from '../roles/entities/role.entity';
import { PermissionEntity } from '../permission/entities/permission.entity';
import { RolePermissionEntity } from '../role-permission/entities/role-permission.entity';

/**
 * SEED — Synchronisation des liens rôle ↔ permission.
 *
 * Après avoir AJOUTÉ des permissions (ex. seed:journal-permissions), les rôles
 * existants n'ont PAS de ligne `roles_permissions` pour ces nouvelles
 * permissions. Résultat : dans l'écran d'attribution, cocher une nouvelle
 * permission échoue avec « Aucun élément trouvé » (le toggle reçoit un uuid
 * null car aucune ligne n'existe).
 *
 * Ce seed crée les liens manquants pour TOUS les rôles × TOUTES les permissions
 * (status = false par défaut). IDEMPOTENT : les liens déjà présents sont
 * ignorés. À rejouer après tout ajout de permission.
 *
 * Exécution (depuis soka_api) :
 *   npm run seed:sync-role-permissions
 */

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[seed] Base cible : ${ds.options.database as string}`);

  try {
    const roleRepo = ds.getRepository(Role);
    const permRepo = ds.getRepository(PermissionEntity);
    const rpRepo = ds.getRepository(RolePermissionEntity);

    const roles = await roleRepo.find();
    const permissions = await permRepo.find();
    console.log(
      `[seed] Rôles : ${roles.length} | Permissions : ${permissions.length}`,
    );

    let created = 0;
    let already = 0;

    for (const role of roles) {
      // Le lien réel se fait par role_uuid + permission_uuid. Les colonnes
      // numériques role_id/permission_id sont des placeholders (= 0 dans les
      // données existantes) car `roles.id` est un char(36), incompatible avec
      // la colonne int `role_id`.
      const existingRows = await rpRepo.find({
        where: { role_uuid: role.uuid },
        select: ['permission_uuid'],
      });
      const has = new Set(existingRows.map((r) => r.permission_uuid));
      already += has.size;

      const toCreate = permissions
        .filter((p) => !has.has(p.uuid))
        .map((p) =>
          rpRepo.create({
            uuid: uuidv4(),
            role_id: 0,
            permission_id: 0,
            role_uuid: role.uuid,
            permission_uuid: p.uuid,
            status: false,
          }),
        );

      const chunk = 500;
      for (let i = 0; i < toCreate.length; i += chunk) {
        await rpRepo.save(toCreate.slice(i, i + chunk));
      }
      created += toCreate.length;
      if (toCreate.length) {
        console.log(`[seed]   ${role.name} : +${toCreate.length} lien(s)`);
      }
    }

    console.log(
      `[seed] Liens rôle-permission créés : ${created} | déjà présents : ${already}`,
    );
    console.log(
      '[seed] Terminé. Le toggle des nouvelles permissions fonctionne désormais.',
    );
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[seed] Échec :', err);
  process.exit(1);
});

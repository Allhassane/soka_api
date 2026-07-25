import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import AppDataSource from '../data-source';
import { ModuleEntity } from '../module/entities/module.entity';
import { PermissionEntity } from '../permission/entities/permission.entity';
import { User } from '../users/entities/user.entity';

/**
 * SEED - Permissions du module JOURNAL.
 *
 * Crée le module « Journal » (s'il n'existe pas) puis insère les permissions
 * d'action (boutons du détail d'édition + CRUD éditions/zones/destinations).
 * IDEMPOTENT : une permission déjà présente (même slug) est ignorée → le seed
 * peut être rejoué pour COMPLÉTER les permissions existantes.
 *
 * NB : ce seed crée les permissions. Pour qu'elles masquent réellement les
 * boutons, il faut envelopper ceux-ci côté front avec <Protected permission="slug">
 * (je peux le faire ensuite). Les slugs ci-dessous sont les identifiants à
 * utiliser.
 *
 * Exécution (depuis soka_api) :
 *   npm run seed:journal-permissions
 */

const MODULE_NAME = 'Journal';
const MODULE_DESCRIPTION =
  'Gestion du journal : éditions, zones, destinations, distribution et réception.';

// Liste des permissions { slug, name }. Le slug est l'identifiant stable.
const PERMISSIONS: { slug: string; name: string }[] = [
  // - Module / vues -
  { slug: 'journals_voir_le_module_journal', name: 'Voir le module journal' },
  { slug: 'journals_voir_le_detail_dune_edition', name: "Voir le détail d'une édition" },
  { slug: 'journals_voir_les_besoins_par_zone', name: 'Voir les besoins par zone' },
  { slug: 'journals_voir_le_suivi_de_reception', name: 'Voir le suivi de réception' },
  { slug: 'journals_voir_lanalytique_de_reception', name: "Voir l'analytique de réception" },

  // - Éditions (CRUD) -
  { slug: 'journals_creer_une_edition', name: 'Créer une édition' },
  { slug: 'journals_modifier_une_edition', name: 'Modifier une édition' },
  { slug: 'journals_supprimer_une_edition', name: 'Supprimer une édition' },

  // - Détail édition : distribution -
  { slug: 'journals_lancer_la_distribution', name: 'Lancer la distribution' },
  {
    slug: 'journals_confirmer_ou_completer_une_zone',
    name: "Confirmer / compléter la réception d'une zone",
  },
  {
    slug: 'journals_voir_le_detail_dune_distribution',
    name: "Voir le détail d'une distribution",
  },

  // - Détail édition : réception -
  { slug: 'journals_valider_le_lot_dun_district', name: "Valider le lot d'un district" },
  { slug: 'journals_cocher_la_reception_dun_membre', name: "Cocher la réception d'un membre" },

  // - Détail édition : impression -
  {
    slug: 'journals_imprimer_le_rapport_dimpression',
    name: "Imprimer le rapport d'impression",
  },
  {
    slug: 'journals_exporter_le_rapport_dimpression',
    name: "Exporter le rapport d'impression",
  },

  // - Zones -
  { slug: 'journals_creer_une_zone', name: 'Créer une zone' },
  { slug: 'journals_modifier_une_zone', name: 'Modifier une zone' },
  { slug: 'journals_supprimer_une_zone', name: 'Supprimer une zone' },

  // - Destinations -
  { slug: 'journals_creer_une_destination', name: 'Créer une destination' },
  { slug: 'journals_modifier_une_destination', name: 'Modifier une destination' },
  { slug: 'journals_supprimer_une_destination', name: 'Supprimer une destination' },
];

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[seed] Base cible : ${ds.options.database as string}`);

  try {
    const moduleRepo = ds.getRepository(ModuleEntity);
    const permRepo = ds.getRepository(PermissionEntity);
    const userRepo = ds.getRepository(User);

    // admin_uuid requis pour le module : on prend un admin, sinon le 1er user.
    const admin =
      (await userRepo.findOne({ where: { is_admin: true } })) ??
      (await userRepo.find({ take: 1 }))[0];
    if (!admin) {
      throw new Error("Aucun utilisateur trouvé pour renseigner admin_uuid.");
    }

    // Module « Journal » (créer si absent). Le slug est auto-généré (@BeforeInsert).
    let mod = await moduleRepo.findOne({ where: { name: MODULE_NAME } });
    if (!mod) {
      mod = await moduleRepo.save(
        moduleRepo.create({
          uuid: uuidv4(),
          name: MODULE_NAME,
          description: MODULE_DESCRIPTION,
          admin_uuid: admin.uuid,
          status: 'enable',
        }),
      );
      console.log(`[seed] Module « ${MODULE_NAME} » créé (uuid=${mod.uuid}).`);
    } else {
      console.log(
        `[seed] Module « ${MODULE_NAME} » déjà présent (uuid=${mod.uuid}).`,
      );
    }

    let created = 0;
    let skipped = 0;
    let relinked = 0;
    for (const p of PERMISSIONS) {
      const existing = await permRepo.findOne({ where: { slug: p.slug } });
      if (existing) {
        // Rattache au module Journal si la permission n'a pas de module.
        if (!existing.module_uuid) {
          existing.module_uuid = mod.uuid;
          await permRepo.save(existing);
          relinked++;
        }
        skipped++;
        continue;
      }
      await permRepo.save(
        permRepo.create({
          uuid: uuidv4(),
          name: p.name,
          slug: p.slug,
          module_uuid: mod.uuid,
        }),
      );
      created++;
    }

    console.log(
      `[seed] Permissions - créées : ${created} | déjà présentes : ${skipped}` +
        (relinked ? ` (dont ${relinked} rattachées au module)` : '') +
        ` | total visé : ${PERMISSIONS.length}`,
    );
    console.log('[seed] Terminé.');
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[seed] Échec :', err);
  process.exit(1);
});

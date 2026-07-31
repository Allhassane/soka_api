import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';

/**
 * Reversement d'un élément de référentiel vers un autre (« migrer les membres »).
 *
 * Ces référentiels sont pleins de variantes issues des imports : au 2026-07-31, `formations`
 * compte **1 904 entrées** pour 7 866 membres - « PREMIERE D » (11 membres), « 1ERE D » (5) et
 * « 1 ERE D » (1) désignent la même classe. Ce service déplace tous les porteurs d'un élément
 * vers un autre, puis retire éventuellement l'élément vidé.
 *
 * ── Pourquoi un service partagé plutôt qu'un copier-coller dans trois modules ────────────
 * La règle est identique pour Formations, Métiers et Localités de résidence ; seules changent la
 * table et les colonnes qui la référencent. Trois copies auraient divergé - c'est déjà arrivé sur
 * le quota d'abonnement (cf. JOURNAL 2026-07-30). Chaque module garde en revanche **sa** route et
 * **sa** permission : le droit de fusionner des formations n'est pas le droit de fusionner des
 * villes.
 *
 * ⚠️ **Une localité de résidence n'est pas référencée que par `members`.** `city_uuid` est aussi
 * porté par `journal_zone_cities` (villes desservies par une zone du journal). Migrer une ville
 * sans déplacer ces lignes laisserait une zone rattachée à une ville supprimée. D'où la liste
 * `references` ci-dessous plutôt qu'un `UPDATE members` codé en dur.
 */

/** Une colonne qui pointe vers l'élément de référentiel. */
export interface ReferenceColonne {
  table: string;
  colonne: string;
  /** Libellé lisible pour le compte-rendu (« membres », « villes desservies »…). */
  libelle: string;
  /**
   * Colonnes formant l'unicité de la ligne, hors la colonne migrée. Sert à ne pas créer de
   * doublon : si la cible est DÉJÀ rattachée à la même clé, la ligne source est supprimée au
   * lieu d'être déplacée. `undefined` = pas de risque de doublon (cas de `members`, où la
   * colonne est un simple attribut).
   */
  uniciteAvec?: string[];
}

export interface ReferentialConfig {
  /** Table du référentiel (`formations`, `jobs`, `cities`). */
  table: string;
  /** Libellé au singulier, pour les messages (« formation », « métier », « localité »). */
  libelle: string;
  /** Colonnes qui référencent cet élément. */
  references: ReferenceColonne[];
}

export interface MergeResult {
  source: { uuid: string; name: string };
  cible: { uuid: string; name: string };
  deplacements: Array<{ libelle: string; lignes: number }>;
  total: number;
  source_supprimee: boolean;
}

export interface UsageResult {
  uuid: string;
  name: string;
  details: Array<{ libelle: string; lignes: number }>;
  total: number;
}

@Injectable()
export class ReferentialMergeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly logService: LogActivitiesService,
  ) {}

  /** Élément non supprimé, ou 404. */
  private async lireElement(
    config: ReferentialConfig,
    uuid: string,
  ): Promise<{ uuid: string; name: string }> {
    const rows = await this.dataSource.query(
      `SELECT uuid, name FROM \`${config.table}\` WHERE uuid = ? AND deleted_at IS NULL LIMIT 1`,
      [uuid],
    );
    if (!rows?.[0]) {
      throw new NotFoundException(`Cette ${config.libelle} est introuvable.`);
    }
    return rows[0];
  }

  /**
   * Ce que « perdrait » l'élément s'il était vidé : le détail par colonne référençante.
   * Sert à annoncer « N membres seront déplacés » AVANT de valider.
   */
  async usage(config: ReferentialConfig, uuid: string): Promise<UsageResult> {
    const element = await this.lireElement(config, uuid);

    const details: Array<{ libelle: string; lignes: number }> = [];
    for (const ref of config.references) {
      const rows = await this.dataSource.query(
        `SELECT COUNT(*) AS n FROM \`${ref.table}\` WHERE \`${ref.colonne}\` = ?`,
        [uuid],
      );
      details.push({ libelle: ref.libelle, lignes: Number(rows?.[0]?.n ?? 0) });
    }

    return {
      uuid: element.uuid,
      name: element.name,
      details,
      total: details.reduce((somme, d) => somme + d.lignes, 0),
    };
  }

  /**
   * Déplace tous les porteurs de `sourceUuid` vers `cibleUuid`, puis supprime éventuellement
   * la source (**suppression logique** : `deleted_at`, comme le bouton Supprimer de l'écran).
   * Le tout dans une transaction : on ne veut pas d'un référentiel à moitié fusionné.
   */
  async merge(
    config: ReferentialConfig,
    sourceUuid: string,
    cibleUuid: string,
    supprimerSource: boolean,
    adminUuid: string,
  ): Promise<MergeResult> {
    if (!sourceUuid || !cibleUuid) {
      throw new BadRequestException(
        `Indiquez la ${config.libelle} de départ et celle d'arrivée.`,
      );
    }
    if (sourceUuid === cibleUuid) {
      throw new BadRequestException(
        `La ${config.libelle} de départ et celle d'arrivée sont la même : rien à migrer.`,
      );
    }

    const source = await this.lireElement(config, sourceUuid);
    const cible = await this.lireElement(config, cibleUuid);

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const deplacements: Array<{ libelle: string; lignes: number }> = [];

      for (const ref of config.references) {
        // Lignes que la cible porte déjà pour la même clé : les déplacer créerait un doublon
        // (une zone du journal desservant deux fois la même ville). On les supprime plutôt.
        if (ref.uniciteAvec?.length) {
          const cles = ref.uniciteAvec.map((c) => `\`${c}\``).join(', ');
          const jointure = ref.uniciteAvec
            .map((c) => `existante.\`${c}\` = source.\`${c}\``)
            .join(' AND ');
          await runner.manager.query(
            `DELETE source FROM \`${ref.table}\` source
               JOIN \`${ref.table}\` existante
                 ON ${jointure} AND existante.\`${ref.colonne}\` = ?
              WHERE source.\`${ref.colonne}\` = ?`,
            [cibleUuid, sourceUuid],
          );
          void cles;
        }

        const res = await runner.manager.query(
          `UPDATE \`${ref.table}\` SET \`${ref.colonne}\` = ? WHERE \`${ref.colonne}\` = ?`,
          [cibleUuid, sourceUuid],
        );
        deplacements.push({
          libelle: ref.libelle,
          lignes: Number(res?.affectedRows ?? 0),
        });
      }

      if (supprimerSource) {
        await runner.manager.query(
          `UPDATE \`${config.table}\` SET deleted_at = NOW() WHERE uuid = ?`,
          [sourceUuid],
        );
      }

      await runner.commitTransaction();

      const total = deplacements.reduce((somme, d) => somme + d.lignes, 0);

      // Journalisation APRÈS le commit : `logAction` attend l'id numérique de l'utilisateur,
      // que les contrôleurs n'ont pas (le JWT ne porte que l'uuid).
      const admin = await this.dataSource.query(
        'SELECT id FROM users WHERE uuid = ? LIMIT 1',
        [adminUuid],
      );
      if (admin?.[0]?.id) {
        await this.logService.logAction(
          `${config.table}-merge`,
          admin[0].id,
          `Reversement « ${source.name} » → « ${cible.name} » : ${total} ligne(s) déplacée(s)` +
            (supprimerSource ? `, « ${source.name} » supprimée` : ''),
        );
      }

      return {
        source,
        cible,
        deplacements,
        total,
        source_supprimee: supprimerSource,
      };
    } catch (err) {
      await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }
  }
}

/** Configurations des trois référentiels concernés. */
export const REFERENTIAL_FORMATIONS: ReferentialConfig = {
  table: 'formations',
  libelle: 'formation',
  references: [{ table: 'members', colonne: 'formation_uuid', libelle: 'membres' }],
};

export const REFERENTIAL_METIERS: ReferentialConfig = {
  table: 'jobs',
  libelle: 'métier',
  references: [{ table: 'members', colonne: 'job_uuid', libelle: 'membres' }],
};

export const REFERENTIAL_LOCALITES: ReferentialConfig = {
  table: 'cities',
  libelle: 'localité de résidence',
  references: [
    { table: 'members', colonne: 'city_uuid', libelle: 'membres' },
    {
      // Une zone ne doit pas desservir deux fois la même ville après la fusion.
      table: 'journal_zone_cities',
      colonne: 'city_uuid',
      libelle: 'villes desservies (journal)',
      uniciteAvec: ['zone_uuid'],
    },
  ],
};

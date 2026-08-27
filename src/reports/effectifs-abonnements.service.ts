import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { timingSafeEqual } from 'crypto';
import { AppConfigService } from '../config/config.service';

/** Les trois chiffres demandés, à chaque niveau de la pyramide. */
export interface TotauxRapport {
  /** Bénéficiaires DISTINCTS de la campagne. ⚠️ Ne s'additionne pas (cf. `construireArbre`). */
  abonnes: number;
  /** Somme des quantités payées. */
  abonnements: number;
  /** Membres vivants rattachés au sous-arbre. */
  membres: number;
}

/** Une ligne de paiement réussi, déjà rattachée à ses quatre ancêtres. */
export interface LignePaiementRapport {
  beneficiary_uuid: string;
  quantity: number;
  /**
   * Renseigné quand le paiement ne se rattache à AUCUN chapitre (membre supprimé, structure
   * hors arbre, rattachement au-dessus du chapitre). La ligne compte alors au national et
   * s'isole dans `non_rattaches` - elle n'est jamais écartée.
   */
  motif_non_rattachement?: string | null;
  region_uuid: string;
  region_nom: string;
  centre_regional_uuid: string;
  centre_regional_nom: string;
  centre_uuid: string;
  centre_nom: string;
  chapitre_uuid: string;
  chapitre_nom: string;
}

/** Un chapitre connu de l'arbre, avec son effectif - même s'il n'a vendu aucun abonnement. */
export interface LigneChapitreRapport {
  region_uuid: string;
  region_nom: string;
  centre_regional_uuid: string;
  centre_regional_nom: string;
  centre_uuid: string;
  centre_nom: string;
  chapitre_uuid: string;
  chapitre_nom: string;
  membres: number;
}

export interface NoeudChapitre {
  uuid: string;
  nom: string;
  totaux: TotauxRapport;
}
export interface NoeudCentre {
  uuid: string;
  nom: string;
  totaux: TotauxRapport;
  chapitres: NoeudChapitre[];
}
export interface NoeudCentreRegional {
  uuid: string;
  nom: string;
  totaux: TotauxRapport;
  centres: NoeudCentre[];
}
export interface NoeudRegion {
  uuid: string;
  nom: string;
  totaux: TotauxRapport;
  centres_regionaux: NoeudCentreRegional[];
}
/** Ce que le rapport n'a pas su rattacher - nommé, jamais tu. */
export interface NonRattaches {
  abonnes: number;
  abonnements: number;
  motifs: { motif: string; abonnes: number; abonnements: number }[];
}

export interface ArbreRapport {
  /** 🚨 COMPLET : pyramide + non rattachés. C'est ce total qui doit tomber sur la Comptabilité. */
  totaux: TotauxRapport;
  regions: NoeudRegion[];
  non_rattaches: NonRattaches;
}

/**
 * **Assemble l'arbre Région > Centre régional > Centre > Chapitre.**
 *
 * Fonction PURE : elle ne lit rien, elle transforme des lignes plates en pyramide. C'est ce qui
 * rend la règle de comptage vérifiable sans base.
 *
 * 🚨 **Les abonnés ne s'additionnent PAS.** Un bénéficiaire dont les paiements ont été reçus
 * dans deux chapitres serait compté deux fois si l'on sommait les sous-totaux. Chaque niveau
 * garde donc l'ENSEMBLE de ses bénéficiaires et rend son cardinal. Les abonnements (une
 * quantité appartient à un seul paiement) et les membres (un membre a une seule structure) se
 * somment, eux, sans risque.
 */
export function construireArbre(
  paiements: LignePaiementRapport[],
  membresParChapitre: Map<string, number>,
  chapitresConnus: LigneChapitreRapport[] = [],
): ArbreRapport {
  /* Structure de travail : à chaque niveau, un ensemble de bénéficiaires + deux compteurs. */
  interface Seau {
    uuid: string;
    nom: string;
    beneficiaires: Set<string>;
    abonnements: number;
    membres: number;
    enfants: Map<string, Seau>;
  }
  const seau = (uuid: string, nom: string): Seau => ({
    uuid,
    nom,
    beneficiaires: new Set(),
    abonnements: 0,
    membres: 0,
    enfants: new Map(),
  });

  const racine = seau('national', 'NATIONAL');
  const enfant = (parent: Seau, uuid: string, nom: string): Seau => {
    if (!parent.enfants.has(uuid)) parent.enfants.set(uuid, seau(uuid, nom));
    return parent.enfants.get(uuid) as Seau;
  };

  /** Le chemin des quatre niveaux, créé à la demande. */
  const chemin = (l: {
    region_uuid: string;
    region_nom: string;
    centre_regional_uuid: string;
    centre_regional_nom: string;
    centre_uuid: string;
    centre_nom: string;
    chapitre_uuid: string;
    chapitre_nom: string;
  }): Seau[] => {
    const region = enfant(racine, l.region_uuid, l.region_nom);
    const cr = enfant(region, l.centre_regional_uuid, l.centre_regional_nom);
    const centre = enfant(cr, l.centre_uuid, l.centre_nom);
    const chapitre = enfant(centre, l.chapitre_uuid, l.chapitre_nom);
    return [racine, region, cr, centre, chapitre];
  };

  /* 1. Les chapitres connus de l'arbre : ils doivent figurer au rapport même sans un seul
        abonnement. Les omettre ferait lire leur absence comme « ce chapitre n'existe pas ». */
  for (const c of chapitresConnus) {
    const noeuds = chemin(c);
    for (const n of noeuds) n.membres += c.membres;
  }

  /* 2. Les paiements. Un paiement sans chapitre ne se jette PAS : il compte au national et
        part dans son motif. Relevé sur données réelles - un abonnement payé disparaissait du
        rapport parce que la fiche du bénéficiaire avait été supprimée APRÈS son paiement. */
  const orphelins = new Map<string, { beneficiaires: Set<string>; abonnements: number }>();
  const beneficiairesNational = new Set<string>();
  let abonnementsNational = 0;

  for (const p of paiements) {
    beneficiairesNational.add(p.beneficiary_uuid);
    abonnementsNational += Number(p.quantity ?? 0);

    if (!p.chapitre_uuid) {
      const motif = p.motif_non_rattachement ?? 'motif inconnu';
      if (!orphelins.has(motif)) {
        orphelins.set(motif, { beneficiaires: new Set(), abonnements: 0 });
      }
      const o = orphelins.get(motif) as { beneficiaires: Set<string>; abonnements: number };
      o.beneficiaires.add(p.beneficiary_uuid);
      o.abonnements += Number(p.quantity ?? 0);
      continue;
    }

    const noeuds = chemin(p);
    for (const n of noeuds) {
      n.beneficiaires.add(p.beneficiary_uuid);
      n.abonnements += Number(p.quantity ?? 0);
    }
    /* Effectif du chapitre, si l'appelant l'a fourni séparément (cas des tests et du service :
       les membres viennent d'une autre requête que les paiements). */
    const chapitre = noeuds[4];
    if (!chapitresConnus.length && membresParChapitre.has(chapitre.uuid)) {
      const membres = membresParChapitre.get(chapitre.uuid) as number;
      if (chapitre.membres === 0) for (const n of noeuds) n.membres += membres;
    }
  }

  const totaux = (s: Seau): TotauxRapport => ({
    abonnes: s.beneficiaires.size,
    abonnements: s.abonnements,
    membres: s.membres,
  });
  const trier = (m: Map<string, Seau>) =>
    [...m.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const beneficiairesOrphelins = new Set<string>();
  let abonnementsOrphelins = 0;
  for (const o of orphelins.values()) {
    o.beneficiaires.forEach((b) => beneficiairesOrphelins.add(b));
    abonnementsOrphelins += o.abonnements;
  }

  return {
    /* Le national est COMPLET : il compte aussi ce que la pyramide n'a pas su placer. Sans ça,
       le rapport et la Comptabilité ne tomberaient pas sur le même chiffre, et l'écart serait
       invisible. */
    totaux: {
      abonnes: beneficiairesNational.size,
      abonnements: abonnementsNational,
      membres: racine.membres,
    },
    non_rattaches: {
      abonnes: beneficiairesOrphelins.size,
      abonnements: abonnementsOrphelins,
      motifs: [...orphelins.entries()]
        .map(([motif, o]) => ({
          motif,
          abonnes: o.beneficiaires.size,
          abonnements: o.abonnements,
        }))
        .sort((a, b) => b.abonnements - a.abonnements),
    },
    regions: trier(racine.enfants).map((region) => ({
      uuid: region.uuid,
      nom: region.nom,
      totaux: totaux(region),
      centres_regionaux: trier(region.enfants).map((cr) => ({
        uuid: cr.uuid,
        nom: cr.nom,
        totaux: totaux(cr),
        centres: trier(cr.enfants).map((centre) => ({
          uuid: centre.uuid,
          nom: centre.nom,
          totaux: totaux(centre),
          chapitres: trier(centre.enfants).map((chapitre) => ({
            uuid: chapitre.uuid,
            nom: chapitre.nom,
            totaux: totaux(chapitre),
          })),
        })),
      })),
    })),
  };
}

/**
 * **Rapport public d'effectifs et d'abonnements**, servi par un lien porteur d'une clé.
 *
 * 🚨 Cette route est `@Public()` : elle n'est protégée QUE par la clé. Trois règles en
 * découlent, et aucune n'est décorative :
 *  - **clé non configurée ⇒ route fermée** (404). Une variable oubliée au déploiement ne doit
 *    jamais publier les effectifs de l'organisation ;
 *  - **comparaison en temps constant** : sans elle, la clé se devine caractère par caractère
 *    au chronomètre ;
 *  - **404 et non 403** sur clé fausse : un 403 confirmerait que l'URL existe.
 *
 * ⚠️ Une clé qui voyage dans une URL finit dans l'historique du navigateur, les journaux
 * d'accès du proxy et l'en-tête `Referer`. C'est le prix assumé d'un lien cliquable ; la
 * changer se fait dans le `.env` + redémarrage.
 */
@Injectable()
export class EffectifsAbonnementsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  /** Lève `NotFoundException` si la clé fournie n'ouvre pas la porte. */
  assertCle(cle?: string): void {
    const attendue = this.config.rapportPublicKey;
    const fournie = (cle ?? '').trim();

    // Pas de clé en configuration = pas de route. Jamais l'inverse.
    if (!attendue) throw new NotFoundException();
    if (!fournie) throw new NotFoundException();

    const a = Buffer.from(attendue);
    const b = Buffer.from(fournie);
    // `timingSafeEqual` exige des longueurs égales : on compare la longueur d'abord, ce qui ne
    // révèle que la longueur de la clé - pas son contenu.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new NotFoundException();
    }
  }

  /**
   * La campagne d'abonnement retenue.
   *
   * ⚠️ **Plusieurs campagnes peuvent être `started` en parallèle** - c'est déjà arrivé sur ce
   * projet. On prend la plus récente, on la NOMME dans la réponse et on liste les autres :
   * une seconde campagne en cours ne doit pas disparaître en silence du rapport.
   */
  private async campagne(campagneUuid?: string) {
    if (campagneUuid) {
      const [c] = await this.dataSource.query(
        `SELECT uuid, name, status, amount, year, starts_at, stops_at
           FROM subscriptions WHERE uuid = ? AND deleted_at IS NULL LIMIT 1`,
        [campagneUuid],
      );
      if (!c) throw new NotFoundException();
      return { retenue: c, autres: [] as any[] };
    }

    const enCours = await this.dataSource.query(
      `SELECT uuid, name, status, amount, year, starts_at, stops_at
         FROM subscriptions
        WHERE status = 'started' AND deleted_at IS NULL
        ORDER BY created_at DESC`,
    );
    return { retenue: enCours[0] ?? null, autres: enCours.slice(1) };
  }

  /**
   * Rattache chaque structure à ses ancêtres des quatre paliers.
   *
   * 🚨 **Remontée récursive, PAS `structure_closure`** : la table de closure ne couvre que
   * 3 562 structures sur 3 782 (relevé du 2026-08-27). S'en servir ferait disparaître des
   * membres et des paiements du rapport **sans que rien ne le signale** - un rapport
   * d'effectifs qui perd des gens en silence est pire que pas de rapport.
   */
  private readonly ANCETRES = `
    WITH RECURSIVE remonte AS (
      SELECT s.uuid AS depart, s.uuid AS ancetre, s.parent_id, lv.\`order\` AS ord, s.name AS nom
        FROM structures s
        LEFT JOIN levels lv ON lv.uuid = s.level_uuid
       WHERE s.deleted_at IS NULL
      UNION ALL
      SELECT r.depart, p.uuid, p.parent_id, lp.\`order\`, p.name
        FROM remonte r
        JOIN structures p ON p.id = r.parent_id AND p.deleted_at IS NULL
        LEFT JOIN levels lp ON lp.uuid = p.level_uuid
    ),
    chemins AS (
      SELECT depart,
             MAX(CASE WHEN ord = 1 THEN ancetre END) AS region_uuid,
             MAX(CASE WHEN ord = 1 THEN nom     END) AS region_nom,
             MAX(CASE WHEN ord = 2 THEN ancetre END) AS centre_regional_uuid,
             MAX(CASE WHEN ord = 2 THEN nom     END) AS centre_regional_nom,
             MAX(CASE WHEN ord = 3 THEN ancetre END) AS centre_uuid,
             MAX(CASE WHEN ord = 3 THEN nom     END) AS centre_nom,
             MAX(CASE WHEN ord = 4 THEN ancetre END) AS chapitre_uuid,
             MAX(CASE WHEN ord = 4 THEN nom     END) AS chapitre_nom
        FROM remonte GROUP BY depart
    )`;

  /** Le rapport complet, prêt à être sérialisé. */
  async rapport(campagneUuid?: string) {
    const { retenue, autres } = await this.campagne(campagneUuid);

    const chapitres: LigneChapitreRapport[] = await this.dataSource.query(
      `${this.ANCETRES}
       SELECT c.region_uuid, c.region_nom, c.centre_regional_uuid, c.centre_regional_nom,
              c.centre_uuid, c.centre_nom, c.chapitre_uuid, c.chapitre_nom,
              COUNT(m.id) AS membres
         FROM chemins c
         JOIN members m ON m.structure_uuid = c.depart AND m.deleted_at IS NULL
        WHERE c.chapitre_uuid IS NOT NULL
        GROUP BY c.region_uuid, c.region_nom, c.centre_regional_uuid, c.centre_regional_nom,
                 c.centre_uuid, c.centre_nom, c.chapitre_uuid, c.chapitre_nom`,
    );

    const paiements: LignePaiementRapport[] = retenue
      ? await this.dataSource.query(
          /* 🚨 LEFT JOIN partout, et AUCUN filtre sur le rattachement : un paiement qu'on ne
             sait pas placer dans la pyramide doit quand même être compté (il part alors dans
             `non_rattaches` avec son motif). Un JOIN strict le faisait disparaître en silence -
             c'est exactement ce qui est arrivé à un abonnement payé dont la fiche membre a été
             supprimée APRÈS le paiement. */
          `${this.ANCETRES}
           SELECT p.beneficiary_uuid, p.quantity,
                  c.region_uuid, c.region_nom, c.centre_regional_uuid, c.centre_regional_nom,
                  c.centre_uuid, c.centre_nom, c.chapitre_uuid, c.chapitre_nom,
                  CASE
                    WHEN c.chapitre_uuid IS NOT NULL       THEN NULL
                    WHEN m.uuid IS NULL                    THEN 'bénéficiaire introuvable'
                    WHEN m.deleted_at IS NOT NULL          THEN 'fiche membre supprimée'
                    WHEN m.structure_uuid IS NULL          THEN 'membre sans structure'
                    WHEN c.depart IS NULL                  THEN 'structure absente de l’arbre'
                    ELSE 'membre rattaché au-dessus du chapitre'
                  END AS motif_non_rattachement
             FROM payments p
             LEFT JOIN members m ON m.uuid = p.beneficiary_uuid
             LEFT JOIN chemins c ON c.depart = m.structure_uuid AND m.deleted_at IS NULL
            WHERE p.source = 'subscription'
              AND p.source_uuid = ?
              AND p.payment_status = 'paid'`,
          [retenue.uuid],
        )
      : [];

    const arbre = construireArbre(
      paiements,
      new Map(chapitres.map((c) => [c.chapitre_uuid, Number(c.membres)])),
      chapitres.map((c) => ({ ...c, membres: Number(c.membres) })),
    );

    return {
      genere_le: new Date().toISOString(),
      campagne: retenue
        ? {
            uuid: retenue.uuid,
            nom: retenue.name,
            statut: retenue.status,
            annee: retenue.year,
            montant_unitaire: Number(retenue.amount ?? 0),
            debut: retenue.starts_at,
            fin: retenue.stops_at,
          }
        : null,
      /* ⚠️ Non vide = plusieurs campagnes tournent en parallèle et une seule est comptée.
         Le lecteur doit le savoir, sinon il croit lire le total des abonnements. */
      autres_campagnes_en_cours: autres.map((c: any) => ({
        uuid: c.uuid,
        nom: c.name,
      })),
      lecture: {
        abonnes: 'bénéficiaires DISTINCTS de la campagne (paiements réussis)',
        abonnements: 'somme des quantités payées',
        membres: 'membres vivants rattachés au sous-arbre',
      },
      ...arbre,
    };
  }
}

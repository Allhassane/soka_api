import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AccessScopeService } from 'src/access-scope/access-scope.service';
import { tauxCommissionHub2 } from 'src/accounting/accounting.helpers';
import { appliquerFiltresPaiementsCompta } from 'src/export-async/accounting-payments-query';
import { PaymentEntity } from 'src/payments/entities/payment.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import {
  AnomalieControle,
  ChiffresControle,
  construireControle,
} from './controle.helpers';

/** Au plus N paiements en cause listés par motif : de quoi les retrouver, pas un export. */
const MAX_PAIEMENTS_EN_CAUSE = 50;

type ControleAbonnement = ReturnType<typeof construireControle>;

/**
 * **Module Contrôle** : la cohérence paiements collectés / abonnés / journaux d'une campagne
 * d'abonnement.
 *
 * 🚨 **Les MÊMES paiements que la Comptabilité** : chaque lecture passe par
 * `appliquerFiltresPaiementsCompta` (source `subscription`, la campagne, statut `paid`) - la
 * fonction même de la tuile « Paiement réussi » et de son export. Une région est le sous-arbre
 * COMPLET de la région, par la structure du BÉNÉFICIAIRE (règle de RESPO-COMPTA-REGUL) : la
 * région X du Contrôle est la région X du filtre « Structure » de la Comptabilité.
 *
 * Lecture seule : le module n'écrit nulle part.
 */
@Injectable()
export class ControleService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,
    private readonly accessScope: AccessScopeService,
  ) {}

  /** Les campagnes d'abonnement du sélecteur : toutes, tous statuts, la plus récente d'abord. */
  async campagnesAbonnement() {
    const campagnes = await this.subscriptionRepo.find({ order: { created_at: 'DESC' } });
    return campagnes.map((c) => ({
      uuid: c.uuid,
      name: c.name,
      year: c.year ?? null,
      amount: Number(c.amount ?? 0),
      status: c.status,
    }));
  }

  /**
   * Le contrôle d'une campagne d'abonnement ; sans campagne précisée, celle EN COURS la plus
   * récente. Aucune campagne en cours : `campagne: null`, sans chiffres (pas d'erreur).
   */
  async abonnement(
    campaign_uuid?: string,
  ): Promise<Omit<Partial<ControleAbonnement>, 'campagne'> & {
    campagne: ControleAbonnement['campagne'] | null;
  }> {
    const campagne = await this.campagne(campaign_uuid);
    if (!campagne) return { campagne: null };

    const tarif = Number(campagne.amount ?? 0);
    const regions = await this.regions();
    const sousArbres = await Promise.all(regions.map((r) => this.accessScope.sousArbre(r.uuid)));

    const [global, ...parRegion] = await Promise.all([
      this.chiffres(campagne.uuid, tarif, null),
      ...sousArbres.map((structures) => this.chiffres(campagne.uuid, tarif, structures)),
    ]);

    const controle = construireControle({
      campagne: {
        uuid: campagne.uuid,
        nom: campagne.name,
        statut: campagne.status,
        annee: campagne.year ?? null,
        tarif,
      },
      taux: tauxCommissionHub2(),
      global,
      regions: regions.map((r, i) => ({ uuid: r.uuid, nom: r.name, chiffres: parRegion[i] })),
      anomalies: [],
    });
    if (controle.coherent) return controle;

    // Les paiements en cause ne se cherchent que s'il y en a : le cas courant ne coûte rien.
    const toutesRegions = new Set(sousArbres.flatMap((s) => [...s]));
    const anomalies = [
      ...(controle.controles.tarif ? [] : await this.horsTarif(campagne.uuid, tarif)),
      ...(controle.controles.regions ? [] : await this.sansRegion(campagne.uuid, toutesRegions)),
    ];
    return { ...controle, anomalies };
  }

  private async campagne(uuid?: string) {
    const demandee = uuid?.trim();
    if (demandee) {
      const c = await this.subscriptionRepo.findOne({ where: { uuid: demandee } });
      if (!c) {
        throw new NotFoundException({
          message: 'Campagne d\'abonnement inconnue.',
          data: { code: 'CAMPAGNE_INCONNUE' },
        });
      }
      return c;
    }
    return this.subscriptionRepo.findOne({
      where: { status: 'started' },
      order: { created_at: 'DESC' },
    });
  }

  /** Les régions : les enfants de la racine, comme le filtre « Structure » de la Comptabilité. */
  private async regions(): Promise<Array<{ uuid: string; name: string }>> {
    const racine = await this.structureRepo.findOne({ where: { parent_uuid: IsNull() } });
    if (!racine) return [];
    const regions = await this.structureRepo.find({
      where: { parent_uuid: racine.uuid },
      order: { name: 'ASC' },
    });
    return regions.map((r) => ({ uuid: r.uuid, name: r.name }));
  }

  /** Les paiements réussis de la campagne, bornés au bénéficiaire (`null` = tous). */
  private lignes(campagneUuid: string, structures: Set<string> | null) {
    return appliquerFiltresPaiementsCompta(this.paymentRepo.createQueryBuilder('p'), {
      type: 'subscription',
      campaign_uuid: campagneUuid,
      bucket: 'paid',
      structures,
    });
  }

  private async chiffres(
    campagneUuid: string,
    tarif: number,
    structures: Set<string> | null,
  ): Promise<ChiffresControle> {
    const r = await this.lignes(campagneUuid, structures)
      .select('COUNT(*)', 'paiements')
      .addSelect('COALESCE(SUM(p.total_amount), 0)', 'montant')
      .addSelect('COALESCE(SUM(p.quantity), 0)', 'journaux')
      .addSelect('COUNT(DISTINCT p.beneficiary_uuid)', 'abonnes')
      .addSelect(
        'COALESCE(SUM(p.quantity IS NULL OR p.quantity <= 0 OR p.total_amount <> p.quantity * :tarif), 0)',
        'hors_tarif',
      )
      .setParameter('tarif', tarif)
      // Un agrégat n'a pas d'ordre : on retire le tri de la liste posé par le filtre partagé.
      .orderBy()
      .getRawOne<Record<keyof ChiffresControle, string>>();
    return {
      paiements: Number(r?.paiements ?? 0),
      montant: Number(r?.montant ?? 0),
      journaux: Number(r?.journaux ?? 0),
      abonnes: Number(r?.abonnes ?? 0),
      hors_tarif: Number(r?.hors_tarif ?? 0),
    };
  }

  private async horsTarif(campagneUuid: string, tarif: number): Promise<AnomalieControle[]> {
    const qb = this.lignes(campagneUuid, null).andWhere(
      '(p.quantity IS NULL OR p.quantity <= 0 OR p.total_amount <> p.quantity * :tarif)',
      { tarif },
    );
    return this.enCause(qb, 'hors_tarif');
  }

  /** Bénéficiaire rattaché à aucune région (ou introuvable). */
  private async sansRegion(
    campagneUuid: string,
    structuresRegions: Set<string>,
  ): Promise<AnomalieControle[]> {
    const qb = this.lignes(campagneUuid, null);
    if (structuresRegions.size > 0) {
      // `pm.uuid IS NOT NULL` : un seul NULL dans la sous-requête rendrait le NOT IN toujours
      // inconnu, et la liste vide.
      qb.andWhere(
        `(p.beneficiary_uuid IS NULL OR p.beneficiary_uuid NOT IN (
           SELECT pm.uuid FROM members pm
            WHERE pm.uuid IS NOT NULL AND pm.structure_uuid IN (:...structuresRegions)))`,
        { structuresRegions: [...structuresRegions] },
      );
    }
    return this.enCause(qb, 'sans_region');
  }

  private async enCause(
    qb: ReturnType<ControleService['lignes']>,
    motif: AnomalieControle['motif'],
  ): Promise<AnomalieControle[]> {
    const lignes = await qb
      .select('p.transaction_id', 'transaction_id')
      .addSelect('p.created_at', 'date')
      .addSelect('p.beneficiary_name', 'beneficiaire')
      .addSelect('p.total_amount', 'montant')
      .addSelect('p.quantity', 'quantite')
      .limit(MAX_PAIEMENTS_EN_CAUSE)
      .getRawMany();
    return lignes.map((l) => ({
      transaction_id: l.transaction_id ?? null,
      date: l.date ? new Date(l.date).toISOString() : null,
      beneficiaire: l.beneficiaire ?? null,
      montant: Number(l.montant ?? 0),
      quantite: l.quantite === null || l.quantite === undefined ? null : Number(l.quantite),
      motif,
    }));
  }
}

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { DonateEntity } from 'src/donate/entities/donate.entity';
import { PaymentEntity } from 'src/payments/entities/payment.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { LevelEntity } from 'src/level/entities/level.entity';
import { AccessScopeService } from 'src/access-scope/access-scope.service';
import {
  appliquerFiltresPaiementsCompta,
  structuresDuFiltreCompta,
} from 'src/export-async/accounting-payments-query';
import {
  HubBalanceAccount,
  HubGatewayPayment,
  HubGatewayWithdrawal,
  HubService,
} from 'src/payments/hub.service';
import { AccHubSnapshotEntity, SnapshotKind } from './entities/acc-hub-snapshot.entity';
import { AccHubSnapshotLineEntity, MatchStatus } from './entities/acc-hub-snapshot-line.entity';
import { parseHub2Export } from './hub2-export.parser';
import {
  BucketStats,
  SourceStats,
  tauxCommissionHub2,
  verifierBucket,
  verifierSource,
} from './accounting.helpers';

export interface ConcordanceFiltres {
  from?: Date;
  to?: Date;
  campaign_uuid?: string;
}

/* Sources, seaux et leurs validations vivent dans `accounting.helpers.ts` : l'export du module
   doit filtrer EXACTEMENT comme cet écran (cf. le commentaire du helper). Réexportés ici pour
   ne pas casser les importateurs existants. */
export type { SourceStats, BucketStats };

/** Ce que l'application dit avoir encaissé sur le périmètre. */
interface CoteApplication {
  count: number;
  gross: number;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/**
 * **Concordance « Solde HUB2 = Solde App ».**
 *
 * 🚨 **Ce service est en LECTURE SEULE sur l'argent.** Il ne crédite, ne referme, ne recopie
 * aucun statut de paiement : il n'écrit que dans ses propres tables `acc_*`. Une seconde route
 * vers les statuts finirait par diverger de `syncHubPaymentByTransactionId` - c'est exactement
 * ce qui a produit les écarts de début août.
 */
@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  /**
   * Commission HUB2, **prélevée à la source**. Constatée à 2,0000 % exactement, identique sur
   * les 4 opérateurs, sur les 959 encaissements du rapprochement du 09/08. Elle explique à elle
   * seule que le solde du guichet soit structurellement sous les encaissements de l'application :
   * ce n'est pas un écart à corriger, c'est le coût du service.
   */
  private readonly tauxFrais = tauxCommissionHub2();

  /**
   * Solde du compte de collecte **avant mise en service** (constaté le 24/07).
   * ⚠️ Affiché comme une ligne du décompte, jamais absorbé dans un total.
   */
  private readonly soldeOuverture = Number(process.env.ACC_HUB_OPENING_BALANCE ?? 196);

  constructor(
    @InjectRepository(AccHubSnapshotEntity)
    private readonly snapshotRepo: Repository<AccHubSnapshotEntity>,
    @InjectRepository(AccHubSnapshotLineEntity)
    private readonly lineRepo: Repository<AccHubSnapshotLineEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    @InjectRepository(DonateEntity)
    private readonly donateRepo: Repository<DonateEntity>,
    private readonly hubService: HubService,
    /** Cascade du filtre « Structure » : des NOMS de structures, en lecture. */
    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,
    /** Sous-arbre d'une structure (service `@Global`) : le filtre « Structure » des lignes. */
    private readonly accessScope: AccessScopeService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Côté application
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Agrégat des encaissements de l'application sur le périmètre.
   *
   * ⚠️ Le montant qui fait foi est **`payments.total_amount`** (= prix × quantité).
   * `subscription_payments.amount * quantity` double-compterait : il porte déjà le total, et
   * l'erreur produit 13 775 000 au lieu de 10 190 000 - constaté.
   */
  async computeAppSide(filtres: ConcordanceFiltres = {}): Promise<CoteApplication> {
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(p.total_amount), 0)', 'gross')
      .where('p.payment_status = :paid', { paid: 'paid' });

    if (filtres.from) qb.andWhere('p.created_at >= :from', { from: filtres.from });
    if (filtres.to) qb.andWhere('p.created_at <= :to', { to: filtres.to });
    if (filtres.campaign_uuid) {
      qb.andWhere('p.source_uuid = :campagne', { campagne: filtres.campaign_uuid });
    }

    const r = await qb.getRawOne<{ count: string; gross: string }>();
    return { count: Number(r?.count ?? 0), gross: Number(r?.gross ?? 0) };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Statistiques par campagne (Abonnements / Zaimu)
  // ─────────────────────────────────────────────────────────────────────────────

  private verifierType(type: string): SourceStats {
    return verifierSource(type);
  }

  /**
   * Campagnes du type demandé, TOUS statuts confondus : l'argent d'une campagne archivée reste
   * de l'argent, une liste bornée aux campagnes en cours ferait « disparaître » des recettes.
   * (Les campagnes soft-supprimées restent exclues : leurs lignes ont été rapatriées le 10/08.)
   */
  async listStatsCampaigns(type: string) {
    const t = this.verifierType(type);
    if (t === 'subscription') {
      const rows = await this.subscriptionRepo.find({ order: { created_at: 'DESC' } });
      return rows.map((c) => ({
        uuid: c.uuid,
        name: c.name,
        amount: Number(c.amount ?? 0),
        status: c.status,
        year: c.year,
        starts_at: c.starts_at,
        stops_at: c.stops_at,
      }));
    }
    const rows = await this.donateRepo.find({ order: { created_at: 'DESC' } });
    return rows.map((c) => ({
      uuid: c.uuid,
      name: c.name,
      amount: Number(c.amount ?? 0),
      status: c.status,
      category: c.category,
      starts_at: c.starts_at,
      stops_at: c.stops_at,
    }));
  }

  /**
   * Compteurs par statut + montants, en UNE requête agrégée.
   *
   * ⚠️ On compte des **liens de paiement** (une ligne `payments` = un lien) - le bon
   * dénominateur pour « paiements de la campagne ». Le guichet, lui, compte des TENTATIVES :
   * comparer les deux dénominateurs terme à terme n'a pas de sens.
   *
   * La somme doit tomber juste : Total = paid + pending + failed + cancelled. C'est la raison
   * d'être de la carte « Annulés » à l'écran - sans elle, l'écran additionnerait faux.
   */
  async campaignKpi(f: { type: string; campaign_uuid?: string; from?: Date; to?: Date }) {
    const type = this.verifierType(f.type);
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .select('p.payment_status', 'statut')
      .addSelect('COUNT(*)', 'nombre')
      .addSelect('COALESCE(SUM(p.total_amount), 0)', 'montant')
      .where('p.source = :source', { source: type })
      .groupBy('p.payment_status');
    if (f.campaign_uuid) qb.andWhere('p.source_uuid = :campagne', { campagne: f.campaign_uuid });
    if (f.from) qb.andWhere('p.created_at >= :from', { from: f.from });
    if (f.to) qb.andWhere('p.created_at <= :to', { to: f.to });

    const rows = await qb.getRawMany<{ statut: string; nombre: string; montant: string }>();
    const vide = () => ({ count: 0, amount: 0 });
    const kpi = {
      total: vide(),
      paid: vide(),
      pending: vide(),
      failed: vide(),
      cancelled: vide(),
    };
    for (const r of rows) {
      const seau = kpi[r.statut as 'paid' | 'pending' | 'failed' | 'cancelled'];
      if (!seau) continue; // statut hors enum : ne pas inventer de carte
      seau.count = Number(r.nombre);
      seau.amount = arrondi(Number(r.montant));
      kpi.total.count += seau.count;
      kpi.total.amount = arrondi(kpi.total.amount + seau.amount);
    }
    return { type, campaign_uuid: f.campaign_uuid ?? null, ...kpi };
  }

  /**
   * Les lignes qui composent une carte KPI - ce que la modale affiche. Paginé : un seau peut
   * porter plus d'un millier de lignes. ⚠️ Sans filtre « Structure », le `total` rendu DOIT être
   * le chiffre de la carte (même filtre, même source) : c'est le contrat de cohérence carte ↔
   * modale. Avec, c'est la part de ce chiffre qui revient à la structure choisie.
   *
   * 🚨 Les conditions sont celles de l'export (`appliquerFiltresPaiementsCompta`) : le fichier
   * rend exactement les lignes de ce tableau, filtre « Structure » compris.
   */
  async campaignPayments(f: {
    type: string;
    campaign_uuid?: string;
    bucket?: string;
    /** Filtre « Structure » : structure du BÉNÉFICIAIRE, sous-arbre complet. */
    structure_uuid?: string;
    page?: number;
    limit?: number;
  }) {
    const type = this.verifierType(f.type);
    const bucket = verifierBucket(f.bucket);
    const structures = await structuresDuFiltreCompta(this.accessScope, f.structure_uuid);
    // 20 = la page du tableau à l'écran (pagination sous les cartes KPI).
    const limit = Math.min(Math.max(Number(f.limit ?? 20) || 20, 1), 200);
    const page = Math.max(Number(f.page ?? 1) || 1, 1);

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      // Seules les colonnes affichées : pas de raison de charger l'entité entière
      // (payment_url, identités dupliquées…) pour une ligne de tableau.
      .select([
        'p.uuid',
        'p.created_at',
        'p.paid_at',
        'p.beneficiary_name',
        'p.actor_name',
        'p.total_amount',
        'p.provider',
        'p.payment_status',
        'p.failure_code',
        'p.failure_message',
        'p.transaction_id',
        'p.hub_payment_id',
      ]);
    appliquerFiltresPaiementsCompta(qb, {
      type,
      campaign_uuid: f.campaign_uuid,
      bucket,
      structures,
    });
    qb.skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((p) => ({
        uuid: p.uuid,
        created_at: p.created_at,
        paid_at: p.paid_at,
        beneficiary_name: p.beneficiary_name,
        actor_name: p.actor_name,
        total_amount: Number(p.total_amount),
        provider: p.provider,
        payment_status: p.payment_status,
        failure_code: p.failure_code,
        failure_message: p.failure_message,
        transaction_id: p.transaction_id,
        hub_payment_id: p.hub_payment_id,
      })),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * **La cascade du filtre « Structure »** : les enfants directs d'une structure (les régions
   * quand aucun parent n'est donné), triés par nom, avec leur palier.
   *
   * 🚨 **Aucun périmètre, et c'est voulu** : le module Comptabilité est global (une permission,
   * aucune borne). Le rôle COMPTABLE n'est pas administrateur ; la cascade partagée
   * `/structure/childrens` est bornée au périmètre du connecté et lui rendrait des menus vides,
   * sans message, dès le deuxième palier. Il ne sort d'ici que des noms : ni effectif, ni membre.
   */
  async listFilterStructures(parent_uuid?: string) {
    let parent = parent_uuid?.trim() || undefined;

    if (!parent) {
      const racine = await this.structureRepo.findOne({ where: { parent_uuid: IsNull() } });
      if (!racine) return [];
      parent = racine.uuid;
    } else if (!(await this.structureRepo.exists({ where: { uuid: parent } }))) {
      throw new BadRequestException({
        message: 'Structure inconnue : le filtre ne désigne aucune structure existante.',
        data: { code: 'STRUCTURE_INCONNUE' },
      });
    }

    const lignes = await this.structureRepo
      .createQueryBuilder('s')
      // ⚠️ Jointure sur `level_uuid`, pas sur la relation `level` : celle-ci passe par
      // `level_id`, vide sur toutes les structures (3 802 sur 3 802 le 27/09).
      .leftJoin(LevelEntity, 'l', 'l.uuid = s.level_uuid')
      .select('s.uuid', 'uuid')
      .addSelect('s.name', 'name')
      .addSelect('l.name', 'palier')
      .where('s.parent_uuid = :parent', { parent })
      .orderBy('s.name', 'ASC')
      .getRawMany();

    return lignes.map((l) => ({ uuid: l.uuid, name: l.name, palier: l.palier ?? null }));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Côté guichet
  // ─────────────────────────────────────────────────────────────────────────────

  /** Compte XOF d'une liste de comptes de solde ; null si absent - jamais un zéro inventé. */
  private compteXof(comptes: HubBalanceAccount[] | undefined): number | null {
    const compte = (comptes ?? []).find((c) => (c.currency ?? '').toLowerCase() === 'xof');
    if (!compte) return null;
    return Number(compte.availableBalance ?? compte.amount);
  }

  /**
   * **Solde HUB2 constaté à l'instant T**, relayé par le guichet (compte de collecte).
   *
   * C'est la preuve opposable au « solde net attendu » du décompte : les deux doivent
   * concorder, et leur écart éventuel se chiffre - il ne se devine pas.
   */
  async liveBalance() {
    const solde = await this.hubService.getGatewayBalance();
    return {
      environment: solde.environment,
      collection_xof: this.compteXof(solde.collection),
      transfer_xof: this.compteXof(solde.transfer),
      at: new Date(),
    };
  }

  /**
   * Solde du compte de collecte, pour l'instantané. C'est une preuve EN PLUS : sa panne ne doit
   * pas priver l'écran de la liste (l'essentiel). On la signale, on n'échoue pas - `null`,
   * jamais un zéro inventé.
   */
  private async releverSolde(): Promise<number | null> {
    try {
      return this.compteXof((await this.hubService.getGatewayBalance()).collection);
    } catch (e) {
      this.logger.warn(`[CONCORDANCE] Relevé de solde impossible : ${e?.message ?? e}`);
      return null;
    }
  }

  /**
   * Construit le pont **guichet → application** : `linkId` de la liste marchande est exactement
   * `payments.transaction_id`.
   *
   * C'est la seule voie qui donne aussi `hub2PaymentId`, la clé de l'export HUB2 - que
   * `checkPaymentStatus` ne rend pas. Sans ce pont, un export ne s'apparie à rien.
   *
   * ⚠️ **UNE lecture de `payments`, réduite aux colonnes du verdict**, puis l'appariement en
   * mémoire. `transaction_id` n'a pas d'index : chaque paquet `IN (500)` d'avant balayait toute
   * la table (17 balayages pour les 9 323 tentatives du 2026-09-26). Sans index, toute requête
   * balaie la table : autant n'en faire qu'une.
   */
  private async pontVersApplication(
    transactions: HubGatewayPayment[],
  ): Promise<Map<string, PaymentEntity>> {
    const liens = new Set(transactions.map((t) => t.linkId).filter(Boolean));
    const parLien = new Map<string, PaymentEntity>();
    if (liens.size === 0) return parLien;

    const paiements = await this.paymentRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.uuid', 'p.transaction_id', 'p.payment_status', 'p.total_amount'])
      .where('p.transaction_id IS NOT NULL')
      .getMany();
    for (const p of paiements) {
      if (liens.has(p.transaction_id)) parLien.set(p.transaction_id, p);
    }
    return parLien;
  }

  /**
   * Verdict d'appariement d'une transaction du guichet face à la ligne de l'application.
   *
   * 🚨 **Le guichet liste TOUTES les tentatives d'un lien, l'application n'en a qu'UNE ligne.**
   * Un lien payé au deuxième essai produit donc une tentative `failed` en face d'un paiement
   * `paid` : ce n'est pas une divergence, c'est un réessai. Mesuré sur les données réelles avant
   * ce correctif : **19 fausses divergences pour 285 000 XOF**, toutes de ce type - de quoi faire
   * croire à une fuite d'argent là où il n'y en a aucune.
   * ⇒ Le verdict d'une tentative NON réussie se juge donc au niveau du LIEN
   * (`lienAvecReussite`), jamais isolément.
   *
   * @param lienAReussi vrai si une tentative du même lien a abouti au guichet
   */
  private verdict(
    montantHub: number,
    reussiHub: boolean,
    payment: PaymentEntity | undefined,
    lienAReussi: boolean,
  ): MatchStatus {
    if (!payment) return MatchStatus.UNMATCHED_HUB;
    const paye = payment.payment_status === 'paid';

    if (!reussiHub) {
      // Une tentative échouée est cohérente tant que le sort du LIEN l'est : payée côté app avec
      // une réussite au guichet (réessai), ou non payée des deux côtés. Le seul cas fautif est
      // un paiement crédité alors qu'AUCUNE tentative n'a abouti - là, l'argent est en cause.
      return paye && !lienAReussi ? MatchStatus.STATUS_MISMATCH : MatchStatus.MATCHED;
    }

    // L'ordre compte : un désaccord de STATUT prime sur un désaccord de montant. Une
    // transaction encaissée au guichet et non créditée dans l'app est un problème d'argent ;
    // un écart de montant sur deux lignes d'accord sur l'encaissement est un problème de
    // saisie. Les confondre noierait le premier dans le second.
    if (!paye) return MatchStatus.STATUS_MISMATCH;
    if (arrondi(Number(payment.total_amount)) !== arrondi(montantHub)) {
      return MatchStatus.AMOUNT_MISMATCH;
    }
    return MatchStatus.MATCHED;
  }

  /**
   * **Instantané `gateway`** : interroge la liste marchande du guichet, apparie ligne à ligne
   * par `linkId`, agrège et enregistre.
   *
   * ⚠️ Les frais sont **théoriques** ici : la liste marchande ne les rend pas. Seul l'export
   * HUB2 porte les frais réellement prélevés - d'où son statut de juge de paix.
   */
  async refreshFromGateway(
    filtres: ConcordanceFiltres = {},
    auteurUuid?: string,
  ): Promise<AccHubSnapshotEntity> {
    // Les trois lectures sont indépendantes : elles partent ENSEMBLE. En série, le relevé de
    // solde (aller-retour guichet → HUB2) et l'agrégat s'ajoutaient à la lecture de la liste ;
    // en parallèle, ils sont aussi pris au plus près du même instant qu'elle.
    const [{ payments: transactions, complet }, soldeConstate, app] = await Promise.all([
      this.hubService.listGatewayPayments({ from: filtres.from, to: filtres.to }),
      this.releverSolde(),
      this.computeAppSide(filtres),
    ]);

    // 🚨 Sonde de pureté : le guichet borne sa liste à SON environnement (correctif du
    // 2026-08-11 - avant lui, 47 250 XOF d'essais sandbox passaient pour des encaissements
    // réels). Si des environnements mélangés réapparaissent ici, le filtre du guichet a
    // régressé : on le dit au journal plutôt que d'afficher un écart imaginaire sans indice.
    const environnements = new Set(
      transactions.map((t) => t.environment).filter((e): e is string => !!e),
    );
    if (environnements.size > 1) {
      this.logger.warn(
        `[CONCORDANCE] Liste du guichet MÉLANGÉE (${[...environnements].join(', ')}) : `
        + 'le filtre d\'environnement du guichet a régressé.',
      );
    }

    const pont = await this.pontVersApplication(transactions);

    let brut = 0;
    let reussis = 0;
    const compteurs = {
      [MatchStatus.MATCHED]: 0,
      [MatchStatus.UNMATCHED_HUB]: 0,
      [MatchStatus.AMOUNT_MISMATCH]: 0,
      [MatchStatus.STATUS_MISMATCH]: 0,
    };
    const apparies = new Set<string>();

    const lignes: Partial<AccHubSnapshotLineEntity>[] = [];

    // Quels liens ont abouti au guichet : nécessaire pour ne pas prendre un réessai pour une
    // divergence (cf. `verdict`).
    const liensAyantReussi = new Set(
      transactions.filter((t) => t.status === 'successful').map((t) => t.linkId),
    );

    for (const t of transactions) {
      const reussi = t.status === 'successful';
      if (reussi) {
        brut += Number(t.amount ?? 0);
        reussis += 1;
      }
      const payment = pont.get(t.linkId);
      const verdict = this.verdict(
        Number(t.amount ?? 0),
        reussi,
        payment,
        liensAyantReussi.has(t.linkId),
      );
      compteurs[verdict] += 1;
      if (payment) apparies.add(payment.uuid);

      lignes.push({
        // On stocke l'identifiant HUB2 quand il existe : c'est lui qui permettra de recouper
        // cet instantané avec un export. À défaut seulement, celui du guichet.
        hub_payment_id: t.hub2PaymentId ?? t.id,
        hub_status: t.status,
        amount: String(arrondi(Number(t.amount ?? 0))),
        fees: '0',
        provider: t.provider ?? null,
        msisdn: null,
        hub_created_at: t.createdAt ? new Date(t.createdAt) : null,
        purchase_reference: null,
        matched_payment_uuid: payment?.uuid ?? null,
        match_status: verdict,
        heuristic: false,
      });
    }

    const frais = arrondi(brut * this.tauxFrais);

    return this.enregistrerInstantane({
      kind: SnapshotKind.GATEWAY,
      label: `Guichet SOKA Pay${complet ? '' : ' (lecture TRONQUÉE)'}`,
      filtres,
      auteurUuid,
      soldeConstate,
      hubTotal: transactions.length,
      hubSucces: reussis,
      hubBrut: brut,
      hubFrais: frais,
      app,
      compteurs,
      appNonApparies: Math.max(0, app.count - apparies.size),
      tronque: !complet,
      lignes,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Import d'un export HUB2
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * **Instantané `export`** : la preuve périodique, qui fait foi (frais réels compris).
   *
   * L'export ne connaît que l'identifiant **HUB2**. Le pont vers l'application passe donc par la
   * liste marchande du guichet (`hub2PaymentId` → `linkId` → `transaction_id`). Si le guichet est
   * injoignable, l'import n'échoue pas : il se rabat sur un appariement par **montant + fenêtre
   * de 24 h**, chaque ligne ainsi devinée étant marquée `heuristic` - un rapprochement deviné ne
   * doit jamais se faire passer pour une preuve.
   */
  async importExport(
    fichier: { originalname: string; buffer: Buffer },
    filtres: ConcordanceFiltres = {},
    auteurUuid?: string,
  ): Promise<AccHubSnapshotEntity> {
    const { lignes: exportees, ignorees } = parseHub2Export(fichier.buffer);
    if (exportees.length === 0) {
      throw new NotFoundException({
        message: 'Aucune ligne exploitable dans ce fichier.',
        data: { code: 'EXPORT_VIDE', ignorees: ignorees.length },
      });
    }

    // Le pont. Une panne du guichet dégrade la précision, elle n'interdit pas l'import.
    let versApplication = new Map<string, PaymentEntity>();
    let hub2VersLien = new Map<string, string>();
    try {
      const { payments: transactions } = await this.hubService.listGatewayPayments({});
      versApplication = await this.pontVersApplication(transactions);
      hub2VersLien = new Map(
        transactions
          .filter((t) => t.hub2PaymentId)
          .map((t) => [t.hub2PaymentId as string, t.linkId]),
      );
    } catch (e) {
      this.logger.warn(
        `[CONCORDANCE] Guichet injoignable pendant l'import : appariement dégradé (${e?.message ?? e})`,
      );
    }

    let brut = 0;
    let frais = 0;
    let reussis = 0;
    const compteurs = {
      [MatchStatus.MATCHED]: 0,
      [MatchStatus.UNMATCHED_HUB]: 0,
      [MatchStatus.AMOUNT_MISMATCH]: 0,
      [MatchStatus.STATUS_MISMATCH]: 0,
    };
    const apparies = new Set<string>();
    const lignes: Partial<AccHubSnapshotLineEntity>[] = [];

    // Même précaution qu'au rafraîchissement : l'export liste toutes les tentatives, l'app n'a
    // qu'une ligne par lien. Sans ça, chaque réessai passerait pour une divergence.
    const liensAyantReussi = new Set(
      exportees
        .filter((l) => l.status === 'successful')
        .map((l) => hub2VersLien.get(l.paymentId))
        .filter((lien): lien is string => !!lien),
    );

    for (const l of exportees) {
      const reussi = l.status === 'successful';
      if (reussi) {
        brut += l.amount;
        frais += l.fees;
        reussis += 1;
      }

      const lien = hub2VersLien.get(l.paymentId);
      const payment = lien ? versApplication.get(lien) : undefined;
      const verdict = this.verdict(
        l.amount,
        reussi,
        payment,
        !!lien && liensAyantReussi.has(lien),
      );
      compteurs[verdict] += 1;
      if (payment) apparies.add(payment.uuid);

      lignes.push({
        hub_payment_id: l.paymentId,
        hub_status: l.status,
        amount: String(arrondi(l.amount)),
        fees: String(arrondi(l.fees)),
        provider: l.provider,
        msisdn: l.msisdn,
        hub_created_at: l.createdAt,
        purchase_reference: l.purchaseReference,
        matched_payment_uuid: payment?.uuid ?? null,
        match_status: verdict,
        heuristic: false,
      });
    }

    // 🚨 **La période de l'export doit être appliquée au côté application.** Un export HUB2
    // couvre l'intervalle qu'on a demandé à HUB2, pas toute la vie du service : comparer ses
    // 6 725 701 XOF au total complet de l'application (11 600 101) affiche un gouffre
    // imaginaire de 4,9 millions. Constaté en éprouvant l'import réel avant toute mise en
    // service. Faute de filtre explicite, la période est donc DÉDUITE des lignes elles-mêmes.
    const dates = exportees
      .map((l) => l.createdAt)
      .filter((d): d is Date => !!d)
      .map((d) => d.getTime());
    const periode: ConcordanceFiltres = {
      ...filtres,
      from: filtres.from ?? (dates.length ? new Date(Math.min(...dates)) : undefined),
      to: filtres.to ?? (dates.length ? new Date(Math.max(...dates)) : undefined),
    };

    const app = await this.computeAppSide(periode);

    return this.enregistrerInstantane({
      kind: SnapshotKind.EXPORT,
      periode,
      label: `Export HUB2 - ${fichier.originalname}`,
      fichier: fichier.originalname,
      filtres,
      auteurUuid,
      hubTotal: exportees.length,
      hubSucces: reussis,
      hubBrut: brut,
      hubFrais: frais,
      app,
      compteurs,
      appNonApparies: Math.max(0, app.count - apparies.size),
      tronque: false,
      lignes,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Enregistrement
  // ─────────────────────────────────────────────────────────────────────────────

  private async enregistrerInstantane(p: {
    kind: SnapshotKind;
    label: string;
    fichier?: string;
    filtres: ConcordanceFiltres;
    /** Période réellement couverte, déduite des données quand aucun filtre n'est donné. */
    periode?: ConcordanceFiltres;
    auteurUuid?: string;
    hubTotal: number;
    hubSucces: number;
    hubBrut: number;
    hubFrais: number;
    /** Solde HUB2 relevé au même instant ; absent = pas de relevé (import, panne). */
    soldeConstate?: number | null;
    app: CoteApplication;
    compteurs: Record<MatchStatus, number>;
    appNonApparies: number;
    tronque: boolean;
    /** TOUTES les lignes lues : les compteurs en viennent, seules celles en écart sont écrites. */
    lignes: Partial<AccHubSnapshotLineEntity>[];
  }): Promise<AccHubSnapshotEntity> {
    const hubNet = arrondi(p.hubBrut - p.hubFrais);
    const appFrais = arrondi(p.app.gross * this.tauxFrais);
    const appNet = arrondi(p.app.gross - appFrais);

    const instantane = this.snapshotRepo.create({
      kind: p.kind,
      label: p.label,
      imported_file: p.fichier ?? null,
      period_start: p.periode?.from ?? p.filtres.from ?? null,
      period_end: p.periode?.to ?? p.filtres.to ?? null,
      created_by_uuid: p.auteurUuid ?? null,
      opening_balance: String(this.soldeOuverture),
      hub_total_count: p.hubTotal,
      hub_success_count: p.hubSucces,
      hub_gross: String(arrondi(p.hubBrut)),
      hub_fees: String(arrondi(p.hubFrais)),
      hub_net: String(hubNet),
      gateway_balance:
        p.soldeConstate === null || p.soldeConstate === undefined
          ? null
          : String(arrondi(p.soldeConstate)),
      app_success_count: p.app.count,
      app_gross: String(arrondi(p.app.gross)),
      app_fees_theoretical: String(appFrais),
      app_net: String(appNet),
      gap_gross: String(arrondi(p.hubBrut - p.app.gross)),
      gap_net: String(arrondi(hubNet - appNet)),
      matched_count: p.compteurs[MatchStatus.MATCHED],
      unmatched_hub_count: p.compteurs[MatchStatus.UNMATCHED_HUB],
      unmatched_app_count: p.appNonApparies,
      mismatch_count:
        p.compteurs[MatchStatus.AMOUNT_MISMATCH] + p.compteurs[MatchStatus.STATUS_MISMATCH],
      truncated: p.tronque,
    });

    const enregistre = await this.snapshotRepo.save(instantane);

    // 🚨 **Seules les lignes EN ÉCART sont écrites** ; l'en-tête ci-dessus compte TOUTES les
    // lignes (`matched_count`…). Les lignes appariées - 97 % du volume au 2026-09-25 - ne sont
    // lues par aucun écran ni aucune route utilisée, et les écrire coûtait 10 à 17 s par clic en
    // production : le second poste du « Rafraîchir » qui dépassait les 30 s du navigateur.
    const enEcart = p.lignes.filter((l) => l.match_status !== MatchStatus.MATCHED);

    // Insertion par paquets : un `save` de plusieurs milliers d'entités d'un coup dépasse la
    // taille de paquet MySQL par défaut.
    const TAILLE = 500;
    for (let i = 0; i < enEcart.length; i += TAILLE) {
      const paquet = enEcart
        .slice(i, i + TAILLE)
        .map((l) => this.lineRepo.create({ ...l, snapshot_uuid: enregistre.uuid }));
      await this.lineRepo.save(paquet);
    }

    return enregistre;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lecture
  // ─────────────────────────────────────────────────────────────────────────────

  private async dernier(kind: SnapshotKind): Promise<AccHubSnapshotEntity | null> {
    return this.snapshotRepo.findOne({
      where: { kind, deleted_at: IsNull() },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Met en forme le décompte d'un instantané, **solde d'ouverture en ligne visible**.
   *
   * @param retraits total des retraits HUB2 réussis (TOUS : le solde attendu se compare au solde
   *   relevé à l'instant, qui les a tous subis) ; `null` si HUB2 n'a pas pu les rendre - le solde
   *   attendu est alors inconnu, jamais calculé sur un zéro inventé.
   */
  private vue(s: AccHubSnapshotEntity | null, retraits: number | null) {
    if (!s) return null;
    const ouverture = Number(s.opening_balance);
    const brut = Number(s.hub_gross);
    const frais = Number(s.hub_fees);
    return {
      uuid: s.uuid,
      label: s.label,
      at: s.created_at,
      truncated: s.truncated,
      count: s.hub_success_count,
      total_count: s.hub_total_count,
      gross: brut,
      fees: frais,
      // Relevé d'audit du 11/08 : la réponse doit se décrire elle-même. Un instantané
      // `gateway` ne connaît que des frais THÉORIQUES (2 %) ; seul un export HUB2 porte les
      // frais réellement prélevés (mesuré : 232 907 réels vs 232 906,02 estimés).
      fees_estimated: s.kind === SnapshotKind.GATEWAY,
      net: Number(s.hub_net),
      // Le solde relevé au moment de l'instantané - null si le relevé n'a pas eu lieu
      // (`!= null` couvre aussi les instantanés antérieurs à la colonne).
      gateway_balance: s.gateway_balance != null ? Number(s.gateway_balance) : null,
      // Le décompte, ligne à ligne : c'est la forme sous laquelle il doit s'afficher.
      decompte: {
        solde_ouverture: ouverture,
        encaissements: brut,
        frais: -frais,
        // Une LIGNE, comme le solde d'ouverture : un retrait fondu dans un total produirait un
        // écart permanent et sans nom (100 001 F du 16 au 26/09).
        retraits: retraits === null ? null : retraits > 0 ? -retraits : 0,
        solde_attendu: retraits === null ? null : arrondi(ouverture + brut - frais - retraits),
      },
      decomposition: {
        matched: s.matched_count,
        unmatched_hub: s.unmatched_hub_count,
        unmatched_app: s.unmatched_app_count,
        mismatch: s.mismatch_count,
      },
    };
  }

  /** L'écran de l'égalité. */
  async overview(filtres: ConcordanceFiltres = {}) {
    const [guichet, exporte, retraits] = await Promise.all([
      this.dernier(SnapshotKind.GATEWAY),
      this.dernier(SnapshotKind.EXPORT),
      this.totalRetraits(),
    ]);

    // 🚨 **L'export ne fait foi que s'il est AUSSI RÉCENT que la lecture du guichet.**
    // Il porte les frais réellement prélevés, ce qui justifie sa préséance - mais un export
    // ancien et partiel ne doit pas masquer une lecture fraîche et complète. Constaté à l'écran :
    // un export arrêté au 07/08 (6 725 701 XOF) prenait le pas sur un rafraîchissement du jour
    // (11 600 301), et l'utilisateur voyait 6,7 M là où le guichet en portait 11,6 - de quoi
    // croire l'écran faux alors qu'il obéissait simplement à une mauvaise règle de préséance.
    const exportEstAJour =
      !!exporte
      && (!guichet || exporte.created_at.getTime() >= guichet.created_at.getTime());
    const reference = exportEstAJour ? exporte : (guichet ?? exporte);

    // 🚨 **Comparer à périmètre égal, ou ne pas comparer.** Un instantané ne couvre pas
    // forcément toute la vie du service : un export HUB2 arrêté début août (6,7 M) confronté au
    // total complet de l'application (11,6 M) afficherait un écart imaginaire de 4,9 millions.
    // Faute de filtre explicite de l'appelant, on reprend donc la PÉRIODE de l'instantané de
    // référence.
    const perimetre: ConcordanceFiltres = {
      ...filtres,
      from: filtres.from ?? reference?.period_start ?? undefined,
      to: filtres.to ?? reference?.period_end ?? undefined,
    };

    const app = await this.computeAppSide(perimetre);
    const appFrais = arrondi(app.gross * this.tauxFrais);
    const appNet = arrondi(app.gross - appFrais);

    const gapBrut = reference ? arrondi(Number(reference.hub_gross) - app.gross) : null;
    const gapNet = reference ? arrondi(Number(reference.hub_net) - appNet) : null;

    return {
      filtres: {
        from: filtres.from ?? null,
        to: filtres.to ?? null,
        campaign_uuid: filtres.campaign_uuid ?? null,
      },
      // La période réellement comparée, qu'elle vienne de l'appelant ou de l'instantané. Elle
      // doit être AFFICHÉE : une égalité n'a de sens qu'accompagnée du périmètre sur lequel elle
      // a été mesurée.
      perimetre_compare: {
        from: perimetre.from ?? null,
        to: perimetre.to ?? null,
        herite_de_instantane: !filtres.from && !!reference?.period_start,
      },
      app: {
        count: app.count,
        gross: arrondi(app.gross),
        fees_theoretical: appFrais,
        net: appNet,
        fee_rate: this.tauxFrais,
      },
      reference_source: reference ? reference.kind : null,
      // Dit à l'écran POURQUOI c'est cette source qui sert de référence. Sans ça, un utilisateur
      // qui connaît le solde réel de son compte HUB2 voit un autre chiffre et conclut que
      // l'écran ment.
      reference_motif: !reference
        ? null
        : reference.kind === SnapshotKind.EXPORT
          ? 'export le plus récent : il porte les frais réellement prélevés'
          : exporte
            ? 'lecture du guichet plus récente que le dernier export'
            : 'aucun export importé à ce jour',
      gateway: this.vue(guichet, retraits),
      export: this.vue(exporte, retraits),
      equality: {
        gross_ok: gapBrut === 0,
        net_ok: gapNet === 0,
        gap_gross: gapBrut,
        gap_net: gapNet,
        // Sans instantané, on ne prétend pas à une égalité : on le dit.
        evaluated: reference !== null,
      },
    };
  }

  async listSnapshots(limit = 20) {
    return this.snapshotRepo.find({
      where: { deleted_at: IsNull() },
      order: { created_at: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  async listLines(snapshotUuid: string, matchStatus?: MatchStatus, limit = 200) {
    const instantane = await this.snapshotRepo.findOne({
      where: { uuid: snapshotUuid, deleted_at: IsNull() },
    });
    if (!instantane) throw new NotFoundException('Instantané introuvable.');

    return this.lineRepo.find({
      where: {
        snapshot_uuid: snapshotUuid,
        ...(matchStatus ? { match_status: matchStatus } : {}),
      },
      order: { hub_created_at: 'DESC' },
      take: Math.min(limit, 1000),
    });
  }

  /**
   * Pose une note de résolution sur un écart (« transaction de la phase de tests », etc.).
   * ⚠️ N'écrit QUE dans `acc_hub_snapshot_lines` : expliquer un écart ne le fait pas disparaître
   * des comptes, et surtout ne touche à aucun paiement.
   */
  async resolveLine(lineUuid: string, note: string, auteurUuid?: string) {
    const ligne = await this.lineRepo.findOne({ where: { uuid: lineUuid } });
    if (!ligne) throw new NotFoundException('Ligne introuvable.');

    ligne.resolution_note = note;
    ligne.resolved_by_uuid = auteurUuid ?? null;
    ligne.resolved_at = new Date();
    return this.lineRepo.save(ligne);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Compte de retrait - lu chez HUB2
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Les retraits du compte de collecte, **lus chez HUB2** (approvisionnements collecte →
   * transfert, relayés par le guichet) : aucun retrait ne se crée dans l'application.
   *
   * Le total ne compte que les retraits **réussis** en F CFA : un approvisionnement échoué ou en
   * cours n'a pas débité la collecte, il est listé sans être retranché.
   */
  private async retraitsHub() {
    const retraits = await this.hubService.listGatewayWithdrawals();
    const items = retraits
      .map((r) => this.vueRetrait(r))
      .sort((a, b) => (b.withdrawn_at ?? '').localeCompare(a.withdrawn_at ?? ''));
    const total = items
      .filter(
        (r) => r.status === 'successful' && r.amount !== null && r.currency?.toUpperCase() === 'XOF',
      )
      .reduce((somme, r) => somme + (r.amount ?? 0), 0);
    return { items, total: arrondi(total), count: items.length };
  }

  private vueRetrait(r: HubGatewayWithdrawal) {
    return {
      id: r.id,
      withdrawn_at: r.date,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      description: r.description,
      failure_reason: r.failureCause?.message ?? r.failureCause?.code ?? null,
    };
  }

  /**
   * Total des retraits réussis, pour le décompte. `null` si HUB2 ne les a pas rendus : le solde
   * attendu devient alors inconnu - retrancher zéro afficherait un écart qui n'existe pas.
   */
  private async totalRetraits(): Promise<number | null> {
    try {
      return (await this.retraitsHub()).total;
    } catch (e) {
      this.signalerRetraitsIllisibles(e);
      return null;
    }
  }

  /**
   * ⚠️ Le motif, jamais l'erreur entière : une erreur axios embarque l'en-tête `Authorization`
   * (la clé marchande live). Et un refus de connexion n'a PAS de message sous Node 20 (erreur
   * agrégée IPv4/IPv6) : sans le code, la ligne sortait vide (constaté le 27/09).
   */
  private signalerRetraitsIllisibles(e: any) {
    this.logger.warn(`[RETRAITS] Lecture impossible : ${e?.message || e?.code || 'motif inconnu'}`);
  }

  /** Les retraits HUB2, les plus récents d'abord, et le total de ceux qui ont débité la collecte. */
  async listWithdrawals() {
    try {
      return await this.retraitsHub();
    } catch (e) {
      this.signalerRetraitsIllisibles(e);
      throw new ServiceUnavailableException({
        message: 'Les retraits n\'ont pas pu être lus chez HUB2. Réessayez dans un instant.',
        data: { code: 'RETRAITS_INDISPONIBLES' },
      });
    }
  }
}

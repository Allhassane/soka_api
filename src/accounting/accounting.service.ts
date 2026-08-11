import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PaymentEntity } from 'src/payments/entities/payment.entity';
import { HubGatewayPayment, HubService } from 'src/payments/hub.service';
import { AccHubSnapshotEntity, SnapshotKind } from './entities/acc-hub-snapshot.entity';
import { AccHubSnapshotLineEntity, MatchStatus } from './entities/acc-hub-snapshot-line.entity';
import { parseHub2Export } from './hub2-export.parser';

export interface ConcordanceFiltres {
  from?: Date;
  to?: Date;
  campaign_uuid?: string;
}

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
  private readonly tauxFrais = Number(process.env.ACC_HUB_FEE_RATE ?? 0.02);

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
    private readonly hubService: HubService,
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
  // Côté guichet
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Construit le pont **guichet → application** : `linkId` de la liste marchande est exactement
   * `payments.transaction_id`.
   *
   * C'est la seule voie qui donne aussi `hub2PaymentId`, la clé de l'export HUB2 - que
   * `checkPaymentStatus` ne rend pas. Sans ce pont, un export ne s'apparie à rien.
   */
  private async pontVersApplication(
    transactions: HubGatewayPayment[],
  ): Promise<Map<string, PaymentEntity>> {
    const liens = [...new Set(transactions.map((t) => t.linkId).filter(Boolean))];
    const parLien = new Map<string, PaymentEntity>();
    if (liens.length === 0) return parLien;

    // Par paquets : une clause IN de plusieurs milliers d'éléments est refusée par MySQL bien
    // avant d'être lente.
    const TAILLE = 500;
    for (let i = 0; i < liens.length; i += TAILLE) {
      const paquet = liens.slice(i, i + TAILLE);
      const trouves = await this.paymentRepo
        .createQueryBuilder('p')
        .where('p.transaction_id IN (:...ids)', { ids: paquet })
        .getMany();
      for (const p of trouves) parLien.set(p.transaction_id, p);
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
    const { payments: transactions, complet } = await this.hubService.listGatewayPayments({
      from: filtres.from,
      to: filtres.to,
    });

    const pont = await this.pontVersApplication(transactions);
    const app = await this.computeAppSide(filtres);

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
    app: CoteApplication;
    compteurs: Record<MatchStatus, number>;
    appNonApparies: number;
    tronque: boolean;
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

    // Insertion par paquets : un `save` de plusieurs milliers d'entités d'un coup dépasse la
    // taille de paquet MySQL par défaut.
    const TAILLE = 500;
    for (let i = 0; i < p.lignes.length; i += TAILLE) {
      const paquet = p.lignes
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

  /** Met en forme le décompte d'un instantané, **solde d'ouverture en ligne visible**. */
  private vue(s: AccHubSnapshotEntity | null) {
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
      net: Number(s.hub_net),
      // Le décompte, ligne à ligne : c'est la forme sous laquelle il doit s'afficher.
      decompte: {
        solde_ouverture: ouverture,
        encaissements: brut,
        frais: -frais,
        solde_attendu: arrondi(ouverture + brut - frais),
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
    const [guichet, exporte] = await Promise.all([
      this.dernier(SnapshotKind.GATEWAY),
      this.dernier(SnapshotKind.EXPORT),
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
      gateway: this.vue(guichet),
      export: this.vue(exporte),
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
}

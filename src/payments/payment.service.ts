import { Injectable, Logger, NotFoundException, BadRequestException,ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AccessScopeService } from 'src/access-scope/access-scope.service';
import { In, Repository } from 'typeorm';

import { PaymentEntity, PaymentStatus } from './entities/payment.entity';
import { CreatePaymentDto, PaymentSource } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

import { MemberEntity } from 'src/members/entities/member.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { DonateEntity } from '../donate/entities/donate.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { User } from 'src/users/entities/user.entity';
import { HubService } from './hub.service';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { StructureService } from 'src/structure/structure.service';
import { DonatePaymentEntity } from 'src/donate-payment/entities/donate-payment.entity';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { TransactionWithDetails } from './types/transaction-with-details.type';
import axios from 'axios';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { ExportJobService, ExportJobFilters } from 'src/export-async/export-job.service';
import { ExportProcessorService } from 'src/export-async/export-processor.service';
import * as fs from 'fs';
import * as path from 'path';
import { ExportJobStatus, TYPE_EXPORT_COMPTA } from 'src/export-async/entities/export-job.entity';
import { filter } from 'rxjs';
import {
  HubPaymentSyncBatchResult,
  HubPaymentSyncResult,
} from './types/hub-payment-sync-result.type';
import { HubPaymentDetails } from './types/hub-payment-details.type';
import {
  CRON_ABANDON_AFTER_HOURS,
  RECHECK_CLOSED_FOR_HOURS,
} from './abandon.constants';

/** Interrogations du guichet menées de front pendant une synchronisation en masse. */
const SYNC_CONCURRENCY = 5;

/**
 * Plafond de la file de **re-vérification des tentatives closes**, DISTINCT de celui des
 * tentatives en attente.
 *
 * 🚨 **Les deux files ne doivent jamais partager un plafond.** Versées dans la même requête,
 * les lignes closes (72 sur 48 h en régime courant, **350 le 07/08**) mangeraient les 500
 * places au détriment des `pending` - et le tri DESC, qui est le vrai garde-fou hérité de la
 * perte de 585 000 XOF, ne protégerait plus rien. Deux files, deux plafonds, deux tris.
 */
const RECHECK_BATCH_LIMIT = 300;

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private paymentRepo: Repository<PaymentEntity>,

    @InjectRepository(MemberEntity)
    private memberRepo: Repository<MemberEntity>,

    @InjectRepository(SubscriptionEntity)
    private subscriptionRepo: Repository<SubscriptionEntity>,

    @InjectRepository(DonateEntity)
    private donationRepo: Repository<DonateEntity>,

    @InjectRepository(DonatePaymentEntity)
    private donatePaymentRepo: Repository<DonatePaymentEntity>,

    @InjectRepository(SubscriptionPaymentEntity)
    private subscriptionPaymentRepo: Repository<SubscriptionPaymentEntity>,

    private exportJobService: ExportJobService,
    private exportProcessorService: ExportProcessorService,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    private structureService: StructureService,


    private readonly logService: LogActivitiesService,
    private readonly hubService: HubService,

    /** Périmètre hiérarchique du demandeur (service @Global). */
    private readonly accessScopeService: AccessScopeService,
  ) { }

  // ----------------------------------------------------------
  //  LISTER LES PAIEMENTS
  // ----------------------------------------------------------
  /**
   * ⚠️ Cette liste joint l'**entité membre complète** du bénéficiaire et de l'acteur (téléphone,
   * WhatsApp, e-mail, date de naissance, adresse). Elle était renvoyée **sans aucun filtre** :
   * toute personne détenant `paiements_voir` lisait les coordonnées de l'organisation entière.
   *
   * Le périmètre est un contrôle **distinct** de la permission : `paiements_voir` accorde le
   * droit d'ouvrir l'écran, le filtre ci-dessous borne les lignes au sous-arbre du demandeur.
   */
  async findAll(admin_uuid: string, source?: PaymentSource) {
    const query = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.beneficiary', 'beneficiary')
      .leftJoinAndSelect('p.actor', 'actor')
      .orderBy('p.created_at', 'DESC');

    if (source) query.andWhere('p.source = :source', { source });

    const autorisees = await this.accessScopeService.structuresAutorisees(admin_uuid);
    if (autorisees !== null) {
      // Ensemble vide ⇒ aucune ligne (et surtout pas `IN ()`, SQL invalide).
      if (autorisees.size === 0) return [];
      query.andWhere('beneficiary.structure_uuid IN (:...structures)', {
        structures: [...autorisees],
      });
    }

    return await query.getMany();
  }

  // ----------------------------------------------------------
  //  TROUVER UN PAIEMENT
  // ----------------------------------------------------------
  /**
   * Vérifie qu'un membre appartient au périmètre du demandeur. `null` = demandeur non contraint.
   * Refuse aussi un membre sans structure : le défaut est le refus, jamais l'ouverture.
   */
  private async assertMembreDansPerimetre(
    member_uuid: string,
    admin_uuid: string,
  ): Promise<void> {
    const autorisees =
      await this.accessScopeService.structuresAutorisees(admin_uuid);
    if (autorisees === null) return;

    const rows = await this.paymentRepo.manager.query(
      'SELECT `structure_uuid` FROM `members` WHERE `uuid` = ? AND `deleted_at` IS NULL LIMIT 1',
      [member_uuid],
    );
    const structure = rows?.[0]?.structure_uuid;
    if (!structure || !autorisees.has(structure)) {
      throw new ForbiddenException(
        'Accès refusé : ce membre est hors de votre périmètre.',
      );
    }
  }

  async findOne(uuid: string, admin_uuid: string): Promise<PaymentEntity> {
    const payment = await this.paymentRepo.findOne({
      where: { uuid },
      relations: ['beneficiary', 'actor'],
    });

    if (!payment)
      throw new NotFoundException('Paiement introuvable.');

    // Le détail expose les mêmes données personnelles que la liste : même barrière.
    if (payment.beneficiary_uuid) {
      await this.assertMembreDansPerimetre(payment.beneficiary_uuid, admin_uuid);
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    await this.logService.logAction(
      'payments-findOne',
      admin.id,
      `Consultation du paiement ${uuid}`,
    );

    return payment;
  }

  // ----------------------------------------------------------
  // CRÉER UN PAIEMENT
  // ----------------------------------------------------------
  async store(dto: CreatePaymentDto, admin_uuid: string): Promise<any> {

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    // --- Vérifier si le bénéficiaire existe ---
    const beneficiary = await this.memberRepo.findOne({ where: { uuid: dto.beneficiary_uuid } });
    if (!beneficiary)
      throw new NotFoundException('Bénéficiaire introuvable.');

    // --- Vérifier l'acteur ---
    const actor = await this.memberRepo.findOne({ where: { uuid: dto.actor_uuid } });
    if (!actor)
      throw new NotFoundException('Acteur introuvable.');

    let unitAmount = dto.amount ?? 0;

    // ------------------------------------------------------
    //  SOURCE : DONATION
    // ------------------------------------------------------
    if (dto.source === PaymentSource.DONATION) {
      const campaign = await this.donationRepo.findOne({ where: { uuid: dto.source_uuid } });

      if (!campaign)
        throw new NotFoundException("Campagne de don introuvable.");

      if (!dto.amount)
        throw new BadRequestException("Le montant du don est requis.");
    }

    // ------------------------------------------------------
    //  SOURCE : SUBSCRIPTION
    // ------------------------------------------------------
    if (dto.source === PaymentSource.SUBSCRIPTION) {
      const subscription = await this.subscriptionRepo.findOne({ where: { uuid: dto.source_uuid } });

      if (!subscription)
        throw new NotFoundException("Abonnement introuvable.");

      unitAmount = subscription.amount;
    }

    // ------------------------------------------------------
    //  CALCUL TOTAL
    // ------------------------------------------------------
    const quantity = dto.quantity ?? 1;
    const total = unitAmount * quantity;

    // ------------------------------------------------------
    //  INTÉGRATION HUB PAY
    // ------------------------------------------------------
    // Libellé du paiement : il porte le nom du BÉNÉFICIAIRE (et non du payeur).
    const description = `Paiement ${this.sourceLabelFr(dto.source)} pour ${dto.beneficiary_name}`;

    // Métadonnées transmises au guichet SOKA Pay :
    //  - payerPhone  → pré-remplit le champ « Numéro de téléphone » (modifiable) ;
    //  - payer/beneficiary name+phone → affichés sur le reçu PDF.
    const paymentMeta: Record<string, unknown> = {
      payerName: dto.actor_name,
      payerPhone: dto.paymentNumber ?? actor.phone ?? '',
      beneficiaryName: dto.beneficiary_name,
      beneficiaryPhone: beneficiary.phone ?? '',
    };

    const hubResponse = await this.hubService.initPayment(
      total,
      description,
      paymentMeta,
    );

    // ------------------------------------------------------
    //  SAUVEGARDE DU PAIEMENT
    // ------------------------------------------------------
    const payment = this.paymentRepo.create({
      ...dto,
      total_amount: total,
      transaction_id: hubResponse.transactionId,
      payment_url: hubResponse.payment_url,
    });

    const saved = await this.paymentRepo.save(payment);

    await this.logService.logAction(
      'payments-store',
      admin.id,
      `Paiement initialisé (${saved.uuid})`,
    );

    // FRONT doit rediriger l'utilisateur vers cette URL
    return {
      message: "Paiement initié avec succès.",
      payment_uuid: saved.uuid,
      transaction_id: hubResponse.transactionId,
      amount: total,
      payment_url: hubResponse.payment_url,
    };
  }


  // ----------------------------------------------------------
  //  METTRE À JOUR
  // ----------------------------------------------------------
  async update(uuid: string, dto: UpdatePaymentDto, admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    const payment = await this.paymentRepo.findOne({ where: { uuid } });
    if (!payment) throw new NotFoundException("Paiement introuvable.");

    Object.assign(payment, dto);

    // recalcul total
    if (dto.amount || dto.quantity) {
      const qty = dto.quantity ?? payment.quantity ?? 1;
      const amount = dto.amount ?? payment.amount ?? 0;
      payment.total_amount = qty * amount;
    }

    return await this.paymentRepo.save(payment);
  }

  // ----------------------------------------------------------
  //  CHANGER STATUT
  // ----------------------------------------------------------
  async changeStatus(uuid: string, status: GlobalStatus, admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const payment = await this.paymentRepo.findOne({ where: { uuid } });
    if (!payment) throw new NotFoundException("Paiement introuvable.");

    payment.status = status;

    await this.paymentRepo.save(payment);

    await this.logService.logAction(
      'payments-changeStatus',
      admin.id,
      `Statut du paiement ${uuid} changé en ${status}`,
    );

    return payment;
  }


  // ----------------------------------------------------------
  //  PAIEMENTS PAR MEMBRE
  // ----------------------------------------------------------
  async findByMember(member_uuid: string, admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    // Le membre ciblé doit être dans le périmètre : sans ce contrôle, il suffisait de changer
    // l'uuid dans l'URL pour lire l'historique de paiement de n'importe qui.
    await this.assertMembreDansPerimetre(member_uuid, admin_uuid);
    await this.logService.logAction(
      'payments-changeStatus',
      admin.id,
      `Paiement du membre ${member_uuid} changé`,
    );

    return this.paymentRepo.find({
      where: { beneficiary_uuid: member_uuid },
      order: { created_at: 'DESC' },
    });
  }

  // ----------------------------------------------------------
  //  STATISTIQUES GLOBALES
  // ----------------------------------------------------------
  async getStats(admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'payments-changeStatus',
      admin.id,
      `Statistique global`,
    );
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .select([
        'COUNT(*) as totalPayments',
        'SUM(p.total_amount) as totalAmount',
      ]);

    return await qb.getRawOne();
  }

  async findByTransactionIdOrFail(transaction_id: string, admin_uuid: string) {
    const payment = await this.paymentRepo.findOne({
      where: { transaction_id },
    });

    if (!payment) {
      throw new NotFoundException(
        `Aucun paiement trouvé pour transaction_id = ${transaction_id}`,
      );
    }

    return payment;
  }

  async updatePayment(uuid: string, data: Partial<PaymentEntity>) {
    const payment = await this.paymentRepo.findOne({ where: { uuid } });
    if (!payment) {
      throw new NotFoundException(`Paiement introuvable pour uuid=${uuid}`);
    }

    // Liste des champs autorisés
    const allowedFields = [
      'status',
      'payment_status',
      'payment_url',
      'transaction_id',
      'amount',
      'total_amount',
    ];

    for (const key of Object.keys(data)) {
      if (allowedFields.includes(key)) {
        (payment as any)[key] = (data as any)[key];
      }
    }

    return await this.paymentRepo.save(payment);
  }

  /**
   * **Conserve le détail rendu par le guichet** : opérateur, motif d'échec, horodatage
   * d'encaissement, identité de la transaction HUB2. C'est la seule écriture de ces six colonnes.
   *
   * Le guichet renvoyait déjà ces champs à chaque vérification et l'API les jetait : aucune
   * statistique « par opérateur » ni « par motif d'échec » n'était calculable, alors que
   * c'est précisément ce qui permet de comprendre les échecs.
   *
   * Trois garde-fous, tous délibérés :
   *
   * ⚠️ **Un `null` n'écrase jamais une valeur déjà connue.** Une tentative abandonnée fait
   * répondre `payment: null` au guichet indéfiniment : sans cette règle, la première
   * synchronisation postérieure effacerait l'opérateur d'un paiement pourtant abouti.
   *
   * ⚠️ **Aucune écriture s'il n'y a rien de nouveau.** Le cron balaie jusqu'à 500 lignes
   * toutes les 10 minutes ; écrire à chaque passage produirait 72 000 UPDATE par jour pour
   * réécrire les mêmes valeurs, et ferait mentir `updated_at`.
   *
   * 🚨 **Une erreur ici n'interrompt JAMAIS la synchronisation.** Ces colonnes sont de la
   * donnée d'analyse : laisser leur écriture faire échouer l'appel transformerait un
   * problème de statistiques en paiement non crédité. On journalise et on continue.
   */
  private async captureHubPaymentDetails(
    payment: PaymentEntity,
    details: HubPaymentDetails | null,
  ): Promise<void> {
    if (!details) return;

    const patch: Partial<PaymentEntity> = {};

    const provider = details.provider?.trim().toLowerCase();
    if (provider && provider !== payment.provider) {
      patch.provider = provider;
    }

    // 🚨 **Une tentative qui aboutit EFFACE le motif d'échec de la précédente.** Le membre
    // rejoue souvent le même lien : la tentative ratée pose `authentication_failed`, celle
    // qui réussit n'envoie aucun motif - et sans cet effacement le paiement reste crédité
    // ET étiqueté « échec d'authentification ». Constaté sur les 2 rattrapages du 20/08 ;
    // c'est ce que lit la console d'assistance pour qualifier un ticket.
    const abouti = details.status === 'successful';
    if (abouti) {
      if (payment.failure_code !== null) patch.failure_code = null;
      if (payment.failure_message !== null) patch.failure_message = null;
    } else {
      const failureCode = details.failureCode?.trim();
      if (failureCode && failureCode !== payment.failure_code) {
        patch.failure_code = failureCode;
      }

      const failureMessage = details.failureMessage?.trim();
      if (failureMessage && failureMessage !== payment.failure_message) {
        patch.failure_message = failureMessage;
      }
    }

    // Une date illisible est ignorée plutôt que stockée en `Invalid Date`, qui ferait
    // échouer l'INSERT et emporterait la synchronisation avec elle.
    if (details.paidAt) {
      const paidAt = new Date(details.paidAt);
      if (!Number.isNaN(paidAt.getTime())
        && paidAt.getTime() !== payment.paid_at?.getTime()) {
        patch.paid_at = paidAt;
      }
    }

    // L'identité HUB2 : `pay_…` est la seule clé fiable de rapprochement avec l'export du
    // guichet, et `createdAt` le seul départ de tentative exploitable (`created_at` date le
    // LIEN, pas la tentative).
    const hubPaymentId = details.id?.trim();
    if (hubPaymentId && hubPaymentId !== payment.hub_payment_id) {
      patch.hub_payment_id = hubPaymentId;
    }

    if (details.createdAt) {
      const hubCreatedAt = new Date(details.createdAt);
      if (!Number.isNaN(hubCreatedAt.getTime())
        && hubCreatedAt.getTime() !== payment.hub_created_at?.getTime()) {
        patch.hub_created_at = hubCreatedAt;
      }
    }

    if (Object.keys(patch).length === 0) return;

    try {
      // 🚨 `updated_at` est réaffectée à SA PROPRE VALEUR, et ce n'est pas une coquetterie :
      // sans elle, la ligne se retrouve datée d'aujourd'hui alors qu'aucun élément métier n'a
      // bougé. Deux mécanismes concourent, il faut neutraliser les deux, et une seule écriture
      // suffit à le faire - MySQL n'applique `ON UPDATE CURRENT_TIMESTAMP(6)` que si la colonne
      // n'est pas affectée explicitement, et TypeORM n'ajoute son `= CURRENT_TIMESTAMP` que si
      // elle est absente du SET (`UpdateQueryBuilder.createUpdateExpression`, garde
      // `updatedColumns.indexOf(metadata.updateDateColumn) === -1`).
      //
      // L'enjeu est concret : le rattrapage écrit ces colonnes sur ~1 200 paiements clos depuis
      // des semaines. Sans cette ligne, tous porteraient la date du rattrapage, la vraie date
      // serait perdue sans retour possible, et la console d'assistance afficherait « modifié
      // aujourd'hui » sur chaque ticket d'un paiement ancien.
      await this.paymentRepo
        .createQueryBuilder()
        .update(PaymentEntity)
        .set({ ...patch, updated_at: () => '`updated_at`' })
        .where('uuid = :uuid', { uuid: payment.uuid })
        .execute();
      Object.assign(payment, patch);
    } catch (e) {
      this.logger.warn(
        `[HUB][DETAIL] Détail non conservé pour ${payment.transaction_id} : ${e?.message ?? e}`,
      );
    }
  }

  /**
   * **Vérification à la demande d'UN paiement** (bouton « Vérifier » du tableau Comptabilité).
   *
   * Aucune logique propre : on résout l'uuid puis on rejoue `syncHubPaymentByTransactionId`,
   * le chemin déjà éprouvé du cron - crédite si le guichet a encaissé, referme si la tentative
   * a échoué, ne touche à rien sinon. Idempotent : un double clic ne change rien de plus.
   */
  async verifyHubPaymentByUuid(uuid: string): Promise<HubPaymentSyncResult> {
    const payment = await this.paymentRepo.findOne({ where: { uuid } });
    if (!payment) {
      throw new NotFoundException(`Aucun paiement trouvé pour uuid = ${uuid}`);
    }
    if (!payment.transaction_id) {
      // Paiement d'avant le guichet (CinetPay…) : il n'y a rien à interroger côté HUB2.
      throw new BadRequestException({
        message: 'Ce paiement ne porte aucun lien de guichet : rien à vérifier.',
        data: { code: 'SANS_LIEN_GUICHET' },
      });
    }
    return this.syncHubPaymentByTransactionId(payment.transaction_id);
  }

  async syncHubPaymentByTransactionId(
    transaction_id: string,
    /**
     * `relancerCloture` : **rouvre une ligne déjà close** (`failed` / `cancelled`) et
     * réinterroge le guichet au lieu de répondre depuis la base.
     *
     * 🚨 Réservé aux appels de FOND (cron, seeds de rattrapage). Les écrans interactifs
     * gardent le raccourci : c'est lui qui leur donne une réponse immédiate sans peser sur le
     * guichet, et un paiement clos ne change pas d'avis entre deux F5.
     */
    { relancerCloture = false }: { relancerCloture?: boolean } = {},
  ): Promise<HubPaymentSyncResult> {
    if (!transaction_id?.trim()) {
      return { status: 'not_found', transaction_id: transaction_id ?? '' };
    }

    const payment = await this.paymentRepo.findOne({
      where: { transaction_id },
    });

    if (!payment) {
      return { status: 'not_found', transaction_id };
    }

    // ⚠️ Ces deux sorties anticipées répondent depuis la base, sans rappeler HUB.
    // Elles doivent tout de même renvoyer un `hub_payment` : sinon la réponse
    // change de FORME selon que l'appelant a déclenché la synchronisation ou non.
    // C'est ce qui produisait le bug du 2026-08-01 - deuxième appareil (ou simple
    // F5) sur l'écran de résultat : `hub_payment` à null, et le web déclarait
    // « paiement non abouti » un paiement pourtant encaissé.
    //
    // 🚨 Elles doivent AUSSI réparer la ligne métier avant de répondre. Le statut du
    // paiement est définitif ici, mais la ligne d'abonnement, elle, peut être restée en
    // arrière : 23 lignes de la base sont `pending` alors que leur paiement est `fail`
    // (paiements repassés en échec directement en SQL). Sans cette réparation, la synchro
    // annonçait « échoué » tout en laissant la ligne bloquer indéfiniment une nouvelle
    // souscription - le membre voyait son échec ET ne pouvait pas recommencer.
    // `updateLinkedEntities` est idempotente : elle n'écrit que s'il y a un écart.
    if (payment.payment_status === PaymentStatus.PAID) {
      await this.updateLinkedEntities(payment, GlobalStatus.SUCCESS);

      return this.buildHubPaymentSyncResult(
        'paid',
        payment,
        this.hubPaymentFromLocal(payment, 'successful'),
      );
    }

    // 🚨 **Cette sortie est une SORTIE PROVISOIRE, pas une vérité.** Elle répond « échoué »
    // depuis la base, sans rappeler le guichet - or le lien, lui, reste PAYABLE : il n'expire
    // pas et rien ne le désactive tant que le membre n'a pas cliqué « Annuler ». Un membre
    // qui recommence sur le même lien et réussit verse donc de l'argent que ce `return`
    // rendait invisible pour toujours (30 000 XOF perdus ainsi les 17 et 18/08).
    // `relancerCloture` est la porte laissée aux appels de fond pour aller vérifier.
    if (
      !relancerCloture
      && (payment.payment_status === PaymentStatus.FAILED
        || payment.payment_status === PaymentStatus.CANCELLED)
    ) {
      await this.updateLinkedEntities(
        payment,
        this.globalStatusFromPaymentStatus(payment.payment_status),
      );

      return this.buildHubPaymentSyncResult(
        'failed',
        payment,
        this.hubPaymentFromLocal(payment, 'failed'),
      );
    }

    const hubStatus = await this.hubService.checkPaymentStatus(transaction_id);

    // 🎯 UNIQUE point de capture du détail rendu par le guichet (opérateur, motif d'échec,
    // horodatage d'encaissement). Il est placé ICI, juste après l'appel, et pas dans les
    // branches ci-dessous : les trois issues (payé / échoué / en attente) mènent au même
    // besoin, et trois copies finiraient par diverger. Tous les chemins de synchronisation
    // de l'application - écran de résultat, revue des tentatives en cours, cron - passent
    // par cette méthode, donc par cette ligne.
    await this.captureHubPaymentDetails(payment, hubStatus.payment ?? null);

    if (hubStatus.paid === true) {
      await this.updatePayment(payment.uuid, {
        status: GlobalStatus.SUCCESS,
        payment_status: PaymentStatus.PAID,
      });
      await this.updateLinkedEntities(payment, GlobalStatus.SUCCESS);

      return this.buildHubPaymentSyncResult(
        'paid',
        payment,
        hubStatus.payment ?? null,
      );
    }

    const hubPaymentStatus = hubStatus.payment?.status?.toLowerCase();
    const isFailed =
      hubPaymentStatus === 'failed'
      || hubPaymentStatus === 'cancelled'
      || hubPaymentStatus === 'canceled';

    if (isFailed) {
      // 🚨 **N'écrire que s'il y a un écart.** La file de re-vérification est bornée par
      // `updated_at` : réécrire « échoué » sur une ligne déjà échouée repousserait sa date à
      // chaque passage, et la ligne resterait dans la fenêtre des 48 h **pour toujours** -
      // la file ne décroîtrait plus jamais. `updateLinkedEntities` est déjà idempotente.
      if (payment.payment_status !== PaymentStatus.FAILED) {
        await this.updatePayment(payment.uuid, {
          status: GlobalStatus.FAILED,
          payment_status: PaymentStatus.FAILED,
        });
      }
      await this.updateLinkedEntities(payment, GlobalStatus.FAILED);

      return this.buildHubPaymentSyncResult(
        'failed',
        payment,
        hubStatus.payment ?? null,
      );
    }

    return this.buildHubPaymentSyncResult(
      'pending',
      payment,
      hubStatus.payment ?? null,
    );
  }

  /**
   * **Annule une tentative de paiement encore en cours** (bouton « Annuler »).
   *
   * Répond au cas réel : un membre relance le paiement plusieurs fois, une
   * tentative aboutit, les autres restent `pending` - et chacune reste
   * **encaissable** tant que le payeur détient un OTP ou un lien Wave valide.
   *
   * ⚠️ **Vérifier un paiement ne débite JAMAIS** (`checkPaymentStatus` est une
   * lecture). Le risque de double débit ne vient pas de la vérification mais de
   * ces tentatives laissées ouvertes : c'est elles que cette méthode referme.
   *
   * ⚠️ **HUB2 n'expose aucune annulation.** Ce qui est garanti : la gateway
   * refuse tout nouvel appel sur ce lien (lien désactivé, sessions et intentions
   * annulées). Une autorisation déjà validée par le payeur chez son opérateur
   * ira, elle, à son terme - le webhook la ramènera et écrasera ce statut.
   *
   * Ordre volontaire : **la gateway d'abord** (elle interroge HUB2 et refuse
   * d'annuler une tentative aboutie), **la base locale ensuite**. L'inverse
   * marquerait « annulé » un paiement que la gateway aurait refusé de fermer.
   */
  async cancelHubPaymentByTransactionId(
    transaction_id: string,
  ): Promise<HubPaymentSyncResult & { message: string }> {
    if (!transaction_id?.trim()) {
      throw new BadRequestException('transaction_id manquant');
    }

    const payment = await this.paymentRepo.findOne({ where: { transaction_id } });
    if (!payment) {
      throw new NotFoundException(
        `Aucun paiement trouvé pour transaction_id = ${transaction_id}`,
      );
    }

    // Déjà payé localement : on refuse sans même appeler la gateway.
    if (payment.payment_status === PaymentStatus.PAID) {
      throw new ConflictException(
        'Ce paiement a abouti : il ne peut pas être annulé.',
      );
    }

    // Déjà refermé : idempotent, on ne rappelle pas la gateway.
    if (
      payment.payment_status === PaymentStatus.CANCELLED
      || payment.payment_status === PaymentStatus.FAILED
    ) {
      return {
        ...(await this.buildHubPaymentSyncResult(
          'failed',
          payment,
          this.hubPaymentFromLocal(payment, 'failed'),
        )),
        message: 'Cette tentative était déjà close.',
      };
    }

    const result = await this.hubService.cancelPaymentLink(transaction_id);

    // La gateway a trouvé une tentative ABOUTIE : on ne referme rien, on
    // enregistre le succès qu'on ignorait. Ce n'est pas une erreur.
    if (!result.canceled && result.reason === 'already_paid') {
      const synced = await this.syncHubPaymentByTransactionId(transaction_id);
      return {
        ...synced,
        message:
          "Ce paiement a en réalité abouti : il a été enregistré comme payé, rien n'a été annulé.",
      };
    }

    await this.updatePayment(payment.uuid, {
      status: GlobalStatus.CANCELED,
      payment_status: PaymentStatus.CANCELLED,
    });
    await this.updateLinkedEntities(payment, GlobalStatus.CANCELED);

    const fresh = await this.paymentRepo.findOne({ where: { uuid: payment.uuid } });
    return {
      ...(await this.buildHubPaymentSyncResult(
        'failed',
        fresh ?? payment,
        this.hubPaymentFromLocal(fresh ?? payment, 'failed'),
      )),
      message: 'Tentative annulée : aucun débit ne peut plus partir de ce lien.',
    };
  }

  /**
   * Referme un paiement dont **le guichet ne connaît plus le lien** (404 à l'annulation),
   * sans le rappeler.
   *
   * ⚠️ Referme le paiement **ET** la ligne métier. Ne fermer que la ligne laissait un état
   * bâtard, constaté en recette : l'abonnement passait `canceled` pendant que le paiement
   * restait `pending` - le membre était débloqué, mais le cron de synchronisation
   * continuait d'interroger le guichet pour ce lien à chaque passage, et la console
   * d'assistance affichait toujours un ticket « paiement non abouti » sur une tentative
   * refermée.
   *
   * ⚠️ Un 404 peut aussi trahir un guichet **mal configuré** (les liens de production sont
   * inconnus d'un guichet sandbox, et réciproquement). On l'assume : laisser la tentative
   * ouverte bloquerait le membre pour toujours sur un lien qui n'existe pas, et le geste
   * n'est posé qu'à sa demande explicite d'annulation.
   */
  async closeUnknownPaymentLink(payment: PaymentEntity): Promise<void> {
    await this.updatePayment(payment.uuid, {
      status: GlobalStatus.CANCELED,
      payment_status: PaymentStatus.CANCELLED,
    });
    await this.updateLinkedEntities(payment, GlobalStatus.CANCELED);
  }

  /**
   * Synchronise les paiements encore en attente auprès du guichet.
   *
   * 🚨 **Deux défauts de cette méthode ont coûté 585 000 XOF encaissés et jamais crédités**
   * (mesuré le 2026-08-07 en croisant `soka_db` et la base du guichet) :
   *
   * **① Le tri était `created_at ASC` avec un plafond.** La file comptait **349** paiements
   * en attente, le plafond en traitait **200** - et les 38 encaissements perdus occupaient
   * les rangs **202 à 349**. Aucun n'était dans la fenêtre.
   * **② La tête de file est inextinguible.** Les 200 plus anciens n'avaient **aucune
   * tentative de paiement** au guichet : le membre a ouvert le lien et n'a rien engagé. HUB2
   * répond alors `paid: false, payment: null` **indéfiniment**, ce qui se traduit par « en
   * attente ». Ces 200 lignes monopolisaient donc la fenêtre **pour toujours**, rejouées
   * toutes les 10 minutes pour rien, pendant que les paiements récents s'empilaient derrière
   * sans jamais être vus. L'angle mort s'est ouvert le jour où la file a franchi 200, et il
   * s'élargissait chaque jour (0 % de perte le 01/08, 32 % le 06/08, 7 sur 9 le 07/08).
   *
   * Trois changements, dans cet ordre d'importance :
   * - **Tri du plus RÉCENT au plus ancien.** C'est la correction de fond : un paiement qui
   *   vient d'être engagé est désormais **toujours en tête**, quelle que soit la longueur de
   *   la file. Le blocage de tête de file devient structurellement impossible.
   * - **La file se vide** : une tentative sur laquelle aucun paiement n'a jamais été engagé
   *   et qui dépasse `CRON_ABANDON_AFTER_HOURS` est refermée (voir `cloreTentativeAbandonnee`).
   *   Sans ça, la file grossit sans fin et le cron interroge éternellement des liens morts.
   * - **Plafond porté à 500** : matelas de sécurité, plus la garantie de fond.
   *
   * ⚠️ **Ne jamais revenir à un tri ASC.** Le plafond n'est pas le vrai garde-fou : c'est
   * l'ordre. Avec un tri ASC, il suffit que la file dépasse le plafond pour que l'angle mort
   * se rouvre - et il se rouvrira, puisque la file grossit avec l'usage.
   */
  async syncAllPendingHubPayments(
    limit = 500,
  ): Promise<HubPaymentSyncBatchResult> {
    const pendingPayments = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.payment_status = :payment_status', {
        payment_status: PaymentStatus.PENDING,
      })
      .andWhere('p.status IN (:...statuses)', {
        statuses: [GlobalStatus.INIT, GlobalStatus.PENDING],
      })
      .andWhere('p.transaction_id IS NOT NULL')
      .andWhere('p.transaction_id LIKE :prefix', { prefix: 'plink_%' })
      // 🚨 DESC, et pas ASC : cf. l'explication ci-dessus. Le plus récent d'abord.
      .orderBy('p.created_at', 'DESC')
      .take(limit)
      .getMany();

    /**
     * **Seconde file : les tentatives CLOSES des dernières 48 h.**
     *
     * 🚨 Requête SÉPARÉE, plafond SÉPARÉ, tri SÉPARÉ - jamais fondue dans celle des `pending`
     * (cf. `RECHECK_BATCH_LIMIT`). Elle répond à une question que la première ne pose pas :
     * « ai-je enterré un lien sur lequel le membre a fini par payer ? ». Bornée par
     * `updated_at`, donc par la date de fermeture, elle décroît d'elle-même.
     */
    const closedPayments = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.payment_status IN (:...closedStatuses)', {
        closedStatuses: [PaymentStatus.FAILED, PaymentStatus.CANCELLED],
      })
      .andWhere('p.updated_at >= :depuis', {
        depuis: new Date(Date.now() - RECHECK_CLOSED_FOR_HOURS * 3600_000),
      })
      .andWhere('p.transaction_id IS NOT NULL')
      .andWhere('p.transaction_id LIKE :prefix', { prefix: 'plink_%' })
      .orderBy('p.updated_at', 'DESC')
      .take(RECHECK_BATCH_LIMIT)
      .getMany();

    const result: HubPaymentSyncBatchResult = {
      processed: 0,
      paid: 0,
      failed: 0,
      pending: 0,
      abandoned: 0,
      errors: 0,
      recredited: 0,
    };

    // Interrogations menées par petits lots : 500 appels en série, au timeout de 8 s chacun,
    // pourraient dépasser l'intervalle de 10 min du cron et faire sauter des cycles entiers.
    for (let i = 0; i < pendingPayments.length; i += SYNC_CONCURRENCY) {
      const lot = pendingPayments.slice(i, i + SYNC_CONCURRENCY);

      const verdicts = await Promise.all(
        lot.map((payment) => this.syncOnePendingPayment(payment)),
      );

      for (const verdict of verdicts) {
        result.processed += 1;
        result[verdict] += 1;
      }
    }

    // Puis la re-vérification des lignes closes. En second, volontairement : si le guichet
    // tombe en route, ce sont les `pending` - l'argent en cours - qui auront été servis.
    for (let i = 0; i < closedPayments.length; i += SYNC_CONCURRENCY) {
      const lot = closedPayments.slice(i, i + SYNC_CONCURRENCY);

      const verdicts = await Promise.all(
        lot.map((payment) => this.recheckClosedPayment(payment)),
      );

      for (const verdict of verdicts) {
        result.processed += 1;
        result[verdict] += 1;
      }
    }

    return result;
  }

  /**
   * **Re-vérifie une tentative que l'application a refermée** (`failed` / `cancelled`) et
   * qu'un membre a pu payer depuis.
   *
   * ⚠️ Elle ne crédite RIEN elle-même : elle repasse par
   * `syncHubPaymentByTransactionId`, la route unique vers les statuts, avec la seule
   * différence qu'elle l'autorise à rappeler le guichet. Une seconde route vers le même
   * argent finirait par diverger - c'est cette duplication qui a produit les écarts d'août.
   */
  private async recheckClosedPayment(
    payment: PaymentEntity,
  ): Promise<'paid' | 'failed' | 'pending' | 'errors' | 'recredited'> {
    try {
      const syncResult = await this.syncHubPaymentByTransactionId(
        payment.transaction_id,
        { relancerCloture: true },
      );

      if (syncResult.status === 'not_found') return 'errors';

      // Le guichet confirme l'encaissement d'une ligne qu'on avait enterrée : de l'argent
      // vient d'être rendu à ses comptes. On le dit fort - c'est une anomalie, pas une
      // routine, et elle doit se voir dans le journal du cron.
      if (syncResult.status === 'paid') {
        this.logger.warn(
          `[HUB][RATTRAPAGE] ${payment.transaction_id} était « ${payment.payment_status} » `
          + `et le guichet l'a ENCAISSÉ : ${payment.total_amount} XOF recrédités `
          + `(${payment.beneficiary_name}).`,
        );
        return 'recredited';
      }

      // Toujours close, ou redevenue « en attente » chez HUB2 (il remet une intention
      // abandonnée en attente au lieu de l'échouer) : rien à faire, elle sortira de la
      // fenêtre toute seule.
      return syncResult.status === 'pending' ? 'pending' : 'failed';
    } catch (error) {
      this.logger.warn(
        `[HUB][RATTRAPAGE] ${payment.transaction_id} : ${error?.message ?? error}`,
      );
      return 'errors';
    }
  }

  /**
   * **Rattrape le détail guichet des paiements antérieurs** aux colonnes `provider` /
   * `failure_code` / `failure_message` / `paid_at` / `hub_payment_id` / `hub_created_at`.
   * Alimente `npm run seed:backfill-hub-details`.
   *
   * 🚨 **Ce balayage ne touche AUCUN statut, et c'est tout l'intérêt.** Il n'emprunte
   * délibérément **pas** `syncHubPaymentByTransactionId` : celle-ci crédite, referme et
   * annule. La rejouer sur 1 800 lignes historiques serait une seconde route vers l'argent -
   * exactement la duplication qui a produit les écarts de début août. Ici, une seule lecture
   * (`checkPaymentStatus` est un GET) et une écriture bornée aux six colonnes d'analyse.
   *
   * ⚠️ **Reprise naturelle** : sont candidats les paiements dont `provider` **ou**
   * `hub_payment_id` est encore NULL. Une exécution interrompue se relance sans rien refaire,
   * et une ligne pour laquelle le guichet ne connaît aucune tentative restera candidate à
   * jamais - c'est voulu, elle ne coûte qu'un appel et rien ne permet de la distinguer d'une
   * non-traitée.
   *
   * ⚠️ Le `OR hub_payment_id IS NULL` n'est pas cosmétique : il rend candidates les lignes
   * qu'un passage antérieur avait déjà renseignées en `provider`, sans quoi les bases où le
   * rattrapage a déjà tourné n'obtiendraient JAMAIS l'identité HUB2 - et le rapprochement
   * ligne à ligne avec l'export du guichet resterait impossible sur tout l'historique.
   *
   * @param apply `false` (défaut) = simulation : le guichet est interrogé, rien n'est écrit.
   */
  async backfillHubPaymentDetails(
    { apply = false, limit = 5000 }: { apply?: boolean; limit?: number } = {},
  ): Promise<{
    candidats: number;
    interroges: number;
    renseignes: number;
    sans_detail: number;
    erreurs: number;
  }> {
    const candidats = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.transaction_id IS NOT NULL')
      .andWhere('p.transaction_id LIKE :prefix', { prefix: 'plink_%' })
      .andWhere('(p.provider IS NULL OR p.hub_payment_id IS NULL)')
      // Le plus récent d'abord : même raison qu'au cron, une exécution écourtée doit avoir
      // traité ce qui compte le plus.
      .orderBy('p.created_at', 'DESC')
      .take(limit)
      .getMany();

    const resultat = {
      candidats: candidats.length,
      interroges: 0,
      renseignes: 0,
      sans_detail: 0,
      erreurs: 0,
    };

    for (let i = 0; i < candidats.length; i += SYNC_CONCURRENCY) {
      const lot = candidats.slice(i, i + SYNC_CONCURRENCY);

      const verdicts = await Promise.all(
        lot.map(async (payment) => {
          try {
            const statut = await this.hubService.checkPaymentStatus(
              payment.transaction_id,
            );
            const detail = statut.payment ?? null;

            if (!detail?.provider) return 'sans_detail' as const;
            if (apply) await this.captureHubPaymentDetails(payment, detail);
            return 'renseignes' as const;
          } catch (e) {
            this.logger.warn(
              `[HUB][RATTRAPAGE] ${payment.transaction_id} : ${e?.message ?? e}`,
            );
            return 'erreurs' as const;
          }
        }),
      );

      for (const verdict of verdicts) {
        resultat.interroges += 1;
        resultat[verdict] += 1;
      }
    }

    return resultat;
  }

  /** Sort d'un paiement en attente : ce qu'il est devenu après interrogation du guichet. */
  private async syncOnePendingPayment(
    payment: PaymentEntity,
  ): Promise<'paid' | 'failed' | 'pending' | 'abandoned' | 'errors'> {
    try {
      const syncResult = await this.syncHubPaymentByTransactionId(
        payment.transaction_id,
      );

      if (syncResult.status === 'not_found') return 'errors';
      if (syncResult.status !== 'pending') return syncResult.status;

      /**
       * Toujours en attente. Deux situations très différentes derrière ce mot :
       * - `hub_payment` renseigné ⇒ **le guichet connaît une tentative**. On n'y touche pas,
       *   même vieille : rien ne permet d'exclure qu'elle aboutisse, et la refermer
       *   autoriserait un second débit.
       * - `hub_payment === null` ⇒ **aucun paiement n'a jamais été engagé** sur ce lien. Le
       *   membre a ouvert la page et l'a quittée. Passé le délai, c'est un abandon certain.
       */
      const jamaisEngage = !syncResult.hub_payment;
      if (jamaisEngage && this.depasseLeDelaiDAbandon(payment)) {
        return (await this.cloreTentativeAbandonnee(payment))
          ? 'abandoned'
          : 'pending';
      }

      return 'pending';
    } catch {
      return 'errors';
    }
  }

  private depasseLeDelaiDAbandon(payment: PaymentEntity): boolean {
    const ageMs = Date.now() - new Date(payment.created_at).getTime();
    return ageMs > CRON_ABANDON_AFTER_HOURS * 3600_000;
  }

  /**
   * Referme une tentative abandonnée, **et désactive son lien au guichet**.
   *
   * ⚠️ **L'ordre et le couplage sont le point important.** Refermer la seule ligne locale
   * laisserait le lien **actif** : un membre qui reviendrait dessus plus tard paierait
   * réellement, sur une ligne que nous aurions déjà classée - c'est-à-dire exactement le
   * bug qu'on est en train de corriger, par une autre porte. On passe donc par
   * `cancelHubPaymentByTransactionId`, qui **désactive le lien** : plus aucun débit ne peut
   * en partir, et il n'y a donc plus rien à rater.
   *
   * ⚠️ Cette méthode **ne peut pas effacer un paiement abouti** : la passerelle vérifie
   * avant d'écrire et, si une tentative a réussi, elle n'annule rien et **enregistre
   * l'encaissement** à la place. C'est ce qui rend le geste sûr en automatique.
   */
  private async cloreTentativeAbandonnee(
    payment: PaymentEntity,
  ): Promise<boolean> {
    try {
      const resultat = await this.cancelHubPaymentByTransactionId(
        payment.transaction_id,
      );

      // La passerelle a découvert un encaissement : ce n'est pas un abandon, c'est un
      // paiement qui vient d'être enregistré. Le compteur `paid` du cycle suivant le verra.
      if (resultat.status === 'paid') return false;
      return true;
    } catch (error) {
      // Guichet injoignable : on laisse la tentative en attente. Elle sera reprise au
      // prochain passage - jamais refermée sur une panne réseau.
      this.logger.warn(
        `Abandon non refermé pour ${payment.transaction_id} : `
        + `${(error as Error)?.message ?? 'erreur inconnue'}`,
      );
      return false;
    }
  }

  /**
   * Reconstruit un détail de paiement à partir de la ligne LOCALE, pour les
   * réponses servies depuis la base (paiement déjà connu payé ou échoué).
   *
   * On ne rappelle pas HUB : le statut local est déjà définitif. Le but est
   * uniquement que la réponse garde la **même forme** que celle de l'appel qui a
   * déclenché la synchronisation - montant et opérateur compris, faute de quoi
   * ils disparaissent du récapitulatif au deuxième affichage.
   */
  private hubPaymentFromLocal(
    payment: PaymentEntity,
    status: 'successful' | 'failed',
  ): Record<string, unknown> {
    return {
      status,
      amount: Number(payment.total_amount ?? payment.amount ?? 0),
      currency: 'XOF',
      // L'opérateur n'est pas stocké localement : `null` plutôt qu'inventé.
      // Le bloc « Opérateur » est masqué côté web quand la valeur est absente.
      provider: null,
      transaction_id: payment.transaction_id,
    };
  }

  private async buildHubPaymentSyncResult(
    status: HubPaymentSyncResult['status'],
    payment: PaymentEntity,
    hub_payment: unknown = null,
  ): Promise<HubPaymentSyncResult> {
    const donation = await this.donatePaymentRepo.findOne({
      where: { payment_uuid: payment.uuid },
    });
    const subscriptionPayment = await this.subscriptionPaymentRepo.findOne({
      where: { payment_uuid: payment.uuid },
    });

    return {
      status,
      transaction_id: payment.transaction_id,
      payment_uuid: payment.uuid,
      donation_uuid: donation?.uuid ?? null,
      subscription_payment_uuid: subscriptionPayment?.uuid ?? null,
      hub_payment,
    };
  }

/*

      async findTransactionsForSubGroups_old(
      source_uuid: string,
      admin_uuid: string,
      page = 1,
      limit = 50,
      search?: string | undefined,
    ) {

      const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
      if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
      }
      const member = await this.memberRepo.findOne({ where: { uuid: admin.member_uuid } });

      if (!member) {
        throw new NotFoundException("Identifiant du membre introuvable");
      }
      const sousGroups = await this.structureService.findByAllChildrens(member?.structure_uuid);

      if (!sousGroups.length) {
        return {
          total: 0,
          page,
          limit,
          sous_groups: [],
          total_campaign_amount: 0,
          data: [],
        };
      }

      //  Query principale avec recherche
      const qb = this.paymentRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.actor', 'actor')
        .leftJoinAndSelect('actor.structure', 'actorStructure')
        .leftJoinAndSelect('p.beneficiary', 'beneficiary')
        .leftJoinAndSelect('beneficiary.structure', 'beneficiaryStructure')
        .where('p.source_uuid = :source_uuid', { source_uuid })
        .andWhere('actor.structure_uuid IN (:...groups)', { groups: sousGroups });

      //  Ajouter la recherche sur actor et beneficiary
      if (search && search.trim() !== '') {
        qb.andWhere(
          `(
            LOWER(actor.firstname) LIKE LOWER(:search) OR
            LOWER(actor.lastname) LIKE LOWER(:search) OR
            LOWER(beneficiary.firstname) LIKE LOWER(:search) OR
            LOWER(beneficiary.lastname) LIKE LOWER(:search) OR
            CONCAT(LOWER(actor.firstname), ' ', LOWER(actor.lastname)) LIKE LOWER(:search) OR
            CONCAT(LOWER(beneficiary.firstname), ' ', LOWER(beneficiary.lastname)) LIKE LOWER(:search)
          )`,
          { search: `%${search.trim()}%` }
        );
      }

      qb.orderBy('p.created_at', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [payments, total] = await qb.getManyAndCount();

      let total_campaign_amount = 0;

      const samplePayment = await this.paymentRepo.findOne({
        where: { source_uuid },
      });

      if (samplePayment) {
        if (samplePayment.source === PaymentSource.DONATION) {
          const donationSum = await this.donatePaymentRepo
            .createQueryBuilder('d')
            .select('SUM(d.amount)', 'sum')
            .where('d.donate_uuid = :id', { id: source_uuid })
            .andWhere('d.status = :status', { status: GlobalStatus.SUCCESS })
            .getRawOne();

          total_campaign_amount = Number(donationSum?.sum ?? 0);
        }

        if (samplePayment.source === PaymentSource.SUBSCRIPTION) {
          const subscriptionSum = await this.subscriptionPaymentRepo
            .createQueryBuilder('s')
            .select('SUM(s.amount)', 'sum')
            .where('s.subscription_uuid = :id', { id: source_uuid })
            .andWhere('s.status = :status', { status: GlobalStatus.SUCCESS })
            .getRawOne();

          total_campaign_amount = Number(subscriptionSum?.sum ?? 0);
        }
      }

      const result: TransactionWithDetails[] = [];

      for (const p of payments) {
        let donation: DonatePaymentEntity | null = null;
        let subscription: SubscriptionPaymentEntity | null = null;

        if (p.source === PaymentSource.DONATION) {
          donation = await this.donatePaymentRepo.findOne({
            where: { payment_uuid: p.uuid },
          });
        }

        if (p.source === PaymentSource.SUBSCRIPTION) {
          subscription = await this.subscriptionPaymentRepo.findOne({
            where: { payment_uuid: p.uuid },
          });
        }

        result.push({
          payment_uuid: p.uuid,
          source: p.source,
          source_uuid: p.source_uuid,
          transaction_id: p.transaction_id,
          payment_status: p.payment_status,
          status: p.status,
          created_at: p.created_at,

          amount_unit: p.amount,
          quantity: p.quantity,
          total_amount: p.total_amount,

          actor: p.actor
            ? {
              uuid: p.actor.uuid,
              firstname: p.actor.firstname,
              lastname: p.actor.lastname,
              phone: p.actor.phone,
              structure: p.actor.structure
                ? { uuid: p.actor.structure.uuid, name: p.actor.structure.name }
                : null,
            }
            : null,

          beneficiary: p.beneficiary
            ? {
              uuid: p.beneficiary.uuid,
              firstname: p.beneficiary.firstname,
              lastname: p.beneficiary.lastname,
              phone: p.beneficiary.phone,
              structure: p.beneficiary.structure
                ? {
                  uuid: p.beneficiary.structure.uuid,
                  name: p.beneficiary.structure.name,
                }
                : null,
            }
            : null,

          donation: donation
            ? {
              uuid: donation.uuid,
              amount: donation.amount,
              status: donation.status,
              quantity: donation.quantity,
            }
            : null,

          subscription: subscription
            ? {
              uuid: subscription.uuid,
              amount: subscription.amount,
              status: subscription.status,
              quantity: subscription.quantity,
            }
            : null,
        });
      }

      return {
        total,
        total_campaign_amount,
        page,
        limit,
        root_structure_uuid: member.structure_uuid,
        sous_groups: sousGroups,
        source_uuid,
        data: result,
      };
    }
*/

async findTransactionsForSubGroups(
  source_uuid: string,
  admin_uuid: string,
  structure_uuid: string,
  page = 1,
  limit = 50,
  search?: string | undefined,
  payment_status?: PaymentStatus,
) {

  const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
  if (!admin) {
    throw new NotFoundException("Identifiant de l'auteur introuvable");
  }
  const member = await this.memberRepo.findOne({ where: { uuid: admin.member_uuid } });

  if (!member) {
    throw new NotFoundException("Identifiant du membre introuvable");
  }
  const sousGroups = await this.structureService.findByAllChildrens(structure_uuid);

  // Query principale avec recherche
  const qb = this.paymentRepo
    .createQueryBuilder('p')
    .leftJoinAndSelect('p.actor', 'actor')
    .leftJoinAndSelect('actor.structure', 'actorStructure')
    .leftJoinAndSelect('p.beneficiary', 'beneficiary')
    .leftJoinAndSelect('beneficiary.structure', 'beneficiaryStructure')
    .where('p.source_uuid = :source_uuid', { source_uuid });

  if (sousGroups.length) {
    qb.andWhere('actor.structure_uuid IN (:...groups)', { groups: sousGroups });
  }

  //  Ajouter la recherche sur actor et beneficiary
  if (search && search.trim() !== '') {
    qb.andWhere(
      `(
        LOWER(actor.firstname) LIKE LOWER(:search) OR
        LOWER(actor.lastname) LIKE LOWER(:search) OR
        LOWER(beneficiary.firstname) LIKE LOWER(:search) OR
        LOWER(beneficiary.lastname) LIKE LOWER(:search) OR
        CONCAT(LOWER(actor.firstname), ' ', LOWER(actor.lastname)) LIKE LOWER(:search) OR
        CONCAT(LOWER(beneficiary.firstname), ' ', LOWER(beneficiary.lastname)) LIKE LOWER(:search)
      )`,
      { search: `%${search.trim()}%` }
    );
  }

  if (payment_status) {
    qb.andWhere('p.payment_status = :payment_status', { payment_status });
  }

  qb.orderBy('p.created_at', 'DESC')
    .skip((page - 1) * limit)
    .take(limit);

  const [payments, total] = await qb.getManyAndCount();

  let total_campaign_amount = 0;
  let total_successful_payments = 0;
  let total_successful_amount = 0;

  const samplePayment = await this.paymentRepo.findOne({
    where: { source_uuid },
  });

  if (samplePayment) {
    if (samplePayment.source === PaymentSource.DONATION) {
      // Total de la campagne (tous statuts)
      const donationSum = await this.donatePaymentRepo
        .createQueryBuilder('d')
        .select('SUM(d.amount)', 'sum')
        .where('d.donate_uuid = :id', { id: source_uuid })
        .andWhere('d.status = :status', { status: GlobalStatus.SUCCESS })
        .getRawOne();

      total_campaign_amount = Number(donationSum?.sum ?? 0);

      //  Total des paiements réussis AVEC FILTRE de recherche
      const successfulDonationsQb = this.donatePaymentRepo
        .createQueryBuilder('d')
        .innerJoin('payments', 'p', 'p.uuid = d.payment_uuid')
        .innerJoin('members', 'actor', 'actor.uuid = p.actor_uuid')
        .leftJoin('members', 'beneficiary', 'beneficiary.uuid = p.beneficiary_uuid')
        .select('COUNT(DISTINCT d.uuid)', 'count')
        .addSelect('SUM(d.amount)', 'sum')
        .where('d.donate_uuid = :id', { id: source_uuid })
        .andWhere('d.status = :status', { status: GlobalStatus.SUCCESS });

      if (sousGroups.length) {
        successfulDonationsQb.andWhere(
          'actor.structure_uuid IN (:...groups)',
          { groups: sousGroups },
        );
      }

      //  Appliquer le même filtre de recherche
      if (search && search.trim() !== '') {
        successfulDonationsQb.andWhere(
          `(
            LOWER(actor.firstname) LIKE LOWER(:search) OR
            LOWER(actor.lastname) LIKE LOWER(:search) OR
            LOWER(beneficiary.firstname) LIKE LOWER(:search) OR
            LOWER(beneficiary.lastname) LIKE LOWER(:search) OR
            CONCAT(LOWER(actor.firstname), ' ', LOWER(actor.lastname)) LIKE LOWER(:search) OR
            CONCAT(LOWER(beneficiary.firstname), ' ', LOWER(beneficiary.lastname)) LIKE LOWER(:search)
          )`,
          { search: `%${search.trim()}%` }
        );
      }

      const successfulDonations = await successfulDonationsQb.getRawOne();

      total_successful_payments = Number(successfulDonations?.count ?? 0);
      total_successful_amount = Number(successfulDonations?.sum ?? 0);
    }

    if (samplePayment.source === PaymentSource.SUBSCRIPTION) {
      // Total de la campagne (tous statuts)
      const subscriptionSum = await this.subscriptionPaymentRepo
        .createQueryBuilder('s')
        .select('SUM(s.amount)', 'sum')
        .where('s.subscription_uuid = :id', { id: source_uuid })
        .andWhere('s.status = :status', { status: GlobalStatus.SUCCESS })
        .getRawOne();

      total_campaign_amount = Number(subscriptionSum?.sum ?? 0);

      //  Total des paiements réussis AVEC FILTRE de recherche
      const successfulSubscriptionsQb = this.subscriptionPaymentRepo
        .createQueryBuilder('s')
        .innerJoin('payments', 'p', 'p.uuid = s.payment_uuid')
        .innerJoin('members', 'actor', 'actor.uuid = p.actor_uuid')
        .leftJoin('members', 'beneficiary', 'beneficiary.uuid = p.beneficiary_uuid')
        .select('COUNT(DISTINCT s.uuid)', 'count')
        .addSelect('SUM(s.amount)', 'sum')
        .where('s.subscription_uuid = :id', { id: source_uuid })
        .andWhere('s.status = :status', { status: GlobalStatus.SUCCESS });

      if (sousGroups.length) {
        successfulSubscriptionsQb.andWhere(
          'actor.structure_uuid IN (:...groups)',
          { groups: sousGroups },
        );
      }

      //  Appliquer le même filtre de recherche
      if (search && search.trim() !== '') {
        successfulSubscriptionsQb.andWhere(
          `(
            LOWER(actor.firstname) LIKE LOWER(:search) OR
            LOWER(actor.lastname) LIKE LOWER(:search) OR
            LOWER(beneficiary.firstname) LIKE LOWER(:search) OR
            LOWER(beneficiary.lastname) LIKE LOWER(:search) OR
            CONCAT(LOWER(actor.firstname), ' ', LOWER(actor.lastname)) LIKE LOWER(:search) OR
            CONCAT(LOWER(beneficiary.firstname), ' ', LOWER(beneficiary.lastname)) LIKE LOWER(:search)
          )`,
          { search: `%${search.trim()}%` }
        );
      }

      const successfulSubscriptions = await successfulSubscriptionsQb.getRawOne();

      total_successful_payments = Number(successfulSubscriptions?.count ?? 0);
      total_successful_amount = Number(successfulSubscriptions?.sum ?? 0);
    }
  }

  const result: TransactionWithDetails[] = [];

  for (const p of payments) {
    let donation: DonatePaymentEntity | null = null;
    let subscription: SubscriptionPaymentEntity | null = null;

    if (p.source === PaymentSource.DONATION) {
      donation = await this.donatePaymentRepo.findOne({
        where: { payment_uuid: p.uuid },
      });
    }

    if (p.source === PaymentSource.SUBSCRIPTION) {
      subscription = await this.subscriptionPaymentRepo.findOne({
        where: { payment_uuid: p.uuid },
      });
    }

    result.push({
      payment_uuid: p.uuid,
      source: p.source,
      source_uuid: p.source_uuid,
      transaction_id: p.transaction_id,
      payment_status: p.payment_status,
      status: p.status,
      created_at: p.created_at,

      amount_unit: p.amount,
      quantity: p.quantity,
      total_amount: p.total_amount,

      actor: p.actor
        ? {
          uuid: p.actor.uuid,
          firstname: p.actor.firstname,
          lastname: p.actor.lastname,
          phone: p.actor.phone,
          structure: p.actor.structure
            ? { uuid: p.actor.structure.uuid, name: p.actor.structure.name }
            : null,
        }
        : null,

      beneficiary: p.beneficiary
        ? {
          uuid: p.beneficiary.uuid,
          firstname: p.beneficiary.firstname,
          lastname: p.beneficiary.lastname,
          phone: p.beneficiary.phone,
          structure: p.beneficiary.structure
            ? {
              uuid: p.beneficiary.structure.uuid,
              name: p.beneficiary.structure.name,
            }
            : null,
        }
        : null,

      donation: donation
        ? {
          uuid: donation.uuid,
          amount: donation.amount,
          status: donation.status,
          quantity: donation.quantity,
        }
        : null,

      subscription: subscription
        ? {
          uuid: subscription.uuid,
          amount: subscription.amount,
          status: subscription.status,
          quantity: subscription.quantity,
        }
        : null,
    });
  }

  return {
    total, // Change avec le filtre
    total_campaign_amount, // Ne change pas (total global)
    total_successful_payments, // Change avec le filtre
    total_successful_amount, // Change avec le filtre
    page,
    limit,
    root_structure_uuid: member.structure_uuid,
    sous_groups: sousGroups,
    source_uuid,
    filters: {
      search: search?.trim() || null,
      payment_status: payment_status ?? null,
    },
    data: result,
  };
}



async findTransactionsForSubGroupsExport(
  source_uuid: string,
  admin_uuid: string,
  res: Response,
  status?: GlobalStatus,
) {

  const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
  if (!admin) {
    throw new NotFoundException("Identifiant de l'auteur introuvable");
  }
  const member = await this.memberRepo.findOne({ where: { uuid: admin.member_uuid } });

  if (!member) {
    throw new NotFoundException("Identifiant du membre introuvable");
  }
  const sousGroups = await this.structureService.findByAllChildrens(member?.structure_uuid);

  if (!sousGroups.length) {
    throw new NotFoundException("Aucun sous-groupe trouvé");
  }

  console.log('Sous-groupes pour export:', sousGroups);
  // Query principale SANS pagination
  const qb = this.paymentRepo
    .createQueryBuilder('p')
    .leftJoinAndSelect('p.actor', 'actor')
    .leftJoinAndSelect('actor.structure', 'actorStructure')
    .leftJoinAndSelect('p.beneficiary', 'beneficiary')
    .leftJoinAndSelect('beneficiary.structure', 'beneficiaryStructure')
    .where('p.source_uuid = :source_uuid', { source_uuid })
    .andWhere('actor.structure_uuid IN (:...groups)', { groups: sousGroups });

  // Filtre par status si fourni
  if (status) {
    qb.andWhere('p.status = :status', { status });
  }

  qb.orderBy('p.created_at', 'DESC');

  const payments = await qb.getMany();

  // Récupérer les détails (donations/subscriptions)
  const result: any[] = [];

  for (const p of payments) {
    let donation: DonatePaymentEntity | null = null;
    let subscription: SubscriptionPaymentEntity | null = null;

    if (p.source === PaymentSource.DONATION) {
      donation = await this.donatePaymentRepo.findOne({
        where: { payment_uuid: p.uuid },
      });
    }

    if (p.source === PaymentSource.SUBSCRIPTION) {
      subscription = await this.subscriptionPaymentRepo.findOne({
        where: { payment_uuid: p.uuid },
      });
    }

    result.push({
      payment_uuid: p.uuid,
      source: p.source,
      transaction_id: p.transaction_id,
      payment_status: p.payment_status,
      status: p.status,
      created_at: p.created_at,
      amount_unit: p.amount,
      quantity: p.quantity,
      total_amount: p.total_amount,
      actor_firstname: p.actor?.firstname || '',
      actor_lastname: p.actor?.lastname || '',
      actor_phone: p.actor?.phone || '',
      actor_structure: p.actor?.structure?.name || '',
      beneficiary_firstname: p.beneficiary?.firstname || '',
      beneficiary_lastname: p.beneficiary?.lastname || '',
      beneficiary_phone: p.beneficiary?.phone || '',
      beneficiary_structure: p.beneficiary?.structure?.name || '',
      donation_amount: donation?.amount || '',
      donation_status: donation?.status || '',
      subscription_amount: subscription?.amount || '',
      subscription_status: subscription?.status || '',
    });
  }

  // Créer le workbook Excel
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Transactions');

  // Définir les colonnes
  worksheet.columns = [
    { header: 'ID Transaction', key: 'transaction_id', width: 20 },
    { header: 'Source', key: 'source', width: 15 },
    { header: 'Statut Paiement', key: 'payment_status', width: 15 },
    { header: 'Statut', key: 'status', width: 15 },
    { header: 'Date', key: 'created_at', width: 20 },
    { header: 'Montant Unitaire', key: 'amount_unit', width: 15 },
    { header: 'Quantité', key: 'quantity', width: 10 },
    { header: 'Montant Total', key: 'total_amount', width: 15 },
    { header: 'Acteur - Prénom', key: 'actor_firstname', width: 20 },
    { header: 'Acteur - Nom', key: 'actor_lastname', width: 20 },
    { header: 'Acteur - Téléphone', key: 'actor_phone', width: 15 },
    { header: 'Acteur - Structure', key: 'actor_structure', width: 25 },
    { header: 'Bénéficiaire - Prénom', key: 'beneficiary_firstname', width: 20 },
    { header: 'Bénéficiaire - Nom', key: 'beneficiary_lastname', width: 20 },
    { header: 'Bénéficiaire - Téléphone', key: 'beneficiary_phone', width: 15 },
    { header: 'Bénéficiaire - Structure', key: 'beneficiary_structure', width: 25 },
  ];

  // Styliser l'en-tête
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Ajouter les données
  result.forEach(item => {
    worksheet.addRow({
      transaction_id: item.transaction_id || '',
      source: item.source || '',
      payment_status: item.payment_status || '',
      status: item.status || '',
      created_at: item.created_at ? new Date(item.created_at).toLocaleString('fr-FR') : '',
      amount_unit: item.amount_unit || 0,
      quantity: item.quantity || 0,
      total_amount: item.total_amount || 0,
      actor_firstname: item.actor_firstname,
      actor_lastname: item.actor_lastname,
      actor_phone: item.actor_phone,
      actor_structure: item.actor_structure,
      beneficiary_firstname: item.beneficiary_firstname,
      beneficiary_lastname: item.beneficiary_lastname,
      beneficiary_phone: item.beneficiary_phone,
      beneficiary_structure: item.beneficiary_structure,
    });
  });

  // Appliquer des bordures
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  // Générer le fichier Excel
  const fileName = `transactions_export_${new Date().toISOString().split('T')[0]}.xlsx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  await workbook.xlsx.write(res);
  res.end();
}


  async confirmCinetPayCallback(payload: any) {
    const { cpm_trans_id } = payload;
    let transaction_id = '';
    console.log('Vérification du paiement CinetPay pour transaction_id:', payload);

    if (payload.transaction_id) {
      console.warn('Utilisation de transaction_id dans le callback CinetPay.');
      transaction_id = payload.transaction_id;
    } else {
      transaction_id = cpm_trans_id;
    }

    if (!transaction_id) {
      throw new BadRequestException('transaction_id manquant.');
    }

    // Vérification côté CinetPay
    const check = await axios.post(
      'https://api-checkout.cinetpay.com/v2/payment/check',
      {
        transaction_id,
        apikey: process.env.CINET_API_KEY,
        site_id: process.env.CINET_SITE_ID,
      },
    );

    const response = check.data;

    console.log('Réponse de vérification CinetPay :', response);
    if (response.code !== '00') {
      throw new BadRequestException(
        `Paiement refusé par CinetPay : ${response.message}`,
      );
    }


    // data existe
    if (!response.data) {
      throw new BadRequestException('Réponse CinetPay invalide : data manquant.');
    }


    // Paiement interne
    const payment = await this.paymentRepo.findOne({
      where: { transaction_id },
    });

    if (!payment) {
      throw new NotFoundException(
        `Aucun paiement trouvé pour transaction_id = ${transaction_id}`,
      );
    }

    // status = ACCEPTED
    if (response.data.status !== 'ACCEPTED') {
      await this.updatePayment(payment.uuid, {
        status: GlobalStatus.FAILED,
        payment_status: PaymentStatus.FAILED,
      });

      // Mise à jour éventuelle d’un don ou abonnement
      await this.updateLinkedEntities(payment, GlobalStatus.FAILED);

      throw new BadRequestException(
        `Paiement refusé : statut = ${response.data.status}`,
      );
    } else {
      await this.updatePayment(payment.uuid, {
        status: GlobalStatus.SUCCESS,
        payment_status: PaymentStatus.PAID,
      });

      await this.updateLinkedEntities(payment, GlobalStatus.SUCCESS);

      return payment;
    }
  }


  /**
   * Reporte le statut d'un paiement sur la ligne métier qui le porte (abonnement ou zaimu).
   *
   * ⚠️ **Idempotente.** Elle n'écrit que si la ligne dit autre chose que le paiement. C'est
   * ce qui permet de l'appeler sur des chemins de simple lecture (la synchro répond depuis la
   * base à chaque F5 de l'écran de résultat) sans pousser un `UPDATE` ni faire bouger
   * `updated_at` à chaque affichage.
   */
  private async updateLinkedEntities(payment: PaymentEntity, status) {
    let repaired = 0;

    const donation = await this.donatePaymentRepo.findOne({
      where: { payment_uuid: payment.uuid },
    });

    if (donation && donation.status !== status) {
      donation.status = status;
      await this.donatePaymentRepo.save(donation);
      repaired += 1;
    }

    const subscription = await this.subscriptionPaymentRepo.findOne({
      where: { payment_uuid: payment.uuid },
    });

    if (subscription && subscription.status !== status) {
      subscription.status = status;
      await this.subscriptionPaymentRepo.save(subscription);
      repaired += 1;
    }

    if (!donation && !subscription) {
      console.warn(
        `Aucun Don ou Abonnement trouvé pour le paiement ${payment.uuid}`,
      );
    }

    return repaired;
  }

  /**
   * Statut métier correspondant à l'état d'argent d'un paiement.
   * Point unique : la correspondance était réécrite à chaque appel de `updateLinkedEntities`.
   */
  private globalStatusFromPaymentStatus(
    paymentStatus: PaymentStatus,
  ): GlobalStatus | null {
    switch (paymentStatus) {
      case PaymentStatus.PAID:
        return GlobalStatus.SUCCESS;
      case PaymentStatus.FAILED:
        return GlobalStatus.FAILED;
      case PaymentStatus.CANCELLED:
        return GlobalStatus.CANCELED;
      default:
        return null;
    }
  }


  async queueTransactionsExport(
    source_uuid: string,
    admin_uuid: string,
    member_uuid: string,
    member_structure_uuid: string,
    status?: GlobalStatus,

  ) {
    // Créer le job
    const job = await this.exportJobService.createJob(
      'transactions',
      { source_uuid, admin_uuid, status },
      admin_uuid,
    );
    let source_name = '';
    const filterParams = { source_uuid, status };
    if (source_uuid) {
      // Essayer de trouver dans les donations
      const sourceDonate = await this.donationRepo.findOne({
        where: { uuid: source_uuid }
      });

      if (sourceDonate) {
        source_name = `zaimu_${this.sanitizeFileName(sourceDonate.name)}`;
      } else {
        // Seulement si pas trouvé dans donations, chercher dans subscriptions
        const sourceSubscription = await this.subscriptionRepo.findOne({
          where: { uuid: source_uuid }
        });

        if (sourceSubscription) {
          source_name = `abonnement_${this.sanitizeFileName(sourceSubscription.name)}`;
        }
      }
    }

    //console.log('Source name for export file:', source_name,source_uuid);

    let file_name = await this.generateTransactionExportFileName(source_name,member_structure_uuid,filterParams);
    //console.log('Nom de fichier généré pour l\'export :', file_name);
    // Lancer le traitement en arrière-plan (sans await)
    setImmediate(() => {
      //console.log('Démarrage du traitement d\'export en arrière-plan pour le job', file_name);
      this.exportProcessorService.processTransactionsExport(job.uuid, member_uuid,member_structure_uuid,file_name)
        .catch(error => console.error('Export error:', error));
    });

    return {
      success: true,
      message: 'Export en cours de traitement',
      jobId: job.uuid,
      checkStatusUrl: `/payments/export/status/${job.uuid}`,
    };
  }

  async getExportJobStatus(jobId: string) {
    const job = await this.exportJobService.getJob(jobId);

    return {
      jobId: job.uuid,
      status: job.status,
      progress: job.progress,
      fileName: job.file_name,
      downloadUrl: job.file_name ? this.exportJobService.getDownloadUrl(job.file_name) : null,
      errorMessage: job.error_message,
      createdAt: job.created_at,
    };
  }


  async getUserExports(
    user_uuid: string,
    page: number = 1,
    limit: number = 20,
    filters: ExportJobFilters = {},
  ) {
    return this.exportJobService.getUserJobs(user_uuid, page, limit, filters);
  }


  async downloadTransactionsExport(jobUuid: string, user_uuid: string) {
    // Récupérer le job
    const job = await this.exportJobService.getJob(jobUuid);

    // 🚨 Les exports de la Comptabilité ne se téléchargent PAS par cette porte : ils ont la
    // leur (`/accounting/exports/…`), sous la permission du module Comptabilité. Les cacher
    // de la liste ne suffirait pas - la liste dissimule un uuid, elle ne ferme pas la route,
    // et ce fichier porte les noms et téléphones de toute l'organisation, sans périmètre.
    if (job.type === TYPE_EXPORT_COMPTA) {
      throw new ForbiddenException('Cet export appartient au module Comptabilité');
    }

    // Vérifier que l'utilisateur a accès à ce job
    if (job.user_uuid !== user_uuid) {
      throw new ForbiddenException('Vous n\'avez pas accès à ce fichier');
    }

    // Vérifier que le job est terminé
    if (job.status !== ExportJobStatus.COMPLETED) {
      throw new BadRequestException(`Export pas encore terminé (statut: ${job.status})`);
    }

    // Vérifier que le fichier existe
    if (!job.file_path || !fs.existsSync(job.file_path)) {
      throw new NotFoundException('Fichier d\'export introuvable');
    }

    // Lire le fichier
    const buffer = fs.readFileSync(job.file_path);

    return {
      buffer,
      filename: job.file_name,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }


  private async generateTransactionExportFileName(source_name: string, structure_uuid: string, filterParams: any): Promise<string> {
      const timestamp = new Date().toISOString().split('T')[0];
      const parts: string[] = ['export_transactions_membres'];

      // Déterminer la structure de base (ordre de priorité du plus spécifique au plus général)
      const baseStructureUuid =
        filterParams?.groupe_uuid ||
        filterParams?.district_uuid ||
        filterParams?.chapitre_uuid ||
        filterParams?.centre_uuid ||
        filterParams?.region_uuid ||
        structure_uuid;

      // Récupérer toutes les structures nécessaires en une seule requête
      const structureUuids = [
        structure_uuid,
        filterParams?.region_uuid,
        filterParams?.centre_uuid,
        filterParams?.chapitre_uuid,
        filterParams?.district_uuid,
        filterParams?.groupe_uuid,
      ].filter(Boolean);

      const structures = await this.structureService.findWithLevel(structureUuids);

      // Construire le nom de fichier
      const baseStructure = structures.find(s => s.uuid === baseStructureUuid);

      if (baseStructure) {
        // Ajouter niveau et nom de la structure de base
        if (baseStructure.level) {
          parts.push(this.sanitizeFileName(baseStructure.level.name));
        }
        parts.push(this.sanitizeFileName(baseStructure.name));
      }

      // Ajouter date
      parts.push(timestamp);
      //console.log('source du fichier export :', source_name);
      return `${source_name}_${parts.join('_')}.xlsx`;
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
  }

  /** Libellé FR de la source de paiement (pour le libellé envoyé au guichet). */
  private sourceLabelFr(source: PaymentSource): string {
    switch (source) {
      case PaymentSource.SUBSCRIPTION:
        return 'abonnement';
      case PaymentSource.DONATION:
        return 'zaimu';
      case PaymentSource.SHOP_ITEM:
        return 'boutique';
      default:
        return String(source);
    }
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  JournalDistributionEntity,
  JournalDistributionStatus,
  NotificationChannel,
} from './entities/journal-distribution.entity';
import { JournalEditionEntity } from './entities/journal-edition.entity';
import { JournalZoneEntity } from './entities/journal-zone.entity';
import { JournalZoneCityEntity } from './entities/journal-zone-city.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { CityEntity } from 'src/cities/entities/city.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import {
  AckDeliveryDto,
  DistributeEditionDto,
} from './dto/distribute-edition.dto';
import { NotificationService } from './notifications/notification.service';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import * as ExcelJS from 'exceljs';

const DEFAULT_TEMPLATE =
  'Bonjour {correspondent}, le journal "{edition}" est prêt. Veuillez retirer votre colis ({quantity} ex.) et confirmer la distribution avant le {deadline}.';

@Injectable()
export class JournalDistributionService {
  constructor(
    @InjectRepository(JournalDistributionEntity)
    private readonly distribRepo: Repository<JournalDistributionEntity>,
    @InjectRepository(JournalEditionEntity)
    private readonly editionRepo: Repository<JournalEditionEntity>,
    @InjectRepository(JournalZoneEntity)
    private readonly zoneRepo: Repository<JournalZoneEntity>,
    @InjectRepository(JournalZoneCityEntity)
    private readonly zoneCityRepo: Repository<JournalZoneCityEntity>,
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,
    @InjectRepository(CityEntity)
    private readonly cityRepo: Repository<CityEntity>,
    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,
    @InjectRepository(SubscriptionPaymentEntity)
    private readonly subPaymentRepo: Repository<SubscriptionPaymentEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly logService: LogActivitiesService,
    private readonly notificationService: NotificationService,
  ) {}

  private async getAdmin(uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    return admin;
  }

  private renderMessage(
    template: string,
    ctx: {
      correspondent: string;
      edition: string;
      quantity: number;
      deadline: string;
    },
  ): string {
    return template
      .replace(/\{correspondent\}/g, ctx.correspondent)
      .replace(/\{edition\}/g, ctx.edition)
      .replace(/\{quantity\}/g, String(ctx.quantity))
      .replace(/\{deadline\}/g, ctx.deadline);
  }

  /** Téléphone du responsable de la zone selon le canal. */
  private pickZonePhone(
    zone: JournalZoneEntity | null | undefined,
    channel: NotificationChannel,
  ): string {
    if (!zone) return '';
    if (channel === NotificationChannel.WHATSAPP) {
      return zone.responsible_phone_whatsapp || zone.responsible_phone || '';
    }
    return zone.responsible_phone || zone.responsible_phone_whatsapp || '';
  }

  /** Nom affiché du responsable d'une zone (repli sur le numéro de zone). */
  private async zoneResponsibleName(zone: JournalZoneEntity): Promise<string> {
    if (zone.responsible_member_uuid) {
      const m = await this.memberRepo.findOne({
        where: { uuid: zone.responsible_member_uuid },
        select: ['uuid', 'firstname', 'lastname'],
      });
      const name = m
        ? `${m.lastname ?? ''} ${m.firstname ?? ''}`.trim()
        : '';
      if (name) return name;
    }
    return `Responsable Zone ${zone.number}`;
  }

  /** Ajoute une entrée à l'historique JSON (tolérant aux valeurs corrompues). */
  private appendHistory(
    existing: string | null,
    entry: Record<string, any>,
  ): string {
    let arr: any[] = [];
    if (existing) {
      try {
        arr = JSON.parse(existing);
        if (!Array.isArray(arr)) arr = [arr];
      } catch {
        arr = [];
      }
    }
    arr.push(entry);
    return JSON.stringify(arr);
  }

  /**
   * Statut "effectif" : une distribution non livrée/annulée dont la deadline
   * est dépassée est considérée "en retard", même si le sweep n'a pas encore
   * tourné. Garantit la cohérence entre la liste et les statistiques.
   */
  private effectiveStatus(
    d: JournalDistributionEntity,
    deadline: Date,
    now: Date,
  ): JournalDistributionStatus {
    if (
      d.status !== JournalDistributionStatus.DELIVERED &&
      d.status !== JournalDistributionStatus.CANCELED &&
      now > deadline
    ) {
      return JournalDistributionStatus.LATE;
    }
    return d.status;
  }

  /**
   * Lance la distribution d'une édition, PAR ZONE :
   *  - calcule le besoin par zone (dérivé des abonnements de la campagne liée) ;
   *  - crée 1 distribution par zone (idempotent) avec la quantité = besoin ;
   *  - envoie l'alerte SMS/WhatsApp au RESPONSABLE de la zone ;
   *  - passe l'édition en STARTED.
   */
  async distributeEdition(
    edition_uuid: string,
    payload: DistributeEditionDto,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({
      where: { uuid: edition_uuid },
    });
    if (!edition) throw new NotFoundException('Édition introuvable');

    const channel = payload.channel ?? NotificationChannel.SMS;
    const template = payload.message_template ?? DEFAULT_TEMPLATE;

    // Besoin par zone dérivé des abonnements payés de la campagne liée.
    const needs = await this.computeNeedsByZone(edition_uuid, admin_uuid);
    let targetZones = needs.by_zone;
    if (payload.zone_uuids?.length) {
      const set = new Set(payload.zone_uuids);
      targetZones = targetZones.filter((z) => set.has(z.zone_uuid));
    }
    if (!targetZones.length) {
      throw new BadRequestException(
        'Aucune zone à servir (besoin nul ou abonnés non rattachés à une zone).',
      );
    }

    const zones = await this.zoneRepo.find({
      where: { uuid: In(targetZones.map((z) => z.zone_uuid)) },
    });
    const zoneMap = new Map(zones.map((z) => [z.uuid, z]));

    const deadlineStr = edition.distribution_deadline_at
      .toISOString()
      .substring(0, 10);

    const results: any[] = [];

    for (const zoneNeed of targetZones) {
      const zone = zoneMap.get(zoneNeed.zone_uuid);
      if (!zone) continue;

      // Idempotence : 1 ligne distribution par (édition, zone)
      let distrib = await this.distribRepo.findOne({
        where: { edition_uuid: edition.uuid, zone_uuid: zone.uuid },
      });
      if (!distrib) {
        distrib = this.distribRepo.create({
          edition_uuid: edition.uuid,
          zone_uuid: zone.uuid,
          expected_quantity: zoneNeed.total_abonnes ?? 0,
          channel,
          admin_uuid,
          status: JournalDistributionStatus.PENDING,
        });
      } else {
        distrib.channel = channel;
        distrib.expected_quantity = zoneNeed.total_abonnes ?? 0;
      }

      const responsibleName = await this.zoneResponsibleName(zone);
      const message = this.renderMessage(template, {
        correspondent: responsibleName,
        edition: `${edition.title} N°${edition.number} - ${edition.month}/${edition.year}`,
        quantity: zoneNeed.total_abonnes ?? 0,
        deadline: deadlineStr,
      });
      const phone = this.pickZonePhone(zone, channel);

      const sendResult = await this.notificationService.send({
        to: phone,
        message,
        channel,
        reference: distrib.uuid,
      });

      distrib.last_message = message;
      distrib.notified_at = new Date();
      distrib.retry_count = (distrib.retry_count ?? 0) + 1;
      if (sendResult.success) {
        distrib.status = JournalDistributionStatus.NOTIFIED;
        distrib.sent_at = new Date();
      }
      distrib.history = this.appendHistory(distrib.history, {
        action: sendResult.success
          ? 'Alerte envoyée'
          : `Échec d'envoi : ${sendResult.error}`,
        table_action: 'journal-distribution-notify',
        performed_by: `${admin.firstname} ${admin.lastname}`,
        channel,
        provider: sendResult.provider,
        provider_message_id: sendResult.provider_message_id,
        admin_uuid,
        performed_at: new Date(),
      });

      const saved = await this.distribRepo.save(distrib);
      results.push({
        zone_uuid: zone.uuid,
        zone_number: zone.number,
        zone_name: zone.name,
        phone,
        expected_quantity: zoneNeed.total_abonnes ?? 0,
        success: sendResult.success,
        distribution_uuid: saved.uuid,
        provider_message_id: sendResult.provider_message_id,
        error: sendResult.error,
      });
    }

    if (edition.status !== GlobalStatus.STARTED) {
      edition.status = GlobalStatus.STARTED;
      await this.editionRepo.save(edition);
    }

    await this.logService.logAction(
      'journal-edition-distribute',
      admin.id,
      `Distribution lancée pour "${edition.title} N°${edition.number}" -> ${results.length} zones (${results.filter((r) => r.success).length} OK).`,
    );

    return {
      edition_uuid: edition.uuid,
      channel,
      deadline: edition.distribution_deadline_at,
      total: results.length,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * Liste des distributions pour une édition (avec calcul "late" à la volée
   * pour les pending dépassées de la deadline).
   */
  async listForEdition(edition_uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({
      where: { uuid: edition_uuid },
      relations: ['subscription'],
    });
    if (!edition) throw new NotFoundException('Édition introuvable');

    const distribs = await this.distribRepo.find({
      where: { edition_uuid },
      relations: ['zone'],
      order: { created_at: 'ASC' },
    });

    const now = new Date();
    const deadline = new Date(edition.distribution_deadline_at);
    for (const d of distribs) {
      d.status = this.effectiveStatus(d, deadline, now);
    }

    await this.logService.logAction(
      'journal-distribution-list',
      admin.id,
      `Liste distributions édition "${edition.title} N°${edition.number}"`,
    );

    return {
      edition,
      subscription: edition.subscription ?? null,
      items: distribs,
    };
  }

  /**
   * Accuse de réception côté correspondant - passe la distribution en delivered.
   */
  async ackDelivery(
    distribution_uuid: string,
    payload: AckDeliveryDto,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const distrib = await this.distribRepo.findOne({
      where: { uuid: distribution_uuid },
      relations: ['edition', 'zone'],
    });
    if (!distrib) throw new NotFoundException('Distribution introuvable');

    distrib.delivered_quantity = Math.max(0, Number(payload.delivered_quantity ?? 0));
    distrib.delivered_at = new Date();

    const deadline = new Date(distrib.edition.distribution_deadline_at);
    distrib.status =
      distrib.delivered_at > deadline
        ? JournalDistributionStatus.LATE
        : JournalDistributionStatus.DELIVERED;

    const entry = {
      action: `Confirmation de livraison (${distrib.delivered_quantity} ex.)`,
      table_action: 'journal-distribution-ack',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      comment: payload.comment ?? null,
      admin_uuid,
      performed_at: new Date(),
    };
    let arr: any[] = [];
    if (distrib.history) {
      try {
        arr = JSON.parse(distrib.history);
        if (!Array.isArray(arr)) arr = [arr];
      } catch {
        arr = [];
      }
    }
    arr.push(entry);
    distrib.history = JSON.stringify(arr);

    const saved = await this.distribRepo.save(distrib);
    await this.logService.logAction(
      'journal-distribution-ack',
      admin.id,
      `Livraison confirmée pour distribution ${saved.uuid} (${saved.status})`,
    );
    return saved;
  }

  /**
   * Tâche d'arrière-plan : marque "late" toutes les distributions encore non
   * livrées dont la deadline est dépassée. Renvoie en plus les "à relancer J+1".
   * Peut être appelée manuellement ou planifiée (cron) ultérieurement.
   */
  async sweepLateAndRemind(admin_uuid?: string, edition_uuid?: string) {
    // admin_uuid absent => exécution planifiée (cron) : acteur « SYSTÈME ».
    const admin = admin_uuid ? await this.getAdmin(admin_uuid) : null;
    const performedBy = admin
      ? `${admin.firstname} ${admin.lastname}`
      : 'SYSTÈME (planifié)';
    const now = new Date();

    const qb = this.distribRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.edition', 'e')
      .leftJoinAndSelect('d.zone', 'zone')
      .where('d.status NOT IN (:...done)', {
        done: [
          JournalDistributionStatus.DELIVERED,
          JournalDistributionStatus.CANCELED,
        ],
      });

    // Scoper le balayage à une édition si demandé (évite de relancer toutes les éditions).
    if (edition_uuid) {
      qb.andWhere('d.edition_uuid = :edition_uuid', { edition_uuid });
    }

    const distribs = await qb.getMany();

    let lateCount = 0;
    let remindCount = 0;

    for (const d of distribs) {
      const deadline = new Date(d.edition.distribution_deadline_at);
      const start = new Date(d.edition.distribution_start_at);
      const oneDayAfterStart = new Date(start);
      oneDayAfterStart.setDate(oneDayAfterStart.getDate() + 1);

      // Au-delà de la deadline → late
      if (now > deadline) {
        if (d.status !== JournalDistributionStatus.LATE) {
          d.status = JournalDistributionStatus.LATE;
          d.history = this.appendHistory(d.history, {
            action: 'Marquée en retard (deadline dépassée)',
            table_action: 'journal-distribution-late',
            performed_by: performedBy,
            admin_uuid: admin_uuid ?? null,
            performed_at: new Date(),
          });
          await this.distribRepo.save(d);
          lateCount++;
        }
        continue;
      }

      // Entre J+1 et la deadline, on relance si la 1re alerte a réussi sans confirmation
      if (
        now >= oneDayAfterStart &&
        d.retry_count < 2 &&
        d.status === JournalDistributionStatus.NOTIFIED
      ) {
        const phone = this.pickZonePhone(
          d.zone,
          d.channel ?? NotificationChannel.SMS,
        );
        const responsibleName = d.zone
          ? await this.zoneResponsibleName(d.zone)
          : 'Responsable';
        const message =
          `Rappel : la distribution de "${d.edition.title} N°${d.edition.number}" doit être achevée au plus tard le ` +
          deadline.toISOString().substring(0, 10) +
          `. Merci ${responsibleName}.`;

        const res = await this.notificationService.send({
          to: phone,
          message,
          channel: d.channel ?? NotificationChannel.SMS,
          reference: d.uuid,
        });
        if (res.success) {
          d.retry_count += 1;
          d.last_message = message;
          d.notified_at = new Date();
          d.status = JournalDistributionStatus.IN_PROGRESS;
          await this.distribRepo.save(d);
          remindCount++;
        }
      }
    }

    await this.logService.logAction(
      'journal-distribution-sweep',
      admin?.id,
      `Sweep distributions : ${lateCount} marquées late, ${remindCount} relancées (J+1).`,
    );

    return { processed: distribs.length, late: lateCount, reminded: remindCount };
  }

  /**
   * Statistiques d'une édition :
   *  - total destinations, notifiées, livrées, en retard, taux livraison,
   *    livré à temps vs en retard, par zone.
   */
  async statsForEdition(edition_uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({
      where: { uuid: edition_uuid },
    });
    if (!edition) throw new NotFoundException('Édition introuvable');

    const items = await this.distribRepo.find({
      where: { edition_uuid },
      relations: ['zone'],
    });

    // Statut effectif (cohérent avec la liste) avant agrégation.
    const now = new Date();
    const deadline = new Date(edition.distribution_deadline_at);
    for (const d of items) {
      d.status = this.effectiveStatus(d, deadline, now);
    }

    const total = items.length;
    const delivered = items.filter(
      (d) => d.status === JournalDistributionStatus.DELIVERED,
    ).length;
    const late = items.filter(
      (d) => d.status === JournalDistributionStatus.LATE,
    ).length;
    // Cumulatif : toute zone déjà notifiée (y compris celles livrées ensuite).
    // « Notifié » est une étape franchie, pas un statut courant exclusif - sinon
    // le compteur retombe à 0 dès qu'une zone passe en « livré ».
    const notified = items.filter((d) => !!d.notified_at).length;
    const pending = items.filter(
      (d) => d.status === JournalDistributionStatus.PENDING,
    ).length;

    const expected_total = items.reduce(
      (s, d) => s + (d.expected_quantity ?? 0),
      0,
    );
    const delivered_total = items.reduce(
      (s, d) => s + (d.delivered_quantity ?? 0),
      0,
    );

    // Agrégat par zone
    const byZoneMap = new Map<string, any>();
    for (const d of items) {
      const zoneName = d.zone?.name ?? 'N/A';
      if (!byZoneMap.has(zoneName)) {
        byZoneMap.set(zoneName, {
          zone: zoneName,
          total: 0,
          delivered: 0,
          late: 0,
          expected_quantity: 0,
          delivered_quantity: 0,
        });
      }
      const z = byZoneMap.get(zoneName);
      z.total += 1;
      if (d.status === JournalDistributionStatus.DELIVERED) z.delivered += 1;
      if (d.status === JournalDistributionStatus.LATE) z.late += 1;
      z.expected_quantity += d.expected_quantity ?? 0;
      z.delivered_quantity += d.delivered_quantity ?? 0;
    }

    const result = {
      edition: {
        uuid: edition.uuid,
        title: edition.title,
        number: edition.number,
        month: edition.month,
        year: edition.year,
        distribution_start_at: edition.distribution_start_at,
        distribution_deadline_at: edition.distribution_deadline_at,
      },
      total_destinations: total,
      pending,
      notified,
      delivered,
      late,
      delivery_rate: total ? Math.round((delivered / total) * 1000) / 10 : 0,
      expected_total,
      delivered_total,
      delivered_qty_rate: expected_total
        ? Math.round((delivered_total / expected_total) * 1000) / 10
        : 0,
      by_zone: Array.from(byZoneMap.values()).sort((a, b) =>
        a.zone.localeCompare(b.zone),
      ),
    };

    await this.logService.logAction(
      'journal-distribution-stats',
      admin.id,
      `Stats édition "${edition.title} N°${edition.number}"`,
    );

    return result;
  }

  /**
   * Statistiques globales (toutes éditions confondues) - vue synthétique pour
   * un dashboard rédacteur en chef.
   */
  async globalStats(admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const totalEditions = await this.editionRepo.count();
    const totalDistributions = await this.distribRepo.count();
    const delivered = await this.distribRepo.count({
      where: { status: JournalDistributionStatus.DELIVERED },
    });
    const late = await this.distribRepo.count({
      where: { status: JournalDistributionStatus.LATE },
    });

    await this.logService.logAction(
      'journal-distribution-global-stats',
      admin.id,
      'Consultation des stats globales du journal',
    );

    return {
      total_editions: totalEditions,
      total_distributions: totalDistributions,
      delivered,
      late,
      delivery_rate: totalDistributions
        ? Math.round((delivered / totalDistributions) * 1000) / 10
        : 0,
      late_rate: totalDistributions
        ? Math.round((late / totalDistributions) * 1000) / 10
        : 0,
    };
  }

  /**
   * Calcule le besoin par zone d'une édition À PARTIR DES ABONNEMENTS :
   *  - somme des quantités payées (statut SUCCESS/COMPLETED) de la campagne liée ;
   *  - chaque abonné est rattaché à sa zone via members.city_uuid ∈ villes de la zone.
   * Agrégation 100 % en mémoire (aucun JOIN inter-tables → insensible aux collations).
   */
  async computeNeedsByZone(edition_uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({
      where: { uuid: edition_uuid },
    });
    if (!edition) throw new NotFoundException('Édition introuvable');
    if (!edition.subscription_uuid) {
      throw new BadRequestException(
        "Cette édition n'est liée à aucune campagne d'abonnement.",
      );
    }

    // 1) Paiements payés de la campagne liée
    const payments = await this.subPaymentRepo.find({
      where: {
        subscription_uuid: edition.subscription_uuid,
        status: In([GlobalStatus.SUCCESS, GlobalStatus.COMPLETED]),
      },
    });
    const totalNeed = payments.reduce((s, p) => s + (p.quantity ?? 0), 0);

    // 2) Bénéficiaire (membre) -> ville (par lots pour éviter un IN géant)
    const benUuids = Array.from(
      new Set(payments.map((p) => p.beneficiary_uuid).filter(Boolean)),
    );
    const memberCity = new Map<string, string | null>();
    const memberStruct = new Map<string, string | null>();
    const chunkSize = 500;
    for (let i = 0; i < benUuids.length; i += chunkSize) {
      const chunk = benUuids.slice(i, i + chunkSize);
      const members = await this.memberRepo.find({
        where: { uuid: In(chunk) },
        select: ['uuid', 'city_uuid', 'structure_uuid'],
      });
      for (const m of members) {
        memberCity.set(m.uuid, m.city_uuid ?? null);
        memberStruct.set(
          m.uuid,
          (m as unknown as { structure_uuid: string | null }).structure_uuid ?? null,
        );
      }
    }

    // 3) Ville -> zone (table de liaison, volume modeste)
    const zoneCities = await this.zoneCityRepo.find();
    const cityToZone = new Map<string, string>();
    for (const zc of zoneCities) cityToZone.set(zc.city_uuid, zc.zone_uuid);

    // 4) Métadonnées des zones (entité complète pour enrichir la répartition)
    const zones = await this.zoneRepo.find();
    const zoneMeta = new Map(zones.map((z) => [z.uuid, z]));

    // Nombre de villes desservies par zone
    const cityCount = new Map<string, number>();
    for (const zc of zoneCities) {
      cityCount.set(zc.zone_uuid, (cityCount.get(zc.zone_uuid) ?? 0) + 1);
    }

    // 4bis) Rattachement par STRUCTURE (+ sous-arbre). Chaque zone configurée
    // sur une vraie structure devient une « racine » ; un abonné est rattaché à
    // la zone dont la racine est l'ancêtre le PLUS PROCHE de sa structure
    // (remontée via parent_uuid). Ce signal est PRIORITAIRE sur la ville :
    // il est précis (règle le cas d'une ville comme Abidjan couvrant plusieurs
    // zones) et garantit un rattachement unique par abonné.
    const allStructures = await this.structureRepo.find({
      select: ['uuid', 'parent_uuid'],
    });
    const validStructSet = new Set(allStructures.map((s) => s.uuid));
    const parentOf = new Map<string, string | null>();
    for (const s of allStructures) {
      parentOf.set(
        s.uuid,
        (s as unknown as { parent_uuid: string | null }).parent_uuid ?? null,
      );
    }
    const rootToZone = new Map<string, string>();
    for (const z of zones) {
      const su = (z as unknown as { structure_uuid: string | null }).structure_uuid;
      if (su && validStructSet.has(su) && !rootToZone.has(su)) {
        rootToZone.set(su, z.uuid);
      }
    }
    const zoneForStructMemo = new Map<string, string | null>();
    const zoneForStruct = (su: string | null): string | null => {
      if (!su) return null;
      const cached = zoneForStructMemo.get(su);
      if (cached !== undefined) return cached;
      const path: string[] = [];
      let cur: string | null = su;
      let found: string | null = null;
      const guard = new Set<string>();
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        path.push(cur);
        const zu = rootToZone.get(cur);
        if (zu) {
          found = zu;
          break;
        }
        cur = parentOf.get(cur) ?? null;
      }
      for (const p of path) {
        if (!zoneForStructMemo.has(p)) zoneForStructMemo.set(p, found);
      }
      return found;
    };

    // 5) Agrégation par zone - 1 abonné = 1 zone (structure d'abord, ville en secours)
    const perZone = new Map<string, number>();
    const perZoneSource = new Map<
      string,
      { from_structure: number; from_city: number }
    >();
    let unassigned = 0; // rattaché ni par structure ni par ville
    let assignedByStructure = 0;
    let assignedByCity = 0;
    for (const p of payments) {
      const qty = p.quantity ?? 0;
      // 1) Structure (+ sous-arbre) - prioritaire.
      let zoneUuid: string | undefined =
        zoneForStruct(memberStruct.get(p.beneficiary_uuid) ?? null) ?? undefined;
      let bySource: 'structure' | 'city' = 'structure';
      // 2) Ville - en secours seulement.
      if (!zoneUuid) {
        const city = memberCity.get(p.beneficiary_uuid);
        zoneUuid = city ? cityToZone.get(city) : undefined;
        bySource = 'city';
      }
      if (zoneUuid) {
        perZone.set(zoneUuid, (perZone.get(zoneUuid) ?? 0) + qty);
        const src =
          perZoneSource.get(zoneUuid) ?? { from_structure: 0, from_city: 0 };
        if (bySource === 'structure') {
          src.from_structure += qty;
          assignedByStructure += qty;
        } else {
          src.from_city += qty;
          assignedByCity += qty;
        }
        perZoneSource.set(zoneUuid, src);
      } else {
        unassigned += qty;
      }
    }

    // 6) Enrichissement : région (structure OU ville) + responsable - sans JOIN.
    const activeZoneUuids = Array.from(perZone.keys());
    const regionUuids = Array.from(
      new Set(
        activeZoneUuids
          .map((u) => zoneMeta.get(u)?.structure_uuid)
          .filter(Boolean) as string[],
      ),
    );
    const regionName = new Map<string, string>();
    if (regionUuids.length) {
      const structs = await this.structureRepo.find({
        where: { uuid: In(regionUuids) },
      });
      for (const s of structs) regionName.set(s.uuid, s.name);
      const missing = regionUuids.filter((u) => !regionName.has(u));
      if (missing.length) {
        const cities = await this.cityRepo.find({
          where: { uuid: In(missing) },
        });
        for (const c of cities) regionName.set(c.uuid, c.name);
      }
    }
    const respUuids = Array.from(
      new Set(
        activeZoneUuids
          .map((u) => zoneMeta.get(u)?.responsible_member_uuid)
          .filter(Boolean) as string[],
      ),
    );
    const respName = new Map<string, string>();
    if (respUuids.length) {
      const members = await this.memberRepo.find({
        where: { uuid: In(respUuids) },
        select: ['uuid', 'firstname', 'lastname'],
      });
      for (const m of members) {
        respName.set(
          m.uuid,
          `${m.lastname ?? ''} ${m.firstname ?? ''}`.trim(),
        );
      }
    }

    const by_zone = Array.from(perZone.entries())
      .map(([zone_uuid, total_abonnes]) => {
        const z = zoneMeta.get(zone_uuid);
        return {
          zone_uuid,
          number: z?.number ?? null,
          name: z?.name ?? null,
          region: z?.structure_uuid
            ? (regionName.get(z.structure_uuid) ?? null)
            : null,
          responsible_name: z?.responsible_member_uuid
            ? (respName.get(z.responsible_member_uuid) ?? null)
            : null,
          responsible_phone: z?.responsible_phone ?? null,
          city_count: cityCount.get(zone_uuid) ?? 0,
          total_abonnes,
          from_structure: perZoneSource.get(zone_uuid)?.from_structure ?? 0,
          from_city: perZoneSource.get(zone_uuid)?.from_city ?? 0,
        };
      })
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

    await this.logService.logAction(
      'journal-edition-needs-by-zone',
      admin.id,
      `Calcul du besoin par zone pour "${edition.title} N°${edition.number}" (total ${totalNeed})`,
    );

    return {
      edition_uuid: edition.uuid,
      subscription_uuid: edition.subscription_uuid,
      payment_count: payments.length,
      total_need: totalNeed,
      assigned_total: totalNeed - unassigned,
      unassigned,
      assigned_by_structure: assignedByStructure,
      assigned_by_city: assignedByCity,
      by_zone,
    };
  }

  /**
   * Résout le chemin de structure (national → sous-groupe) pour un ensemble de
   * structures « feuilles » (la structure du membre). Remontée EN MÉMOIRE via
   * parent_uuid (aucun JOIN inter-tables → insensible aux collations).
   * Renvoie une map : uuid feuille → chemin [{ level, name }] (racine → feuille).
   */
  private async resolveStructurePaths(
    leafUuids: string[],
  ): Promise<Map<string, { level: string; name: string }[]>> {
    const result = new Map<string, { level: string; name: string }[]>();
    const leaves = Array.from(new Set(leafUuids.filter(Boolean)));
    if (!leaves.length) return result;

    // Charger feuilles + ancêtres, niveau par niveau (max ~8 itérations).
    const structMap = new Map<
      string,
      {
        name: string;
        parent_uuid: string | null;
        level_uuid: string | null;
      }
    >();
    let frontier = leaves.slice();
    while (frontier.length) {
      const toLoad = frontier.filter((u) => u && !structMap.has(u));
      if (!toLoad.length) break;
      const rows = await this.structureRepo.find({
        where: { uuid: In(toLoad) },
        select: ['uuid', 'name', 'parent_uuid', 'level_uuid'],
      });
      frontier = [];
      for (const s of rows) {
        const parent = (s as { parent_uuid?: string | null }).parent_uuid ?? null;
        structMap.set(s.uuid, {
          name: s.name,
          parent_uuid: parent,
          level_uuid: (s as { level_uuid?: string | null }).level_uuid ?? null,
        });
        if (parent && parent.trim() && !structMap.has(parent)) {
          frontier.push(parent);
        }
      }
    }

    // Noms des niveaux (table levels) via requête brute.
    const levelRows: { uuid: string; name: string }[] =
      await this.structureRepo.manager.query('SELECT uuid, name FROM levels');
    const levelName = new Map(levelRows.map((l) => [l.uuid, l.name]));

    for (const leaf of leaves) {
      const path: { level: string; name: string }[] = [];
      const seen = new Set<string>();
      let cur: string | null = leaf;
      while (cur && structMap.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        const s = structMap.get(cur)!;
        path.push({
          level: s.level_uuid ? (levelName.get(s.level_uuid) ?? '') : '',
          name: s.name,
        });
        cur = s.parent_uuid && s.parent_uuid.trim() ? s.parent_uuid : null;
      }
      result.set(leaf, path.reverse()); // racine → feuille
    }
    return result;
  }

  /**
   * Liste NOMINATIVE des abonnés d'une zone pour une édition donnée.
   * Permet de tracer tout le flow : abonné (paiement payé) → sa ville → cette zone.
   * Agrégation en mémoire + requêtes mono-table In(...) → insensible aux collations.
   */
  async subscribersByZone(
    edition_uuid: string,
    zone_uuid: string,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({
      where: { uuid: edition_uuid },
    });
    if (!edition) throw new NotFoundException('Édition introuvable');
    if (!edition.subscription_uuid) {
      throw new BadRequestException(
        "Cette édition n'est liée à aucune campagne d'abonnement.",
      );
    }

    // Villes rattachées à la zone
    const zoneCities = await this.zoneCityRepo.find({ where: { zone_uuid } });
    const citySet = new Set(zoneCities.map((zc) => zc.city_uuid));
    if (citySet.size === 0) {
      return { edition_uuid, zone_uuid, count: 0, total: 0, subscribers: [] };
    }

    // Paiements payés de la campagne liée
    const payments = await this.subPaymentRepo.find({
      where: {
        subscription_uuid: edition.subscription_uuid,
        status: In([GlobalStatus.SUCCESS, GlobalStatus.COMPLETED]),
      },
    });

    // Bénéficiaires → membres (par lots)
    const benUuids = Array.from(
      new Set(payments.map((p) => p.beneficiary_uuid).filter(Boolean)),
    );
    const memberMap = new Map<string, MemberEntity>();
    const chunkSize = 500;
    for (let i = 0; i < benUuids.length; i += chunkSize) {
      const chunk = benUuids.slice(i, i + chunkSize);
      const members = await this.memberRepo.find({
        where: { uuid: In(chunk) },
        select: [
          'uuid',
          'firstname',
          'lastname',
          'matricule',
          'phone',
          'city_uuid',
          'structure_uuid',
        ],
      });
      for (const m of members) memberMap.set(m.uuid, m);
    }

    // Ne garder que les abonnés dont la ville appartient à la zone
    const rows: {
      member_uuid: string;
      name: string;
      matricule: string | null;
      phone: string | null;
      city_uuid: string | null;
      structure_uuid: string | null;
      quantity: number;
    }[] = [];
    const usedCities = new Set<string>();
    for (const p of payments) {
      const m = memberMap.get(p.beneficiary_uuid);
      if (!m || !m.city_uuid || !citySet.has(m.city_uuid)) continue;
      usedCities.add(m.city_uuid);
      const name = `${m.lastname ?? ''} ${m.firstname ?? ''}`.trim();
      rows.push({
        member_uuid: m.uuid,
        name: name || (m.matricule ?? m.uuid),
        matricule: m.matricule ?? null,
        phone: m.phone ?? null,
        city_uuid: m.city_uuid ?? null,
        structure_uuid: m.structure_uuid ?? null,
        quantity: p.quantity ?? 0,
      });
    }

    // Chemin de structure complet (national → sous-groupe) par membre, résolu en
    // remontant parent_uuid EN MÉMOIRE (aucun JOIN → insensible aux collations).
    const structurePathByLeaf = await this.resolveStructurePaths(
      rows.map((r) => r.structure_uuid).filter(Boolean) as string[],
    );

    // Noms des villes (In-list, collation-safe)
    const cityNameMap = new Map<string, string>();
    if (usedCities.size) {
      const cities = await this.cityRepo.find({
        where: { uuid: In(Array.from(usedCities)) },
      });
      for (const c of cities) cityNameMap.set(c.uuid, c.name);
    }

    const subscribers = rows
      .map((r) => ({
        ...r,
        city_name: r.city_uuid ? (cityNameMap.get(r.city_uuid) ?? null) : null,
        structure_path: r.structure_uuid
          ? (structurePathByLeaf.get(r.structure_uuid) ?? [])
          : [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    await this.logService.logAction(
      'journal-edition-zone-subscribers',
      admin.id,
      `Liste des abonnés de la zone ${zone_uuid} pour "${edition.title} N°${edition.number}"`,
    );

    return {
      edition_uuid,
      zone_uuid,
      count: subscribers.length,
      total: subscribers.reduce((s, r) => s + r.quantity, 0),
      subscribers,
    };
  }

  /**
   * Rapport d'impression d'une édition (reproduit le fichier Excel "PRINTING REPORT") :
   *  - liste : liste d'impression par zone (région, villes, responsable, total) ;
   *  - recap : récap groupé par responsable avec sous-totaux ;
   *  - packages : étiquettes de colisage (1+ colis par zone, numérotés x/y dans le
   *    groupe du responsable, découpés selon packageSize).
   * S'appuie sur computeNeedsByZone (dérivation depuis les abonnements).
   */
  async printingReport(
    edition_uuid: string,
    admin_uuid: string,
    packageSize = 250,
  ) {
    const size = packageSize > 0 ? packageSize : 250;
    const needs = await this.computeNeedsByZone(edition_uuid, admin_uuid);
    const edition = await this.editionRepo.findOne({
      where: { uuid: edition_uuid },
    });
    if (!edition) throw new NotFoundException('Édition introuvable');
    const editionRef = `N°${edition.number} - ${edition.month}/${edition.year}`;

    // Villes par zone (In-list, collation-safe)
    const activeZoneUuids = needs.by_zone.map((z) => z.zone_uuid);
    const villesByZone = new Map<string, string[]>();
    if (activeZoneUuids.length) {
      const zcs = await this.zoneCityRepo.find({
        where: { zone_uuid: In(activeZoneUuids) },
      });
      const cityUuids = Array.from(new Set(zcs.map((z) => z.city_uuid)));
      const cityName = new Map<string, string>();
      if (cityUuids.length) {
        const cities = await this.cityRepo.find({
          where: { uuid: In(cityUuids) },
        });
        for (const c of cities) cityName.set(c.uuid, c.name);
      }
      for (const zc of zcs) {
        const arr = villesByZone.get(zc.zone_uuid) ?? [];
        arr.push(cityName.get(zc.city_uuid) ?? zc.city_uuid);
        villesByZone.set(zc.zone_uuid, arr);
      }
    }

    // 1) Liste d'impression
    const liste = needs.by_zone.map((z) => ({
      number: z.number,
      zone_name: z.name,
      region: z.region,
      villes: villesByZone.get(z.zone_uuid) ?? [],
      responsible_name: z.responsible_name,
      responsible_phone: z.responsible_phone,
      total: z.total_abonnes,
    }));

    // 2) Récap groupé par responsable (sous-totaux)
    const groups = new Map<
      string,
      {
        responsible_name: string | null;
        responsible_phone: string | null;
        lines: typeof liste;
        subtotal: number;
      }
    >();
    for (const z of liste) {
      const key = z.responsible_name || '-';
      if (!groups.has(key)) {
        groups.set(key, {
          responsible_name: z.responsible_name,
          responsible_phone: z.responsible_phone,
          lines: [],
          subtotal: 0,
        });
      }
      const g = groups.get(key)!;
      g.lines.push(z);
      g.subtotal += z.total ?? 0;
    }
    const recap = Array.from(groups.values());

    // 3) Colisage (étiquettes) : par responsable, 1+ colis par zone, numérotés x/y
    const packages: any[] = [];
    for (const g of recap) {
      const colisList: any[] = [];
      for (const z of g.lines) {
        const total = z.total ?? 0;
        const count = Math.max(1, Math.ceil(total / size));
        for (let i = 0; i < count; i++) {
          const qty = count === 1 ? total : Math.min(size, total - i * size);
          colisList.push({
            zone_number: z.number,
            zone_name: z.zone_name,
            region: z.region,
            villes: z.villes,
            quantity: qty,
          });
        }
      }
      const y = colisList.length;
      colisList.forEach((c, idx) =>
        packages.push({
          ...c,
          responsible_name: g.responsible_name,
          responsible_phone: g.responsible_phone,
          colis_index: idx + 1,
          colis_count: y,
          edition_ref: editionRef,
        }),
      );
    }

    return {
      edition: {
        uuid: edition.uuid,
        title: edition.title,
        number: edition.number,
        month: edition.month,
        year: edition.year,
        ref: editionRef,
      },
      package_size: size,
      total_need: needs.total_need,
      assigned_total: needs.assigned_total,
      unassigned: needs.unassigned,
      liste,
      recap,
      packages,
    };
  }

  /**
   * Génère le classeur Excel d'impression mis en forme (reproduit le fichier
   * "PRINTING REPORT" fourni) : bloc-titre, en-têtes fusionnés multi-lignes,
   * colonne ZONES fusionnée verticalement par responsable, sous-totaux, total
   * général. 3 feuilles : RECAP-ABONNES, PRINTING LIST, PACKAGES.
   */
  async buildPrintingWorkbook(
    edition_uuid: string,
    admin_uuid: string,
    packageSize = 250,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const d = await this.printingReport(edition_uuid, admin_uuid, packageSize);

    const titleTxt = `LE ${d.edition.title} N°${d.edition.number}`;
    const ref = d.edition.ref;
    const recensement = `RECENSEMENT GENERAL - ${d.edition.year}`;

    const thin = { style: 'thin' as const, color: { argb: 'FF9AA5B1' } };
    const allBorder = {
      top: thin,
      left: thin,
      bottom: thin,
      right: thin,
    };
    const fill = (argb: string): ExcelJS.Fill => ({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb },
    });
    const TITLE_FILL = fill('FF1F3864');
    const SUBTITLE_FILL = fill('FFDCE6F1');
    const HEADER_FILL = fill('FFE8EEF7');
    const SUBTOTAL_FILL = fill('FFE7F1E7');
    const TOTAL_FILL = fill('FFFCE4D6');

    const styleRange = (
      ws: ExcelJS.Worksheet,
      r1: number,
      c1: number,
      r2: number,
      c2: number,
    ) => {
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          ws.getCell(r, c).border = allBorder;
        }
      }
    };

    // ----- En-tête commun (titre + sous-titre) sur N colonnes -----
    const buildHead = (ws: ExcelJS.Worksheet, lastCol: number) => {
      const splitA = Math.min(5, lastCol);
      ws.mergeCells(1, 1, 1, splitA);
      ws.mergeCells(1, splitA + 1, 1, lastCol);
      ws.getCell(1, 1).value = titleTxt;
      ws.getCell(1, splitA + 1).value = ref;
      const splitB = Math.min(3, lastCol);
      ws.mergeCells(2, 1, 2, splitB);
      ws.mergeCells(2, splitB + 1, 2, lastCol);
      ws.getCell(2, 1).value = ref;
      ws.getCell(2, splitB + 1).value = recensement;
      for (let c = 1; c <= lastCol; c++) {
        const t = ws.getCell(1, c);
        t.fill = TITLE_FILL;
        t.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
        t.alignment = { vertical: 'middle', horizontal: 'center' };
        const s = ws.getCell(2, c);
        s.fill = SUBTITLE_FILL;
        s.font = { bold: true, size: 11 };
        s.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      ws.getRow(1).height = 24;
      ws.getRow(2).height = 20;
    };

    const styleHeaderCells = (
      ws: ExcelJS.Worksheet,
      r1: number,
      r2: number,
      lastCol: number,
    ) => {
      for (let r = r1; r <= r2; r++) {
        for (let c = 1; c <= lastCol; c++) {
          const cell = ws.getCell(r, c);
          cell.fill = HEADER_FILL;
          cell.font = { bold: true, size: 10 };
          cell.alignment = {
            vertical: 'middle',
            horizontal: 'center',
            wrapText: true,
          };
          cell.border = allBorder;
        }
      }
    };

    /* ===================== Feuille 1 : RECAP-ABONNES ===================== */
    const recap = d.recap;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SOKA';

    const r1 = wb.addWorksheet('RECAP-ABONNES', {
      views: [{ showGridLines: false }],
    });
    r1.columns = [
      { width: 9 },
      { width: 6 },
      { width: 28 },
      { width: 30 },
      { width: 24 },
      { width: 16 },
      { width: 9 },
      { width: 9 },
      { width: 13 },
    ];
    buildHead(r1, 9);
    // Header rows 3-4
    r1.mergeCells('A3:A4');
    r1.getCell('A3').value = 'ZONES';
    r1.mergeCells('B3:B4');
    r1.getCell('B3').value = 'N°';
    r1.mergeCells('C3:C4');
    r1.getCell('C3').value = 'DESTINATIONS\n(CENTRES / VILLES)';
    r1.mergeCells('D3:D4');
    r1.getCell('D3').value = 'VILLE\n(QUARTIER / CHAPITRE)';
    r1.mergeCells('E3:F3');
    r1.getCell('E3').value = 'CORRESPONDANTS DISTRIBUTION';
    r1.getCell('E4').value = 'NOM DU DESTINATAIRE';
    r1.getCell('F4').value = 'PHONE / CONTACTS';
    r1.mergeCells('G3:G4');
    r1.getCell('G3').value = 'NVX ID';
    r1.mergeCells('H3:H4');
    r1.getCell('H3').value = '12 MOIS';
    r1.mergeCells('I3:I4');
    r1.getCell('I3').value = 'TOTAL ABONNES';
    styleHeaderCells(r1, 3, 4, 9);

    let row = 5;
    let seq = 0;
    let zoneIdx = 0;
    let grand = 0;
    for (const g of recap) {
      zoneIdx++;
      const startRow = row;
      for (const z of g.lines) {
        seq++;
        const rr = r1.getRow(row);
        rr.getCell(2).value = seq;
        rr.getCell(3).value = z.zone_name ?? '';
        rr.getCell(4).value = z.villes.join(', ');
        rr.getCell(5).value = g.responsible_name ?? '';
        rr.getCell(6).value = g.responsible_phone ?? '';
        rr.getCell(7).value = null;
        rr.getCell(8).value = z.total;
        rr.getCell(9).value = z.total;
        row++;
      }
      if (row - 1 >= startRow) {
        r1.mergeCells(startRow, 1, row - 1, 1);
        const zc = r1.getCell(startRow, 1);
        zc.value = zoneIdx;
        zc.alignment = { vertical: 'middle', horizontal: 'center' };
        zc.font = { bold: true };
      }
      // sous-total
      const st = r1.getRow(row);
      r1.mergeCells(row, 1, row, 2);
      st.getCell(1).value = `SOUS-TOTAL-${String(zoneIdx).padStart(2, '0')}`;
      st.getCell(3).value = g.responsible_name ?? '';
      st.getCell(6).value = g.responsible_phone ?? '';
      st.getCell(8).value = g.subtotal;
      st.getCell(9).value = g.subtotal;
      for (let c = 1; c <= 9; c++) {
        st.getCell(c).fill = SUBTOTAL_FILL;
        st.getCell(c).font = { bold: true };
      }
      grand += g.subtotal;
      row++;
    }
    // total général
    const gt = r1.getRow(row);
    r1.mergeCells(row, 1, row, 8);
    gt.getCell(1).value = 'TOTAL GÉNÉRAL';
    gt.getCell(9).value = grand;
    for (let c = 1; c <= 9; c++) {
      gt.getCell(c).fill = TOTAL_FILL;
      gt.getCell(c).font = { bold: true, size: 11 };
    }
    gt.getCell(1).alignment = { horizontal: 'right' };
    styleRange(r1, 3, 1, row, 9);

    /* ===================== Feuille 2 : PRINTING LIST ===================== */
    const p = wb.addWorksheet('PRINTING LIST', {
      views: [{ showGridLines: false }],
    });
    p.columns = [
      { width: 9 },
      { width: 6 },
      { width: 30 },
      { width: 32 },
      { width: 26 },
      { width: 16 },
      { width: 13 },
    ];
    buildHead(p, 7);
    p.mergeCells('A3:A4');
    p.getCell('A3').value = 'ZONES';
    p.mergeCells('B3:B4');
    p.getCell('B3').value = 'N°';
    p.mergeCells('C3:C4');
    p.getCell('C3').value = 'DESTINATIONS\n(CENTRES / VILLES)';
    p.mergeCells('D3:D4');
    p.getCell('D3').value = 'VILLE\n(QUARTIER / CHAPITRE)';
    p.mergeCells('E3:F3');
    p.getCell('E3').value = 'CORRESPONDANTS';
    p.getCell('E4').value = 'NOM DU DESTINATAIRE';
    p.getCell('F4').value = 'PHONE / CONTACTS';
    p.mergeCells('G3:G4');
    p.getCell('G3').value = 'TOTAL ABONNES';
    styleHeaderCells(p, 3, 4, 7);

    let prow = 5;
    let pseq = 0;
    let pzone = 0;
    for (const g of recap) {
      pzone++;
      const startRow = prow;
      for (const z of g.lines) {
        pseq++;
        const rr = p.getRow(prow);
        rr.getCell(2).value = pseq;
        rr.getCell(3).value = z.zone_name ?? '';
        rr.getCell(4).value = z.villes.join(', ');
        rr.getCell(5).value = g.responsible_name ?? '';
        rr.getCell(6).value = g.responsible_phone ?? '';
        rr.getCell(7).value = z.total;
        prow++;
      }
      if (prow - 1 >= startRow) {
        p.mergeCells(startRow, 1, prow - 1, 1);
        const zc = p.getCell(startRow, 1);
        zc.value = pzone;
        zc.alignment = { vertical: 'middle', horizontal: 'center' };
        zc.font = { bold: true };
      }
    }
    const pgt = p.getRow(prow);
    p.mergeCells(prow, 1, prow, 6);
    pgt.getCell(1).value = 'TOTAL GÉNÉRAL';
    pgt.getCell(7).value = d.total_need;
    for (let c = 1; c <= 7; c++) {
      pgt.getCell(c).fill = TOTAL_FILL;
      pgt.getCell(c).font = { bold: true, size: 11 };
    }
    pgt.getCell(1).alignment = { horizontal: 'right' };
    styleRange(p, 3, 1, prow, 7);

    /* ====== Feuille 3 : PACKAGES - étiquettes A4 paysage (1 par page) ====== */
    const pk = wb.addWorksheet('PACKAGES', {
      views: [{ showGridLines: false }],
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9, // A4
        fitToPage: false,
        fitToWidth: 0,
        fitToHeight: 0,
        scale: 100,
        horizontalCentered: true,
        margins: {
          left: 0.2,
          right: 0.2,
          top: 0.2,
          bottom: 0.2,
          header: 0.1,
          footer: 0.1,
        },
      },
    });
    pk.columns = [
      { width: 26 },
      { width: 26 },
      { width: 21 },
      { width: 21 },
      { width: 12 },
      { width: 22 },
    ];

    const YELLOW = fill('FFFFFF00');
    const NAVY = 'FF1F3864';
    const RED = 'FFC00000';
    const BLUE = 'FF0070C0';
    const medium = { style: 'medium' as const, color: { argb: NAVY } };
    const center = {
      horizontal: 'center' as const,
      vertical: 'middle' as const,
    };
    // Hauteurs (pt) calibrées : une étiquette remplit une page A4 paysage.
    const H = [50, 34, 96, 84, 42, 134];

    let lr = 1;
    d.packages.forEach((lbl, idx) => {
      // Saut de page avant chaque étiquette sauf la première - placé sur la
      // dernière ligne de l'étiquette précédente (brk « après » cette ligne).
      if (idx > 0) pk.getRow(lr - 1).addPageBreak();
      const top = lr;
      // 1) En-tête : réf | ZONE=x/y | n° de colis
      pk.mergeCells(lr, 1, lr, 3);
      pk.getCell(lr, 1).value = lbl.edition_ref;
      pk.getCell(lr, 1).font = { bold: true, color: { argb: NAVY }, size: 16 };
      pk.getCell(lr, 1).alignment = { vertical: 'middle' };
      pk.mergeCells(lr, 4, lr, 5);
      pk.getCell(lr, 4).value = `ZONE ${lbl.zone_number ?? ''}=${lbl.colis_index}/${lbl.colis_count}`;
      pk.getCell(lr, 4).font = { bold: true, color: { argb: NAVY }, size: 16 };
      pk.getCell(lr, 4).alignment = center;
      pk.getCell(lr, 6).value = lbl.colis_index;
      pk.getCell(lr, 6).font = { bold: true, size: 36 };
      pk.getCell(lr, 6).alignment = center;
      pk.getRow(lr).height = H[0];
      lr++;
      // 2) Bandeau jaune : responsable | TEL | téléphone
      pk.mergeCells(lr, 1, lr, 4);
      pk.getCell(lr, 1).value = lbl.responsible_name ?? '';
      pk.getCell(lr, 5).value = 'TEL';
      pk.getCell(lr, 6).value = lbl.responsible_phone ?? '';
      for (let c = 1; c <= 6; c++) {
        pk.getCell(lr, c).fill = YELLOW;
        pk.getCell(lr, c).font = { bold: true, size: 13 };
        pk.getCell(lr, c).alignment = { vertical: 'middle' };
      }
      pk.getCell(lr, 5).alignment = center;
      pk.getRow(lr).height = H[1];
      lr++;
      // 3) Destination (centre) - noir
      pk.mergeCells(lr, 1, lr, 6);
      pk.getCell(lr, 1).value = lbl.zone_name ?? '';
      pk.getCell(lr, 1).font = { bold: true, size: 36 };
      pk.getCell(lr, 1).alignment = center;
      pk.getRow(lr).height = H[2];
      lr++;
      // 4) Ville / quartier - rouge
      pk.mergeCells(lr, 1, lr, 6);
      pk.getCell(lr, 1).value = lbl.villes.join(', ');
      pk.getCell(lr, 1).font = { bold: true, size: 40, color: { argb: RED } };
      pk.getCell(lr, 1).alignment = center;
      pk.getRow(lr).height = H[3];
      lr++;
      // 5) Région (entre parenthèses)
      pk.mergeCells(lr, 1, lr, 6);
      pk.getCell(lr, 1).value = lbl.region ? `(${lbl.region})` : '';
      pk.getCell(lr, 1).font = { size: 16 };
      pk.getCell(lr, 1).alignment = center;
      pk.getRow(lr).height = H[4];
      lr++;
      // 6) Quantité - bleu géant
      pk.mergeCells(lr, 1, lr, 6);
      pk.getCell(lr, 1).value = `${lbl.quantity}  REVUES`;
      pk.getCell(lr, 1).font = { bold: true, size: 60, color: { argb: BLUE } };
      pk.getCell(lr, 1).alignment = center;
      pk.getRow(lr).height = H[5];
      const bottom = lr;
      lr++;
      // Bordure « médium » autour de l'étiquette
      for (let r = top; r <= bottom; r++) {
        for (let c = 1; c <= 6; c++) {
          const cell = pk.getCell(r, c);
          const b: Partial<ExcelJS.Borders> = { ...(cell.border ?? {}) };
          if (r === top) b.top = medium;
          if (r === bottom) b.bottom = medium;
          if (c === 1) b.left = medium;
          if (c === 6) b.right = medium;
          cell.border = b;
        }
      }
    });

    const out = await wb.xlsx.writeBuffer();
    const buffer = Buffer.from(out as ArrayBuffer);
    const filename = `impression_${ref.replace(/[^\w-]+/g, '_')}.xlsx`;
    return { buffer, filename };
  }

  /**
   * Recherche de membres dédiée au journal (responsable de zone / correspondant).
   * Filtre sur nom, prénom, matricule ou téléphone. Requête mono-table (members)
   * → insensible aux collations. Priorise les membres réellement nommés.
   */
  async searchMembers(q: string) {
    const term = (q ?? '').trim();
    const qb = this.memberRepo
      .createQueryBuilder('m')
      .select([
        'm.uuid',
        'm.firstname',
        'm.lastname',
        'm.matricule',
        'm.phone',
        'm.phone_whatsapp',
      ])
      // les membres nommés d'abord, puis tri alphabétique
      .orderBy(
        "CASE WHEN TRIM(COALESCE(m.lastname, '')) <> '' OR TRIM(COALESCE(m.firstname, '')) <> '' THEN 0 ELSE 1 END",
        'ASC',
      )
      .addOrderBy('m.lastname', 'ASC')
      .addOrderBy('m.firstname', 'ASC')
      .take(20);

    if (term) {
      qb.where(
        '(m.firstname LIKE :s OR m.lastname LIKE :s OR m.matricule LIKE :s OR m.phone LIKE :s)',
        { s: `%${term}%` },
      );
    }

    const rows = await qb.getMany();
    return rows.map((m) => ({
      uuid: m.uuid,
      firstname: m.firstname ?? '',
      lastname: m.lastname ?? '',
      matricule: m.matricule ?? '',
      phone: m.phone ?? '',
      phone_whatsapp: m.phone_whatsapp ?? '',
    }));
  }
}

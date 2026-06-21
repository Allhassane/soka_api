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
import { JournalDestinationEntity } from './entities/journal-destination.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import {
  AckDeliveryDto,
  DistributeEditionDto,
} from './dto/distribute-edition.dto';
import { NotificationService } from './notifications/notification.service';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

const DEFAULT_TEMPLATE =
  'Bonjour {correspondent}, le journal "{edition}" est prêt. Veuillez retirer votre colis ({quantity} ex.) et confirmer la distribution avant le {deadline}.';

@Injectable()
export class JournalDistributionService {
  constructor(
    @InjectRepository(JournalDistributionEntity)
    private readonly distribRepo: Repository<JournalDistributionEntity>,
    @InjectRepository(JournalEditionEntity)
    private readonly editionRepo: Repository<JournalEditionEntity>,
    @InjectRepository(JournalDestinationEntity)
    private readonly destRepo: Repository<JournalDestinationEntity>,
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

  private pickPhone(
    dest: JournalDestinationEntity,
    channel: NotificationChannel,
  ): string {
    if (channel === NotificationChannel.WHATSAPP) {
      return (
        dest.correspondent_phone_whatsapp ||
        dest.correspondent?.phone_whatsapp ||
        dest.correspondent_phone ||
        dest.correspondent?.phone ||
        ''
      );
    }
    return (
      dest.correspondent_phone ||
      dest.correspondent?.phone ||
      dest.correspondent_phone_whatsapp ||
      dest.correspondent?.phone_whatsapp ||
      ''
    );
  }

  /**
   * Lance la distribution d'une édition :
   *  - crée 1 JournalDistributionEntity par destination retenue (idempotent)
   *  - envoie l'alerte SMS/WhatsApp au correspondant
   *  - passe l'édition en STARTED
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

    let destinations: JournalDestinationEntity[];
    if (payload.destination_uuids?.length) {
      destinations = await this.destRepo.find({
        where: { uuid: In(payload.destination_uuids) },
        relations: ['correspondent'],
      });
      if (destinations.length !== payload.destination_uuids.length) {
        throw new BadRequestException(
          'Une ou plusieurs destinations sont introuvables.',
        );
      }
    } else {
      destinations = await this.destRepo.find({
        where: { status: GlobalStatus.STARTED },
        relations: ['correspondent'],
      });
    }

    if (!destinations.length) {
      throw new BadRequestException('Aucune destination à servir.');
    }

    const deadlineStr = edition.distribution_deadline_at
      .toISOString()
      .substring(0, 10);

    const results: any[] = [];

    for (const dest of destinations) {
      // Idempotence : 1 ligne distribution par (édition, destination)
      let distrib = await this.distribRepo.findOne({
        where: {
          edition_uuid: edition.uuid,
          destination_uuid: dest.uuid,
        },
      });

      if (!distrib) {
        distrib = this.distribRepo.create({
          edition_uuid: edition.uuid,
          destination_uuid: dest.uuid,
          expected_quantity: dest.total_abonnes ?? 0,
          channel,
          admin_uuid,
          status: JournalDistributionStatus.PENDING,
        });
      } else {
        distrib.channel = channel;
      }

      const correspondentName =
        dest.correspondent
          ? `${dest.correspondent.firstname} ${dest.correspondent.lastname}`
          : 'Correspondant';

      const message = this.renderMessage(template, {
        correspondent: correspondentName,
        edition: `${edition.title} N°${edition.number} - ${edition.month}/${edition.year}`,
        quantity: dest.total_abonnes ?? 0,
        deadline: deadlineStr,
      });

      const phone = this.pickPhone(dest, channel);

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

      const entry = {
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
      results.push({
        destination_uuid: dest.uuid,
        destination_name: dest.name,
        phone,
        success: sendResult.success,
        distribution_uuid: saved.uuid,
        provider_message_id: sendResult.provider_message_id,
        error: sendResult.error,
      });
    }

    // L'édition passe en STARTED si elle ne l'est pas déjà
    if (edition.status !== GlobalStatus.STARTED) {
      edition.status = GlobalStatus.STARTED;
      await this.editionRepo.save(edition);
    }

    await this.logService.logAction(
      'journal-edition-distribute',
      admin.id,
      `Distribution lancée pour "${edition.title} N°${edition.number}" -> ${results.length} destinations (${results.filter((r) => r.success).length} OK).`,
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
      relations: ['destination', 'destination.zone'],
      order: { created_at: 'ASC' },
    });

    const now = new Date();
    const deadline = new Date(edition.distribution_deadline_at);
    for (const d of distribs) {
      if (
        d.status !== JournalDistributionStatus.DELIVERED &&
        d.status !== JournalDistributionStatus.CANCELED &&
        now > deadline
      ) {
        d.status = JournalDistributionStatus.LATE;
      }
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
      relations: ['edition', 'destination'],
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
  async sweepLateAndRemind(admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const now = new Date();

    const distribs = await this.distribRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.edition', 'e')
      .leftJoinAndSelect('d.destination', 'dest')
      .leftJoinAndSelect('dest.correspondent', 'm')
      .where('d.status NOT IN (:...done)', {
        done: [
          JournalDistributionStatus.DELIVERED,
          JournalDistributionStatus.CANCELED,
        ],
      })
      .getMany();

    let lateCount = 0;
    let remindCount = 0;

    for (const d of distribs) {
      const deadline = new Date(d.edition.distribution_deadline_at);
      const start = new Date(d.edition.distribution_start_at);
      const oneDayAfterStart = new Date(start);
      oneDayAfterStart.setDate(oneDayAfterStart.getDate() + 1);

      // Au-delà de la deadline → late
      if (now > deadline) {
        d.status = JournalDistributionStatus.LATE;
        await this.distribRepo.save(d);
        lateCount++;
        continue;
      }

      // Entre J+1 et la deadline, on relance si la 1re alerte a réussi sans confirmation
      if (
        now >= oneDayAfterStart &&
        d.retry_count < 2 &&
        d.status === JournalDistributionStatus.NOTIFIED
      ) {
        const phone = this.pickPhone(
          d.destination,
          d.channel ?? NotificationChannel.SMS,
        );
        const correspondentName = d.destination?.correspondent
          ? `${d.destination.correspondent.firstname} ${d.destination.correspondent.lastname}`
          : 'Correspondant';
        const message =
          `Rappel : la distribution de "${d.edition.title} N°${d.edition.number}" doit être achevée au plus tard le ` +
          deadline.toISOString().substring(0, 10) +
          `. Merci ${correspondentName}.`;

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
      admin.id,
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
      relations: ['destination', 'destination.zone'],
    });

    const total = items.length;
    const delivered = items.filter(
      (d) => d.status === JournalDistributionStatus.DELIVERED,
    ).length;
    const late = items.filter(
      (d) => d.status === JournalDistributionStatus.LATE,
    ).length;
    const notified = items.filter(
      (d) =>
        d.status === JournalDistributionStatus.NOTIFIED ||
        d.status === JournalDistributionStatus.IN_PROGRESS,
    ).length;
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
      const zoneName = d.destination?.zone?.name ?? 'N/A';
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
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalEditionEntity } from './entities/journal-edition.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { CreateJournalEditionDto } from './dto/create-journal-edition.dto';
import { UpdateJournalEditionDto } from './dto/update-journal-edition.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import { PaginateMeta } from 'src/shared/interfaces/paginate-meta.interface';

/**
 * Règle métier : le délai maximum de distribution d'une édition est de 2 jours
 * à compter de distribution_start_at. distribution_deadline_at est donc calculée
 * automatiquement à start + 2 jours.
 */
export const DISTRIBUTION_MAX_DAYS = 2;

@Injectable()
export class JournalEditionService {
  constructor(
    @InjectRepository(JournalEditionEntity)
    private readonly editionRepo: Repository<JournalEditionEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly logService: LogActivitiesService,
  ) {}

  private async getAdmin(uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    return admin;
  }

  private computeDeadline(start: Date): Date {
    const d = new Date(start);
    d.setDate(d.getDate() + DISTRIBUTION_MAX_DAYS);
    return d;
  }

  async findAll(
    admin_uuid: string,
    page = 1,
    limit = 10,
  ): Promise<{ data: JournalEditionEntity[]; meta: Omit<PaginateMeta, 'page'> }> {
    const admin = await this.getAdmin(admin_uuid);
    const [data, total] = await this.editionRepo
      .createQueryBuilder('edition')
      .leftJoinAndSelect('edition.subscription', 'subscription')
      .orderBy('edition.year', 'DESC')
      .addOrderBy('edition.month', 'DESC')
      .addOrderBy('edition.number', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    await this.logService.logAction(
      'journal-editions-findAll',
      admin.id,
      'Récupération de la liste des éditions du journal',
    );
    return {
      data,
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
  }

  async findOne(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({
      where: { uuid },
      relations: ['subscription'],
    });
    if (!edition) {
      throw new NotFoundException('Aucune édition trouvée');
    }
    await this.logService.logAction(
      'journal-editions-findOne',
      admin.id,
      `Consultation de l'édition "${edition.title} N°${edition.number}"`,
    );
    return edition;
  }

  async store(payload: CreateJournalEditionDto, admin_uuid: string) {
    if (
      !payload?.title ||
      !payload?.number ||
      !payload?.month ||
      !payload?.year ||
      !payload?.distribution_start_at
    ) {
      throw new BadRequestException(
        'Veuillez renseigner tous les champs obligatoires.',
      );
    }
    const admin = await this.getAdmin(admin_uuid);

    if (payload.subscription_uuid) {
      const sub = await this.subscriptionRepo.findOne({
        where: { uuid: payload.subscription_uuid },
      });
      if (!sub) throw new NotFoundException('Campagne d’abonnement introuvable');
    }

    const start = new Date(payload.distribution_start_at);
    const deadline = this.computeDeadline(start);

    const history = {
      action: 'Création d’une édition',
      table_action: 'journal-edition-store',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: payload,
      admin_uuid,
      performed_at: new Date(),
    };

    const edition = this.editionRepo.create({
      ...payload,
      distribution_start_at: start,
      distribution_deadline_at: deadline,
      admin_uuid,
      status: GlobalStatus.CREATED,
      history: JSON.stringify([history]),
    });
    const saved = await this.editionRepo.save(edition);
    await this.logService.logAction(
      'journal-edition-store',
      admin.id,
      `Création de l'édition "${saved.title} N°${saved.number}" (deadline ${deadline.toISOString()})`,
    );
    return saved;
  }

  async update(
    uuid: string,
    payload: UpdateJournalEditionDto,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({ where: { uuid } });
    if (!edition) throw new NotFoundException('Édition introuvable');

    Object.assign(edition, { ...payload, admin_uuid, updated_at: new Date() });
    if (payload.distribution_start_at) {
      const start = new Date(payload.distribution_start_at);
      edition.distribution_start_at = start;
      edition.distribution_deadline_at = this.computeDeadline(start);
    }

    const entry = {
      action: 'Mise à jour d’une édition',
      table_action: 'journal-edition-update',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: payload,
      admin_uuid,
      performed_at: new Date(),
    };
    let arr: any[] = [];
    if (edition.history) {
      try {
        arr = JSON.parse(edition.history);
        if (!Array.isArray(arr)) arr = [arr];
      } catch {
        arr = [];
      }
    }
    arr.push(entry);
    edition.history = JSON.stringify(arr);

    const updated = await this.editionRepo.save(edition);
    await this.logService.logAction(
      'journal-edition-update',
      admin.id,
      `Mise à jour de l'édition "${updated.title} N°${updated.number}"`,
    );
    return updated;
  }

  async changeStatus(uuid: string, status: GlobalStatus, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({ where: { uuid } });
    if (!edition) throw new NotFoundException('Édition introuvable');

    const allowed = Object.values(GlobalStatus);
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Statut invalide. Valeurs autorisées : ${allowed.join(', ')}`,
      );
    }

    edition.status = status;
    edition.updated_at = new Date();

    const entry = {
      action: `Changement de statut en "${status}"`,
      table_action: 'journal-edition-status-change',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      admin_uuid,
      performed_at: new Date(),
    };
    let arr: any[] = [];
    if (edition.history) {
      try {
        arr = JSON.parse(edition.history);
        if (!Array.isArray(arr)) arr = [arr];
      } catch {
        arr = [];
      }
    }
    arr.push(entry);
    edition.history = JSON.stringify(arr);

    const updated = await this.editionRepo.save(edition);
    await this.logService.logAction(
      'journal-edition-status-change',
      admin.id,
      `Statut édition "${updated.title} N°${updated.number}" -> ${status}`,
    );
    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({ where: { uuid } });
    if (!edition) throw new NotFoundException('Édition introuvable');
    await this.logService.logAction(
      'journal-edition-delete',
      admin.id,
      `Suppression de l'édition "${edition.title} N°${edition.number}"`,
    );
    return await this.editionRepo.softRemove(edition);
  }
}

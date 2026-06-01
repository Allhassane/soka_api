import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalZoneEntity } from './entities/journal-zone.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { CreateJournalZoneDto } from './dto/create-journal-zone.dto';
import { UpdateJournalZoneDto } from './dto/update-journal-zone.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import { PaginateMeta } from 'src/shared/interfaces/paginate-meta.interface';

@Injectable()
export class JournalZoneService {
  constructor(
    @InjectRepository(JournalZoneEntity)
    private readonly zoneRepo: Repository<JournalZoneEntity>,
    private readonly logService: LogActivitiesService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private async getAdmin(admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    return admin;
  }

  async findAll(
    admin_uuid: string,
    page = 1,
    limit = 10,
  ): Promise<{ data: JournalZoneEntity[]; meta: Omit<PaginateMeta, 'page'> }> {
    const admin = await this.getAdmin(admin_uuid);
    const [data, total] = await this.zoneRepo
      .createQueryBuilder('zone')
      .leftJoinAndSelect('zone.destinations', 'destinations')
      .orderBy('zone.number', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    await this.logService.logAction(
      'journal-zones-findAll',
      admin.id,
      'Récupération de la liste des zones du journal',
    );
    return {
      data,
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
  }

  async findOne(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const zone = await this.zoneRepo.findOne({
      where: { uuid },
      relations: ['destinations'],
    });
    if (!zone) {
      throw new NotFoundException('Aucune zone trouvée');
    }
    await this.logService.logAction(
      'journal-zones-findOne',
      admin.id,
      `Consultation de la zone "${zone.name}"`,
    );
    return zone;
  }

  async store(payload: CreateJournalZoneDto, admin_uuid: string) {
    if (!payload?.name || !payload?.number) {
      throw new BadRequestException(
        'Veuillez renseigner tous les champs obligatoires.',
      );
    }
    const admin = await this.getAdmin(admin_uuid);

    const history = {
      action: 'Création d’une zone de journal',
      table_action: 'journal-zone-store',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: payload,
      admin_uuid,
      performed_at: new Date(),
    };

    const zone = this.zoneRepo.create({
      ...payload,
      admin_uuid,
      status: GlobalStatus.STARTED,
      history: JSON.stringify([history]),
    });
    const saved = await this.zoneRepo.save(zone);

    await this.logService.logAction(
      'journal-zone-store',
      admin.id,
      `Création de la zone "${saved.name}" par ${admin.firstname} ${admin.lastname}`,
    );

    return saved;
  }

  async update(uuid: string, payload: UpdateJournalZoneDto, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const zone = await this.zoneRepo.findOne({ where: { uuid } });
    if (!zone) {
      throw new NotFoundException('Zone introuvable');
    }

    Object.assign(zone, { ...payload, admin_uuid, updated_at: new Date() });

    const entry = {
      action: 'Mise à jour d’une zone',
      table_action: 'journal-zone-update',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: payload,
      admin_uuid,
      performed_at: new Date(),
    };
    let arr: any[] = [];
    if (zone.history) {
      try {
        arr = JSON.parse(zone.history);
        if (!Array.isArray(arr)) arr = [arr];
      } catch {
        arr = [];
      }
    }
    arr.push(entry);
    zone.history = JSON.stringify(arr);

    const updated = await this.zoneRepo.save(zone);
    await this.logService.logAction(
      'journal-zone-update',
      admin.id,
      `Mise à jour de la zone "${updated.name}"`,
    );
    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const zone = await this.zoneRepo.findOne({ where: { uuid } });
    if (!zone) {
      throw new NotFoundException('Aucune zone trouvée');
    }
    await this.logService.logAction(
      'journal-zone-delete',
      admin.id,
      `Suppression de la zone "${zone.name}" par ${admin.firstname} ${admin.lastname}`,
    );
    return await this.zoneRepo.softRemove(zone);
  }
}

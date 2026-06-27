import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalDestinationEntity } from './entities/journal-destination.entity';
import { JournalZoneEntity } from './entities/journal-zone.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { CreateJournalDestinationDto } from './dto/create-journal-destination.dto';
import { UpdateJournalDestinationDto } from './dto/update-journal-destination.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import { PaginateMeta } from 'src/shared/interfaces/paginate-meta.interface';

@Injectable()
export class JournalDestinationService {
  constructor(
    @InjectRepository(JournalDestinationEntity)
    private readonly destRepo: Repository<JournalDestinationEntity>,
    @InjectRepository(JournalZoneEntity)
    private readonly zoneRepo: Repository<JournalZoneEntity>,
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,
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

  async findAll(
    admin_uuid: string,
    page = 1,
    limit = 10,
    zone_uuid?: string,
    search?: string,
  ): Promise<{ data: JournalDestinationEntity[]; meta: Omit<PaginateMeta, 'page'> }> {
    const admin = await this.getAdmin(admin_uuid);
    const qb = this.destRepo
      .createQueryBuilder('destination')
      .leftJoinAndSelect('destination.zone', 'zone')
      .leftJoinAndSelect('destination.correspondent', 'correspondent')
      .orderBy('destination.name', 'ASC');

    if (zone_uuid) {
      qb.andWhere('destination.zone_uuid = :zone_uuid', { zone_uuid });
    }

    if (search?.trim()) {
      qb.andWhere(
        '(destination.name LIKE :s OR destination.ville LIKE :s OR destination.quartier LIKE :s)',
        { s: `%${search.trim()}%` },
      );
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.logService.logAction(
      'journal-destinations-findAll',
      admin.id,
      `Récupération des destinations${zone_uuid ? ` (zone=${zone_uuid})` : ''}`,
    );
    return {
      data,
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
  }

  async findOne(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const dest = await this.destRepo.findOne({
      where: { uuid },
      relations: ['zone', 'correspondent'],
    });
    if (!dest) {
      throw new NotFoundException('Aucune destination trouvée');
    }
    await this.logService.logAction(
      'journal-destinations-findOne',
      admin.id,
      `Consultation de la destination "${dest.name}"`,
    );
    return dest;
  }

  async store(payload: CreateJournalDestinationDto, admin_uuid: string) {
    if (!payload?.name || !payload?.zone_uuid) {
      throw new BadRequestException(
        'Veuillez renseigner tous les champs obligatoires.',
      );
    }
    const admin = await this.getAdmin(admin_uuid);
    const zone = await this.zoneRepo.findOne({
      where: { uuid: payload.zone_uuid },
    });
    if (!zone) throw new NotFoundException('Zone introuvable');

    // Hydrater les téléphones depuis le membre s'ils ne sont pas fournis
    let correspondent_phone = payload.correspondent_phone;
    let correspondent_phone_whatsapp = payload.correspondent_phone_whatsapp;
    if (payload.correspondent_member_uuid) {
      const member = await this.memberRepo.findOne({
        where: { uuid: payload.correspondent_member_uuid },
      });
      if (!member) throw new NotFoundException('Membre correspondant introuvable');
      correspondent_phone = correspondent_phone ?? member.phone;
      correspondent_phone_whatsapp =
        correspondent_phone_whatsapp ?? member.phone_whatsapp;
    }

    const history = {
      action: 'Création d’une destination de journal',
      table_action: 'journal-destination-store',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: payload,
      admin_uuid,
      performed_at: new Date(),
    };

    const dest = this.destRepo.create({
      ...payload,
      correspondent_phone,
      correspondent_phone_whatsapp,
      admin_uuid,
      status: GlobalStatus.STARTED,
      history: JSON.stringify([history]),
    });

    const saved = await this.destRepo.save(dest);
    await this.logService.logAction(
      'journal-destination-store',
      admin.id,
      `Création de la destination "${saved.name}" par ${admin.firstname} ${admin.lastname}`,
    );
    return saved;
  }

  async update(
    uuid: string,
    payload: UpdateJournalDestinationDto,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const dest = await this.destRepo.findOne({ where: { uuid } });
    if (!dest) throw new NotFoundException('Destination introuvable');

    Object.assign(dest, { ...payload, admin_uuid, updated_at: new Date() });

    const entry = {
      action: 'Mise à jour d’une destination',
      table_action: 'journal-destination-update',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: payload,
      admin_uuid,
      performed_at: new Date(),
    };
    let arr: any[] = [];
    if (dest.history) {
      try {
        arr = JSON.parse(dest.history);
        if (!Array.isArray(arr)) arr = [arr];
      } catch {
        arr = [];
      }
    }
    arr.push(entry);
    dest.history = JSON.stringify(arr);

    const updated = await this.destRepo.save(dest);
    await this.logService.logAction(
      'journal-destination-update',
      admin.id,
      `Mise à jour de la destination "${updated.name}"`,
    );
    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const dest = await this.destRepo.findOne({ where: { uuid } });
    if (!dest) throw new NotFoundException('Aucune destination trouvée');
    await this.logService.logAction(
      'journal-destination-delete',
      admin.id,
      `Suppression de la destination "${dest.name}" par ${admin.firstname} ${admin.lastname}`,
    );
    return await this.destRepo.softRemove(dest);
  }
}

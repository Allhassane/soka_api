import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JournalZoneEntity } from './entities/journal-zone.entity';
import { JournalZoneCityEntity } from './entities/journal-zone-city.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { CityEntity } from 'src/cities/entities/city.entity';
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
    @InjectRepository(JournalZoneCityEntity)
    private readonly zoneCityRepo: Repository<JournalZoneCityEntity>,
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,
    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,
    @InjectRepository(CityEntity)
    private readonly cityRepo: Repository<CityEntity>,
    private readonly logService: LogActivitiesService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Hydrate les téléphones du responsable depuis le membre choisi s'ils ne
   * sont pas fournis explicitement (même logique que le correspondant d'une
   * destination). Renvoie les valeurs éventuellement complétées.
   */
  private async resolveResponsiblePhones(payload: {
    responsible_member_uuid?: string | null;
    responsible_phone?: string | null;
    responsible_phone_whatsapp?: string | null;
  }) {
    let responsible_phone = payload.responsible_phone ?? null;
    let responsible_phone_whatsapp = payload.responsible_phone_whatsapp ?? null;
    if (payload.responsible_member_uuid) {
      const member = await this.memberRepo.findOne({
        where: { uuid: payload.responsible_member_uuid },
      });
      if (!member) {
        throw new NotFoundException('Membre responsable introuvable');
      }
      responsible_phone = responsible_phone ?? member.phone ?? null;
      responsible_phone_whatsapp =
        responsible_phone_whatsapp ?? member.phone_whatsapp ?? null;
    }
    return { responsible_phone, responsible_phone_whatsapp };
  }

  private async getAdmin(admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    return admin;
  }

  /**
   * Remplace l'ensemble des villes rattachées à une zone par la liste fournie.
   * (suppression des liens existants puis recréation — idempotent)
   */
  private async syncZoneCities(
    zone_uuid: string,
    city_uuids: string[] | undefined,
    admin_uuid: string,
  ) {
    if (!city_uuids) return; // non fourni => on ne touche pas aux liens
    await this.zoneCityRepo.delete({ zone_uuid });
    const unique = Array.from(new Set(city_uuids.filter(Boolean)));
    if (unique.length === 0) return;
    const rows = unique.map((city_uuid) =>
      this.zoneCityRepo.create({ zone_uuid, city_uuid, admin_uuid }),
    );
    await this.zoneCityRepo.save(rows);
  }

  /**
   * Mappe une zone (avec zoneCities chargées) vers la forme renvoyée au front.
   * On expose uniquement les UUIDs des villes (le front résout les libellés via
   * son référentiel cities) — évite tout JOIN inter-tables sensible aux collations.
   */
  private mapZone(
    zone: JournalZoneEntity,
    structure_name: string | null = null,
  ) {
    const zoneCities = zone.zoneCities ?? [];
    return {
      ...zone,
      city_uuids: zoneCities.map((zc) => zc.city_uuid),
      structure_name: structure_name ?? zone.structure?.name ?? null,
      responsible_member_name: zone.responsible
        ? `${zone.responsible.lastname ?? ''} ${zone.responsible.firstname ?? ''}`.trim()
        : null,
    };
  }

  /**
   * Résout le nom de la « région » d'une zone, sans JOIN (collation-safe).
   * La région peut référencer une STRUCTURE (pyramide) OU une VILLE (cities) —
   * liste unifiée côté front. On cherche donc dans les deux référentiels.
   */
  private async resolveStructureName(
    structure_uuid: string | null | undefined,
  ): Promise<string | null> {
    if (!structure_uuid) return null;
    const s = await this.structureRepo.findOne({
      where: { uuid: structure_uuid },
    });
    if (s?.name) return s.name;
    const c = await this.cityRepo.findOne({ where: { uuid: structure_uuid } });
    return c?.name ?? null;
  }

  async findAll(
    admin_uuid: string,
    page = 1,
    limit = 10,
  ): Promise<{ data: any[]; meta: Omit<PaginateMeta, 'page'> }> {
    const admin = await this.getAdmin(admin_uuid);
    // ⚠ NE PAS joindre `zone.responsible` (members) : journal_zones est en
    // utf8mb4 et members en latin1 → "Illegal mix of collations" (500).
    // On hydrate le responsable séparément par requête In(...) (collation-safe).
    const [data, total] = await this.zoneRepo
      .createQueryBuilder('zone')
      .leftJoinAndSelect('zone.zoneCities', 'zoneCities')
      .orderBy('zone.number', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    await this.logService.logAction(
      'journal-zones-findAll',
      admin.id,
      'Récupération de la liste des zones du journal',
    );

    // Hydratation des membres responsables — sans JOIN (collation-safe).
    const respUuids = Array.from(
      new Set(
        data.map((z) => z.responsible_member_uuid).filter(Boolean) as string[],
      ),
    );
    if (respUuids.length) {
      const members = await this.memberRepo.find({
        where: { uuid: In(respUuids) },
      });
      const memberMap = new Map(members.map((m) => [m.uuid, m]));
      for (const z of data) {
        if (z.responsible_member_uuid) {
          z.responsible = memberMap.get(z.responsible_member_uuid) ?? null;
        }
      }
    }

    // Résolution par lot des noms de « région » (structure OU ville) — sans JOIN.
    const regionUuids = Array.from(
      new Set(data.map((z) => z.structure_uuid).filter(Boolean) as string[]),
    );
    const nameMap = new Map<string, string>();
    if (regionUuids.length) {
      const structs = await this.structureRepo.find({
        where: { uuid: In(regionUuids) },
      });
      for (const s of structs) nameMap.set(s.uuid, s.name);
      const missing = regionUuids.filter((u) => !nameMap.has(u));
      if (missing.length) {
        const cities = await this.cityRepo.find({ where: { uuid: In(missing) } });
        for (const c of cities) nameMap.set(c.uuid, c.name);
      }
    }

    return {
      data: data.map((z) =>
        this.mapZone(z, nameMap.get(z.structure_uuid ?? '') ?? null),
      ),
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
  }

  async findOne(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const zone = await this.zoneRepo.findOne({
      where: { uuid },
      relations: ['destinations', 'zoneCities'],
    });
    if (!zone) {
      throw new NotFoundException('Aucune zone trouvée');
    }
    // Hydratation du responsable sans JOIN (members en latin1 → collation-safe).
    if (zone.responsible_member_uuid) {
      zone.responsible = await this.memberRepo.findOne({
        where: { uuid: zone.responsible_member_uuid },
      });
    }
    await this.logService.logAction(
      'journal-zones-findOne',
      admin.id,
      `Consultation de la zone "${zone.name}"`,
    );
    const structure_name = await this.resolveStructureName(zone.structure_uuid);
    return this.mapZone(zone, structure_name);
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

    const { city_uuids, ...zonePayload } = payload;
    const { responsible_phone, responsible_phone_whatsapp } =
      await this.resolveResponsiblePhones(zonePayload);
    const zone = this.zoneRepo.create({
      ...zonePayload,
      responsible_phone,
      responsible_phone_whatsapp,
      admin_uuid,
      status: GlobalStatus.STARTED,
      history: JSON.stringify([history]),
    });
    const saved = await this.zoneRepo.save(zone);
    await this.syncZoneCities(saved.uuid, city_uuids, admin_uuid);

    await this.logService.logAction(
      'journal-zone-store',
      admin.id,
      `Création de la zone "${saved.name}" par ${admin.firstname} ${admin.lastname}`,
    );

    saved.zoneCities = await this.zoneCityRepo.find({
      where: { zone_uuid: saved.uuid },
    });
    if (saved.responsible_member_uuid) {
      saved.responsible = await this.memberRepo.findOne({
        where: { uuid: saved.responsible_member_uuid },
      });
    }
    const structure_name = await this.resolveStructureName(saved.structure_uuid);
    return this.mapZone(saved, structure_name);
  }

  async update(uuid: string, payload: UpdateJournalZoneDto, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const zone = await this.zoneRepo.findOne({ where: { uuid } });
    if (!zone) {
      throw new NotFoundException('Zone introuvable');
    }

    const { city_uuids, ...zonePayload } = payload;
    // Hydrate le téléphone du responsable depuis le membre (re)sélectionné,
    // sans jamais écraser une valeur déjà saisie.
    if (zonePayload.responsible_member_uuid) {
      const hydrated = await this.resolveResponsiblePhones(zonePayload);
      if (zonePayload.responsible_phone == null && hydrated.responsible_phone != null) {
        zonePayload.responsible_phone = hydrated.responsible_phone;
      }
      if (
        zonePayload.responsible_phone_whatsapp == null &&
        hydrated.responsible_phone_whatsapp != null
      ) {
        zonePayload.responsible_phone_whatsapp = hydrated.responsible_phone_whatsapp;
      }
    }
    Object.assign(zone, { ...zonePayload, admin_uuid, updated_at: new Date() });

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
    await this.syncZoneCities(updated.uuid, city_uuids, admin_uuid);
    await this.logService.logAction(
      'journal-zone-update',
      admin.id,
      `Mise à jour de la zone "${updated.name}"`,
    );

    updated.zoneCities = await this.zoneCityRepo.find({
      where: { zone_uuid: updated.uuid },
    });
    if (updated.responsible_member_uuid) {
      updated.responsible = await this.memberRepo.findOne({
        where: { uuid: updated.responsible_member_uuid },
      });
    }
    const structure_name = await this.resolveStructureName(updated.structure_uuid);
    return this.mapZone(updated, structure_name);
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

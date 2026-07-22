import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommitteesEntity } from './entities/committees.entity';
import { CommitteeMemberEntity } from './entities/committee-member.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { MemberEntity } from '../members/entities/member.entity';

/** Forme légère d'un membre exposée par l'API comité. */
export interface CommitteeMemberView {
  uuid: string;
  firstname: string;
  lastname: string;
  picture: string | null;
  matricule: string | null;
  phone: string | null;
  phone_whatsapp: string | null;
  email: string | null;
}

@Injectable()
export class CommitteeService {
  constructor(
    @InjectRepository(CommitteesEntity)
    private readonly committeesRepo: Repository<CommitteesEntity>,
    @InjectRepository(CommitteeMemberEntity)
    private readonly committeeMembersRepo: Repository<CommitteeMemberEntity>,
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,
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

  private mapMember(member?: MemberEntity | null): CommitteeMemberView | null {
    if (!member) return null;
    return {
      uuid: member.uuid,
      firstname: member.firstname,
      lastname: member.lastname,
      picture: member.picture ?? null,
      matricule: member.matricule ?? null,
      phone: member.phone ?? null,
      phone_whatsapp: member.phone_whatsapp ?? null,
      email: member.email ?? null,
    };
  }

  /** Vrai si l'utilisateur connecté peut gérer les membres de ce comité. */
  private canManage(
    committee: CommitteesEntity,
    user: { member_uuid?: string | null; is_admin?: boolean },
  ): boolean {
    if (user?.is_admin) return true;
    return (
      !!user?.member_uuid &&
      committee.responsible_member_uuid === user.member_uuid
    );
  }

  async findAll(admin_uuid: string) {
    const committees = await this.committeesRepo.find({
      order: { name: 'ASC' },
    });

    const admin = await this.getAdmin(admin_uuid);

    // Charge les responsables désignés (1 requête) + compte des membres.
    const responsibleUuids = committees
      .map((c) => c.responsible_member_uuid)
      .filter((u): u is string => !!u);

    const responsibleMembers = responsibleUuids.length
      ? await this.memberRepo.find({
          where: responsibleUuids.map((uuid) => ({ uuid })),
        })
      : [];
    const responsibleByUuid = new Map(
      responsibleMembers.map((m) => [m.uuid, m]),
    );

    const enriched = await Promise.all(
      committees.map(async (c) => ({
        ...c,
        responsible: this.mapMember(
          c.responsible_member_uuid
            ? responsibleByUuid.get(c.responsible_member_uuid)
            : null,
        ),
        members_count: await this.committeeMembersRepo.count({
          where: { committee_uuid: c.uuid },
        }),
      })),
    );

    await this.logService.logAction(
      'committees-findAll',
      admin.id,
      'recupération de la liste de tous les comités',
    );

    return enriched;
  }

  async store(payload: any, admin_uuid) {
    if (!payload?.name) {
      throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const admin = await this.getAdmin(admin_uuid);

    const newCommittees = this.committeesRepo.create({
      name: payload.name,
      description: payload.description ?? null,
      admin_uuid: admin_uuid ?? null,
    });

    await this.logService.logAction(
      'committees-store',
      admin.id,
      'Enregistrer du comité',
    );

    const saved = await this.committeesRepo.save(newCommittees);

    return saved;
  }

  async findOne(uuid: string, admin_uuid) {
    const committee = await this.committeesRepo.findOne({ where: { uuid } });

    if (!committee) {
      throw new NotFoundException('Aucun comité trouvé');
    }
    const admin = await this.getAdmin(admin_uuid);

    const responsible = committee.responsible_member_uuid
      ? await this.memberRepo.findOne({
          where: { uuid: committee.responsible_member_uuid },
        })
      : null;

    await this.logService.logAction(
      'committees-findOne',
      admin.id,
      'Recupérer un comité',
    );

    return { ...committee, responsible: this.mapMember(responsible) };
  }

  async update(uuid: string, payload: any, admin_uuid: string) {
    const { name } = payload;

    if (!uuid || !name || !admin_uuid) {
      throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const admin = await this.getAdmin(admin_uuid);

    const existing = await this.committeesRepo.findOne({ where: { uuid } });
    if (!existing) {
      throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;
    if (payload.description !== undefined) {
      existing.description = payload.description ?? null;
    }

    const updated = await this.committeesRepo.save(existing);

    await this.logService.logAction('committees-update', admin.id, updated);

    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const committe = await this.committeesRepo.findOne({ where: { uuid } });

    if (!committe) {
      throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.getAdmin(admin_uuid);

    await this.logService.logAction(
      'committees-delete',
      admin.id,
      'Suppression du comité  ' + committe.name + ' pour uuid' + committe.uuid,
    );

    return await this.committeesRepo.softRemove(committe);
  }

  // ---- RESPONSABLE ----

  /** Désigne (ou retire avec member_uuid=null) le responsable d'un comité. Admin uniquement. */
  async assignResponsible(
    uuid: string,
    member_uuid: string | null | undefined,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);

    const committee = await this.committeesRepo.findOne({ where: { uuid } });
    if (!committee) {
      throw new NotFoundException('Comité introuvable');
    }

    if (member_uuid) {
      const member = await this.memberRepo.findOne({
        where: { uuid: member_uuid },
      });
      if (!member) {
        throw new NotFoundException('Membre introuvable');
      }
    }

    committee.responsible_member_uuid = member_uuid ?? null;
    const saved = await this.committeesRepo.save(committee);

    await this.logService.logAction(
      'committee-assign-responsible',
      admin.id,
      member_uuid
        ? `Responsable ${member_uuid} désigné pour le comité "${committee.name}"`
        : `Responsable retiré du comité "${committee.name}"`,
    );

    const responsible = member_uuid
      ? await this.memberRepo.findOne({ where: { uuid: member_uuid } })
      : null;

    return { ...saved, responsible: this.mapMember(responsible) };
  }

  // ---- MEMBRES DU COMITÉ ----

  async listMembers(committee_uuid: string, admin_uuid: string) {
    await this.getAdmin(admin_uuid);
    const committee = await this.committeesRepo.findOne({
      where: { uuid: committee_uuid },
    });
    if (!committee) {
      throw new NotFoundException('Comité introuvable');
    }

    const rows = await this.committeeMembersRepo.find({
      where: { committee_uuid },
      relations: ['member'],
      order: { created_at: 'ASC' },
    });

    return rows
      .map((row) => this.mapMember(row.member))
      .filter((m): m is CommitteeMemberView => !!m);
  }

  async addMember(
    committee_uuid: string,
    member_uuid: string,
    user: { uuid: string; member_uuid?: string | null; is_admin?: boolean },
  ) {
    const admin = await this.getAdmin(user.uuid);

    const committee = await this.committeesRepo.findOne({
      where: { uuid: committee_uuid },
    });
    if (!committee) {
      throw new NotFoundException('Comité introuvable');
    }

    if (!this.canManage(committee, user)) {
      throw new ForbiddenException(
        "Seul le responsable du comité (ou un administrateur) peut ajouter des membres.",
      );
    }

    const member = await this.memberRepo.findOne({
      where: { uuid: member_uuid },
    });
    if (!member) {
      throw new NotFoundException('Membre introuvable');
    }

    const existing = await this.committeeMembersRepo.findOne({
      where: { committee_uuid, member_uuid },
    });
    if (existing) {
      throw new ConflictException('Ce membre est déjà dans ce comité');
    }

    const link = this.committeeMembersRepo.create({
      committee_uuid,
      member_uuid,
      admin_uuid: user.uuid,
    });
    await this.committeeMembersRepo.save(link);

    await this.logService.logAction(
      'committee-member-add',
      admin.id,
      `Membre ${member.firstname} ${member.lastname} ajouté au comité "${committee.name}"`,
    );

    return this.mapMember(member);
  }

  async removeMember(
    committee_uuid: string,
    member_uuid: string,
    user: { uuid: string; member_uuid?: string | null; is_admin?: boolean },
  ) {
    const admin = await this.getAdmin(user.uuid);

    const committee = await this.committeesRepo.findOne({
      where: { uuid: committee_uuid },
    });
    if (!committee) {
      throw new NotFoundException('Comité introuvable');
    }

    if (!this.canManage(committee, user)) {
      throw new ForbiddenException(
        "Seul le responsable du comité (ou un administrateur) peut retirer des membres.",
      );
    }

    const link = await this.committeeMembersRepo.findOne({
      where: { committee_uuid, member_uuid },
    });
    if (!link) {
      throw new NotFoundException("Ce membre n'appartient pas à ce comité");
    }

    await this.committeeMembersRepo.softRemove(link);

    await this.logService.logAction(
      'committee-member-remove',
      admin.id,
      `Membre ${member_uuid} retiré du comité "${committee.name}"`,
    );

    return { success: true };
  }

  /**
   * Comités auxquels un membre est rattaché — comme responsable et/ou membre.
   * Alimente l'onglet « Comité » de la page détail membre.
   */
  async findByMember(member_uuid: string, admin_uuid: string) {
    await this.getAdmin(admin_uuid);

    const asResponsible = await this.committeesRepo.find({
      where: { responsible_member_uuid: member_uuid },
      order: { name: 'ASC' },
    });

    const memberLinks = await this.committeeMembersRepo.find({
      where: { member_uuid },
      relations: ['committee'],
    });

    const map = new Map<
      string,
      { uuid: string; name: string; description: string | null; is_responsible: boolean; is_member: boolean }
    >();

    for (const c of asResponsible) {
      map.set(c.uuid, {
        uuid: c.uuid,
        name: c.name,
        description: c.description ?? null,
        is_responsible: true,
        is_member: false,
      });
    }

    for (const link of memberLinks) {
      const c = link.committee;
      if (!c) continue;
      const existing = map.get(c.uuid);
      if (existing) {
        existing.is_member = true;
      } else {
        map.set(c.uuid, {
          uuid: c.uuid,
          name: c.name,
          description: c.description ?? null,
          is_responsible: false,
          is_member: true,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /**
   * Comités dont l'utilisateur connecté est responsable. Sert à décider si on
   * affiche le bouton « Ajouter à mon comité » sur la page d'un membre.
   */
  async findMine(user: { member_uuid?: string | null }) {
    if (!user?.member_uuid) return [];
    const committees = await this.committeesRepo.find({
      where: { responsible_member_uuid: user.member_uuid },
      order: { name: 'ASC' },
    });
    return committees.map((c) => ({
      uuid: c.uuid,
      name: c.name,
      description: c.description ?? null,
    }));
  }
}

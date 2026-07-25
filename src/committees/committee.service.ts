import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CommitteesEntity } from './entities/committees.entity';
import { CommitteeMemberEntity } from './entities/committee-member.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { MemberEntity } from '../members/entities/member.entity';
import { Role } from '../roles/entities/role.entity';
import { LevelEntity } from '../level/entities/level.entity';

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

/** Forme légère d'une donnée de référence (rôle / niveau) exposée sur un comité. */
export interface CommitteeRefView {
  uuid: string;
  name: string;
}

/** Rôles + niveaux résolus pour un lot de comités, indexés par uuid. */
interface CommitteeRefs {
  roles: Map<string, CommitteeRefView>;
  levels: Map<string, CommitteeRefView>;
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

    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(LevelEntity)
    private readonly levelRepo: Repository<LevelEntity>,
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

  // ---- RÔLE & NIVEAU DE RÉFÉRENCE ----
  // Résolution par requêtes séparées et **batchées** (2 requêtes pour toute la liste) plutôt que
  // par relation ORM : c'est le « pattern B » du projet, et ça évite un N+1 sur `findAll`.
  // (Les collations diffèrent — `committees`/`levels` en latin1, `roles` en utf8mb4 — mais ce
  // n'est PAS un obstacle : MySQL convertit latin1 vers utf8mb4. Cf. gotcha « Collations » de
  // CLAUDE.md ; le seul cas irréconciliable oppose deux collations d'un MÊME charset.)

  /**
   * Mémorise la présence de `roles.status` (ajoutée par la refonte des rôles, migration séparée).
   * On ne veut dépendre ni de l'ordre des migrations, ni de l'état de l'entité `Role` : colonne
   * absente ⇒ tous les rôles sont considérés actifs.
   */
  private rolesHasStatusColumn: boolean | null = null;

  private async hasRoleStatusColumn(): Promise<boolean> {
    if (this.rolesHasStatusColumn === null) {
      const rows = await this.roleRepo.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'roles' AND column_name = 'status' LIMIT 1`,
      );
      this.rolesHasStatusColumn = rows.length > 0;
    }
    return this.rolesHasStatusColumn;
  }

  /**
   * Vérifie que le rôle existe et n'est pas désactivé. Requête brute sur la SEULE table `roles`
   * (aucune collation croisée), et `status` n'est lu que si la colonne existe réellement - une
   * valeur NULL vaut 'enable', comme partout ailleurs dans le projet.
   */
  private async assertRoleUsable(role_uuid: string): Promise<void> {
    const withStatus = await this.hasRoleStatusColumn();

    const rows = await this.roleRepo.query(
      'SELECT `uuid`, `name`' +
        (withStatus ? ', `status`' : '') +
        ' FROM `roles` WHERE `uuid` = ? AND `deleted_at` IS NULL LIMIT 1',
      [role_uuid],
    );

    if (rows.length === 0) {
      throw new NotFoundException('Rôle introuvable');
    }
    if ((rows[0].status ?? 'enable') === 'disable') {
      throw new BadRequestException(
        `Le rôle « ${rows[0].name} » est désactivé : il ne peut pas être affecté à un comité`,
      );
    }
  }

  /** Vérifie que le niveau existe (facultatif, donc appelé seulement s'il est fourni). */
  private async assertLevelExists(level_uuid: string): Promise<void> {
    const level = await this.levelRepo.findOne({
      where: { uuid: level_uuid },
      select: { uuid: true, name: true },
    });
    if (!level) {
      throw new NotFoundException('Niveau introuvable');
    }
  }

  /**
   * Résout en 2 requêtes AU PLUS les rôles et niveaux référencés par un lot de comités
   * (pas de N+1 sur la liste). `select` explicite : on ne lit jamais `roles.status`, qui peut ne
   * pas encore exister en base même si l'entité `Role` le déclare.
   */
  private async loadRefs(
    committees: Array<Pick<CommitteesEntity, 'role_uuid' | 'level_uuid'>>,
  ): Promise<CommitteeRefs> {
    const roleUuids = [
      ...new Set(
        committees.map((c) => c.role_uuid).filter((u): u is string => !!u),
      ),
    ];
    const levelUuids = [
      ...new Set(
        committees.map((c) => c.level_uuid).filter((u): u is string => !!u),
      ),
    ];

    const [roles, levels] = await Promise.all([
      roleUuids.length
        ? this.roleRepo.find({
            where: { uuid: In(roleUuids) },
            select: { uuid: true, name: true },
          })
        : Promise.resolve([] as Role[]),
      levelUuids.length
        ? this.levelRepo.find({
            where: { uuid: In(levelUuids) },
            select: { uuid: true, name: true },
          })
        : Promise.resolve([] as LevelEntity[]),
    ]);

    return {
      roles: new Map(roles.map((r) => [r.uuid, { uuid: r.uuid, name: r.name }])),
      levels: new Map(
        levels.map((l) => [l.uuid, { uuid: l.uuid, name: l.name }]),
      ),
    };
  }

  /** Ajoute `role` / `level` (objets légers, ou null) à un comité déjà chargé. */
  private withRefs<T extends Pick<CommitteesEntity, 'role_uuid' | 'level_uuid'>>(
    committee: T,
    refs: CommitteeRefs,
  ): T & { role: CommitteeRefView | null; level: CommitteeRefView | null } {
    return {
      ...committee,
      role: committee.role_uuid
        ? (refs.roles.get(committee.role_uuid) ?? null)
        : null,
      level: committee.level_uuid
        ? (refs.levels.get(committee.level_uuid) ?? null)
        : null,
    };
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

    // Rôles + niveaux résolus en lot (2 requêtes pour toute la liste, pas une par comité).
    const refs = await this.loadRefs(committees);

    const enriched = await Promise.all(
      committees.map(async (c) => ({
        ...this.withRefs(c, refs),
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
    // Champs manquants = requête mal formée : 400, pas 404 (c'est aussi ce qu'annonce Swagger).
    if (!payload?.name) {
      throw new BadRequestException('Veuillez renseigner tous les champs');
    }
    if (!payload?.role_uuid) {
      throw new BadRequestException('Le rôle du comité est requis');
    }

    const admin = await this.getAdmin(admin_uuid);

    await this.assertRoleUsable(payload.role_uuid);
    if (payload.level_uuid) {
      await this.assertLevelExists(payload.level_uuid);
    }

    const newCommittees = this.committeesRepo.create({
      name: payload.name,
      description: payload.description ?? null,
      admin_uuid: admin_uuid ?? null,
      role_uuid: payload.role_uuid,
      level_uuid: payload.level_uuid ?? null,
    });

    await this.logService.logAction(
      'committees-store',
      admin.id,
      'Enregistrer du comité',
    );

    const saved = await this.committeesRepo.save(newCommittees);

    return this.withRefs(saved, await this.loadRefs([saved]));
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

    const refs = await this.loadRefs([committee]);

    return {
      ...this.withRefs(committee, refs),
      responsible: this.mapMember(responsible),
    };
  }

  async update(uuid: string, payload: any, admin_uuid: string) {
    const { name } = payload;

    // Idem `store()` : champs manquants ⇒ 400 (contrat annoncé par Swagger), pas 404.
    if (!uuid || !name || !admin_uuid) {
      throw new BadRequestException('Veuillez renseigner tous les champs');
    }

    const admin = await this.getAdmin(admin_uuid);

    const existing = await this.committeesRepo.findOne({ where: { uuid } });
    if (!existing) {
      throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    // Le rôle ne peut être que remplacé, jamais retiré : `role_uuid` absent = on n'y touche pas.
    if (payload.role_uuid !== undefined) {
      if (!payload.role_uuid) {
        throw new BadRequestException('Le rôle du comité est requis');
      }
      await this.assertRoleUsable(payload.role_uuid);
      existing.role_uuid = payload.role_uuid;
    }

    // Le niveau, lui, est détachable : `level_uuid: null` remet la colonne à NULL,
    // `level_uuid` absent (undefined) laisse la valeur en place.
    if (payload.level_uuid !== undefined) {
      if (payload.level_uuid) {
        await this.assertLevelExists(payload.level_uuid);
        existing.level_uuid = payload.level_uuid;
      } else {
        existing.level_uuid = null;
      }
    }

    existing.name = name;
    if (payload.description !== undefined) {
      existing.description = payload.description ?? null;
    }

    const updated = await this.committeesRepo.save(existing);

    await this.logService.logAction('committees-update', admin.id, updated);

    return this.withRefs(updated, await this.loadRefs([updated]));
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
   * Comités auxquels un membre est rattaché - comme responsable et/ou membre.
   * Alimente l'onglet « Comité » de la page détail membre.
   *
   * Volontairement SANS `role`/`level` : la fiche membre n'affiche que le libellé du comité et le
   * lien de rattachement. Les y ajouter coûterait deux requêtes de plus sur une page déjà chargée,
   * sans rien afficher. `GET /comite` et `GET /comite/:uuid` restent la source de ces références.
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

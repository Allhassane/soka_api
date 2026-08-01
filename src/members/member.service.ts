import { AccessScopeService } from 'src/access-scope/access-scope.service';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MemberEntity } from './entities/member.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { CivilityEntity } from 'src/civilities/entities/civility.entity';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { ResponsibilityService } from 'src/responsibilities/reponsibility.service';
import { AccessoryService } from 'src/accessories/accessory.service';
import { MemberAccessoryEntity } from 'src/member-accessories/entities/member-accessories.entity';
import { UserService } from 'src/users/user.service';
import { MemberAccountService } from 'src/users/member-account.service';
import { ResponsibilityEntity } from 'src/responsibilities/entities/responsibility.entity';
import { MaritalStatusEntity } from 'src/marital-status/entities/marital-status.entity';
import { CountryEntity } from 'src/countries/entities/country.entity';
import { CityEntity } from 'src/cities/entities/city.entity';
import { FormationEntity } from 'src/formations/entities/formation.entity';
import { JobEntity } from 'src/jobs/entities/job.entity';
import { OrganisationCityEntity } from 'src/organisation_cities/entities/organisation_city.entity';
import { DepartmentEntity } from 'src/departments/entities/department.entity';
import { DivisionEntity } from 'src/divisions/entities/division.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { VerifyPhoneNumberDto } from './dto/verify-phone.dto';
import { v4 as uuidv4 } from 'uuid';
import { StructureService } from 'src/structure/structure.service';
import { MemberList } from 'src/shared/interfaces/member.interface';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ok } from 'assert';
import { MemberResponsibilityService } from 'src/member-responsibility/member-responsibility.service';
import { StructureTreeService } from 'src/structure/structure-tree.service';
import {
  ancestorAtLevel,
  MemberImpact,
  ResponsibilityAnchorService,
} from 'src/member-transfer/responsibility-anchor.service';

@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,

    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CivilityEntity)
    private readonly civilityRepo: Repository<CivilityEntity>,

    @InjectRepository(MemberResponsibilityEntity)
    private readonly memberResponsibilityRepo: Repository<MemberResponsibilityEntity>,

    @InjectRepository(MemberAccessoryEntity)
    private readonly memberAccessoryRepo: Repository<MemberAccessoryEntity>,

    @InjectRepository(MaritalStatusEntity)
    private readonly maritalStatusRepo: Repository<MaritalStatusEntity>,

    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,

    @InjectRepository(CityEntity)
    private readonly cityRepo: Repository<CityEntity>,

    @InjectRepository(FormationEntity)
    private readonly formationRepo: Repository<FormationEntity>,

    @InjectRepository(JobEntity)
    private readonly jobRepo: Repository<JobEntity>,

    @InjectRepository(OrganisationCityEntity)
    private readonly organisationCityRepo: Repository<OrganisationCityEntity>,

    @InjectRepository(DepartmentEntity)
    private readonly departmentRepo: Repository<DepartmentEntity>,

    @InjectRepository(DivisionEntity)
    private readonly divisionRepo: Repository<DivisionEntity>,

    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,

    private readonly responsibilityService: ResponsibilityService,

    private readonly accessoryService: AccessoryService,

    @InjectRepository(ResponsibilityEntity)
    private readonly responsibilityRepo: Repository<ResponsibilityEntity>,

    private readonly structureService: StructureService,

    @Inject(forwardRef(() => MemberResponsibilityService))
    private readonly memberResponsibilityService: MemberResponsibilityService,

    private structureTreeService: StructureTreeService,

    /** Règle d'ancre R8 - partagée avec le workflow de transfert (`docs/TRANSFERT-MEMBRES.md` §5). */
    private readonly anchorService: ResponsibilityAnchorService,

    /** Périmètre unifié (responsabilités + comités) - cf. `getAccessibleStructureUuids`. */
    private readonly accessScopeService: AccessScopeService,

    /** Règle unique du compte de connexion (création + réalignement), partagée avec l'import. */
    private readonly memberAccounts: MemberAccountService,

  ) {}


    async store(dto: CreateMemberDto, admin_uuid: string): Promise<MemberEntity> {
      // --- Vérification admin ---
      const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
      if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
      }

      /**
       * ── Périmètre du créateur ──
       *
       * `update()` vérifiait déjà le périmètre, pas `store()` : un responsable pouvait créer un
       * membre dans **n'importe quelle** structure via un appel API direct (vérifié le
       * 2026-07-24 - un responsable du district VOMANZI a créé un membre dans TCHIVA).
       * L'UI verrouille la hiérarchie jusqu'au district, mais le contrôle d'accès ne peut pas
       * reposer sur le formulaire. `assertStructureInScope` refuse aussi une création **sans**
       * structure pour un non-admin, sans quoi le membre échapperait à tout périmètre.
       */
      await this.assertStructureInScope(dto.structure_uuid, admin_uuid);

      // ---- Vérification civilité obligatoire ----
      // ⚠️ Garde explicite indispensable : `findOne({ where: { uuid: undefined } })` ne filtre
      // rien et renvoie la PREMIÈRE civilité de la table. Sans ce test, un membre créé sans
      // civilité héritait silencieusement de « Monsieur » - et donc de `gender = 'homme'`,
      // puisque le genre est dérivé de la civilité juste en dessous.
      if (!dto.civility_uuid) {
        throw new BadRequestException('La civilité est obligatoire.');
      }

      const civility = await this.civilityRepo.findOne({
        where: { uuid: dto.civility_uuid },
      });
      if (!civility) {
        throw new NotFoundException('Civilité introuvable.');
      }

      //  Génération du matricule unique
      const lastMember = await this.memberRepo
        .createQueryBuilder('m')
        .orderBy('m.id', 'DESC')
        .getOne();

      const nextId = lastMember ? lastMember.id + 1 : 1;
      const yearSuffix = new Date().getFullYear().toString().slice(-2);
      const matricule = `${yearSuffix}-${String(nextId).padStart(4, '0')}`;

      // ---- Création du membre ----
      const member = this.memberRepo.create({
        ...dto,
        matricule,
        gender: civility.gender,
        admin_uuid,
        status: dto.status ?? 'enable',
      });

      member.civility = civility;

      // ---- Relations optionnelles ----

      if (dto.marital_status_uuid) {
        member.marital_status = await this.maritalStatusRepo.findOne({
          where: { uuid: dto.marital_status_uuid },
        });
      }

      if (dto.country_uuid) {
        member.country = await this.countryRepo.findOne({
          where: { uuid: dto.country_uuid },
        });
      }

      if (dto.city_uuid) {
        member.city = await this.cityRepo.findOne({
          where: { uuid: dto.city_uuid },
        });
      }

      if (dto.formation_uuid) {
        member.formation = await this.formationRepo.findOne({
          where: { uuid: dto.formation_uuid },
        });
      }

      if (dto.job_uuid) {
        member.job = await this.jobRepo.findOne({
          where: { uuid: dto.job_uuid },
        });
      }

      if (dto.organisation_city_uuid) {
        const orgCity = await this.organisationCityRepo.findOne({
          where: { uuid: dto.organisation_city_uuid },
        });

        if (!orgCity) {
          throw new NotFoundException("Ville d'organisation introuvable");
        }

        // IMPORTANT : assigner les deux
        member.organisation_city = orgCity;
        member.organisation_city_uuid = dto.organisation_city_uuid;
      }

      if (dto.department_uuid) {
        member.department = await this.departmentRepo.findOne({
          where: { uuid: dto.department_uuid },
        });
      }

      if (dto.division_uuid) {
        member.division = await this.divisionRepo.findOne({
          where: { uuid: dto.division_uuid },
        });
      }

      if (dto.structure_uuid) {
        member.structure = await this.structureRepo.findOne({
          where: { uuid: dto.structure_uuid },
        });
      }

      // ---- Pré-résolution (lectures + validations) AVANT la transaction ----
      // On valide la responsabilité et les accessoires d'abord : en cas d'erreur, aucun
      // membre orphelin n'est créé (avant, ces lectures étaient interleavées avec les saves).
      let responsibility: ResponsibilityEntity | null = null;
      if (dto.responsibility_uuid) {
        responsibility = await this.responsibilityService.findOne(
          dto.responsibility_uuid,
          admin_uuid,
        );
      }

      const resolvedAccessories: { uuid: string; accessory: any }[] = [];
      if (dto.accessories && dto.accessories.length > 0) {
        for (const accessoryUuid of dto.accessories) {
          const accessory = await this.accessoryService.findOne(accessoryUuid, admin_uuid);
          if (accessory) resolvedAccessories.push({ uuid: accessoryUuid, accessory });
        }
      }

      // ---- Écritures ATOMIQUES (membre + responsabilité + accessoires + compte) ----
      let userCreated = false;
      const saved = await this.memberRepo.manager.transaction(async (manager) => {
        const savedMember = await manager.save(member);

        if (responsibility) {
          await manager.save(
            this.memberResponsibilityRepo.create({
              member_uuid: savedMember.uuid,
              member: savedMember,
              responsibility_uuid: dto.responsibility_uuid,
              responsibility,
              priority: 'high',
            }),
          );
        }

        for (const { uuid: accessoryUuid, accessory } of resolvedAccessories) {
          await manager.save(
            this.memberAccessoryRepo.create({
              member_uuid: savedMember.uuid,
              member: savedMember,
              accessory_uuid: accessoryUuid,
              accessory,
            }),
          );
        }

        // Compte utilisateur lié : règle PARTAGÉE avec l'import (`MemberAccountService`) -
        // téléphone présent et non déjà pris. Elle vivait ici en double, et l'import ne
        // l'appliquait pas du tout : les membres importés naissaient sans compte.
        // Toujours dans `manager` : un rollback ne doit pas laisser de compte orphelin.
        userCreated =
          (await this.memberAccounts.reconcileAccount(savedMember, manager)) === 'created';

        return savedMember;
      });

      // ---- Journalisation (hors transaction : uniquement après un commit réussi) ----
      if (userCreated) {
        await this.logService.logAction(
          'user-create-from-member',
          admin.id,
          `Compte utilisateur créé automatiquement pour ${saved.firstname} ${saved.lastname}`,
        );
      }

      await this.logService.logAction(
        'members-store',
        admin.id,
        `Création du membre ${saved.firstname} ${saved.lastname} (${saved.matricule})`,
      );

      return saved;
  }


  async storeFromMigration(dto: CreateMemberDto, admin_uuid: string): Promise<MemberEntity> {

    // ---- Sauvegarde du membre principal ----
    const saved = await this.memberRepo.save({...dto, admin_uuid});

    return saved;
  }

  /** Insère le membre, ou MET À JOUR l'existant (matché par uuid) - migration idempotente, anti-doublon. */
  async upsertFromMigration(dto: CreateMemberDto & { uuid: string }, admin_uuid: string): Promise<MemberEntity> {
    const existing = await this.memberRepo.findOne({ where: { uuid: dto.uuid } });
    if (existing) {
      const { accessories, responsibility_uuid, ...columns } = dto as any;
      void accessories; void responsibility_uuid;
      await this.memberRepo.update({ uuid: dto.uuid }, { ...columns, admin_uuid });
      return (await this.memberRepo.findOne({ where: { uuid: dto.uuid } })) as MemberEntity;
    }
    return this.memberRepo.save({ ...dto, admin_uuid });
  }

  async update(uuid: string, dto: UpdateMemberDto, admin_uuid: string): Promise<MemberEntity> {

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    const existingMember = await this.memberRepo.findOne({ where: { uuid } });
    if (!existingMember) throw new NotFoundException('Membre introuvable.');

    await this.assertStructureInScope(existingMember.structure_uuid, admin_uuid);

    /**
     * ⚠️ La structure de DESTINATION doit elle aussi être dans le périmètre du demandeur.
     *
     * Sans ce contrôle, seule la source était validée : un utilisateur pouvait se déplacer
     * lui-même (ou déplacer un membre de son périmètre) vers **n'importe quelle** structure,
     * et donc s'attribuer un périmètre plus large à la connexion suivante - le périmètre étant
     * dérivé de la structure du membre. La garde R1 ci-dessous ne rattrapait pas le cas :
     * elle exige `fromDistrict && toDistrict`, or `resolveDistrict` renvoie `null` pour une
     * destination située AU-DESSUS du district (NATIONAL / REGION / CENTRE / CHAPITRE) -
     * exactement les destinations qui élargissent le périmètre.
     */
    if (
      dto.structure_uuid &&
      dto.structure_uuid !== existingMember.structure_uuid
    ) {
      await this.assertStructureInScope(dto.structure_uuid, admin_uuid);
    }

    /**
     * ── Changement de structure : frontière de district + règle d'ancre R8 ──
     *
     * Un déplacement de membre passe soit par ici (édition simple), soit par le workflow de
     * transfert. Les deux chemins doivent produire le **même** effet sur les responsabilités,
     * d'où l'appel au service de domaine partagé plutôt qu'à une logique locale.
     * Cf. `docs/TRANSFERT-MEMBRES.md` §5 et §9 (étape 5).
     */
    const previousStructureUuid = existingMember.structure_uuid;
    const isStructureChange =
      !!dto.structure_uuid &&
      !!previousStructureUuid &&
      dto.structure_uuid !== previousStructureUuid;

    let anchorImpact: MemberImpact | null = null;

    if (isStructureChange) {
      const targetStructure = await this.structureRepo.findOne({
        where: { uuid: dto.structure_uuid },
      });
      if (!targetStructure) throw new NotFoundException("Structure d'accueil introuvable.");

      // Une seule lecture de l'arbre, réutilisée par les deux calculs qui suivent.
      const index = await this.anchorService.loadStructureIndex();

      const [fromDistrict, toDistrict] = await Promise.all([
        this.anchorService.resolveDistrict(previousStructureUuid, index),
        this.anchorService.resolveDistrict(dto.structure_uuid as string, index),
      ]);

      /**
       * R1 - changer de district relève du workflow d'approbation, pas de l'édition libre.
       *
       * ⚠️ On ne bloque que si les **deux** districts sont déterminables. Un membre rattaché
       * au-dessus du district (anomalie connue : 104 membres sur un CHAPITRE) n'a pas de
       * district source, et le workflow de transfert le refuse déjà pour cette raison :
       * bloquer ici aussi le rendrait définitivement immobile. On laisse donc passer la
       * réparation - la règle R8 ci-dessous s'applique quand même.
       */
      if (fromDistrict && toDistrict && fromDistrict !== toDistrict) {
        throw new BadRequestException(
          "Ce changement de structure fait sortir le membre de son district : il doit passer par une demande de transfert (Membres › Transferts), qui sera soumise à l'approbation du district d'accueil.",
        );
      }

      anchorImpact = await this.anchorService.computeResponsibilityImpact(
        uuid,
        previousStructureUuid,
        dto.structure_uuid as string,
        index,
      );
    }

    if (dto.civility_uuid) {
      const civility = await this.civilityRepo.findOne({
        where: { uuid: dto.civility_uuid },
      });

      if (!civility) throw new NotFoundException('Civilité introuvable.');

      existingMember.gender = civility.gender;
      existingMember.civility_uuid = dto.civility_uuid;
    }

    Object.assign(existingMember, {
      ...dto,
      admin_uuid,
      updated_at: new Date(),
    });

    const updated = await this.memberRepo.save(existingMember);

    /**
     * R8 - les responsabilités dont l'ancre a changé sont retirées (soft-delete), exactement
     * comme à l'application d'un transfert.
     *
     * Fait **après** le déplacement et non avant : en cas d'échec, une responsabilité qui
     * survit à un déplacement reste réparable, alors qu'une responsabilité supprimée sur un
     * déplacement qui n'a pas eu lieu serait une perte de donnée silencieuse.
     * ⚠️ `update()` n'est pas transactionnel (état existant du service) - contrairement à
     * l'application d'un transfert, qui l'est.
     */
    if (anchorImpact && anchorImpact.lost.length > 0) {
      await this.memberResponsibilityRepo.softDelete({
        uuid: In(anchorImpact.lost.map((l) => l.member_responsibility_uuid)),
      });

      await this.logService.logAction(
        'members-responsibility-anchor-lost',
        admin.id,
        `Changement de structure de ${updated.firstname} ${updated.lastname} (${previousStructureUuid} → ${updated.structure_uuid}) : ` +
          `${anchorImpact.lost.length} responsabilité(s) retirée(s) - ` +
          anchorImpact.lost.map((l) => l.responsibility_name).join(', '),
      );
    }

    /**
     * MISE À JOUR AUTO DU COMPTE UTILISATEUR LIÉ
     *
     * Même règle que la création et que l'import (`MemberAccountService`). Deux différences
     * avec le code qui vivait ici :
     *  - le téléphone n'est PAS déplacé sur un numéro déjà porté par un autre compte
     *    (`users.phone_number` n'a aucun index UNIQUE : deux comptes sur un même numéro
     *    rendraient la connexion ambiguë) ;
     *  - un membre qui n'avait pas de compte en reçoit un.
     */
    const accountOutcome = await this.memberAccounts.reconcileAccount(updated);

    if (accountOutcome === 'updated' || accountOutcome === 'created') {
      // journalisation MAJ user
      await this.logService.logAction(
        accountOutcome === 'created'
          ? 'user-create-from-member'
          : 'user-update-from-member',
        admin.id,
        `Compte utilisateur ${accountOutcome === 'created' ? 'créé' : 'mis à jour'} automatiquement pour ${updated.firstname} ${updated.lastname}`,
      );
    }

    // Mise à jour de la responsabilité (si fournie)
    if (dto.responsibility_uuid) {
      // Vérifie si la responsabilité existe
      const responsibility = await this.responsibilityService.findOne(
        dto.responsibility_uuid,
        admin_uuid,
      );
      if (!responsibility) {
        throw new NotFoundException('Responsabilité introuvable.');
      }
    }

    if (dto.hasOwnProperty('responsibility_uuid')) {

      const existingResp = await this.memberResponsibilityRepo.findOne({
        where: { member_uuid: updated.uuid },
      });


      if (!dto.responsibility_uuid) {
        if (existingResp) {
          await this.memberResponsibilityRepo.delete({ member_uuid: updated.uuid });
        }
      }

      else {
        const responsibility = await this.responsibilityService.findOne(
          dto.responsibility_uuid,
          admin_uuid,
        );

        if (!responsibility) {
          throw new NotFoundException('Responsabilité introuvable.');
        }

        if (existingResp) {
          existingResp.responsibility_uuid = dto.responsibility_uuid;
          existingResp.responsibility = responsibility;
          await this.memberResponsibilityRepo.save(existingResp);
        } else {
          const newResp = this.memberResponsibilityRepo.create({
            member_uuid: updated.uuid,
            member: updated,
            responsibility_uuid: dto.responsibility_uuid,
            responsibility,
            priority: 'high',
          });
          await this.memberResponsibilityRepo.save(newResp);
        }
      }
    }


    if (dto.accessories && Array.isArray(dto.accessories)) {
      await this.memberAccessoryRepo.delete({ member_uuid: updated.uuid });

      for (const accessoryUuid of dto.accessories) {
        const accessory = await this.accessoryService.findOne(accessoryUuid, admin_uuid);

        if (accessory) {
          await this.memberAccessoryRepo.save(
            this.memberAccessoryRepo.create({
              member_uuid: updated.uuid,
              member: updated,
              accessory_uuid: accessoryUuid,
              accessory,
            }),
          );
        }
      }
    }


    await this.logService.logAction(
      'members-update',
      admin.id,
      `Mise à jour du membre ${updated.firstname} ${updated.lastname} (${updated.matricule})`,
    );

    return updated;
  }


/*   async findAll(
    admin_uuid: string,
    page: number = 1,
    limit: number = 15,
  ): Promise<any> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    const skip = (page - 1) * limit;

    const [results, total] = await this.memberRepo.findAndCount({
      relations: ['member_accessories'],
      order: { firstname: 'ASC' },
      skip,
      take: limit,
    });

    await this.logService.logAction(
      'members-findAll',
      admin.id,
      `Récupération des membres (page ${page}, limit ${limit})`,
    );

    return {
      success: true,
      message: 'Liste paginée récupérée avec succès',
      meta: {
        current_page: page,
        limit,
        total_items: total,
        total_pages: Math.ceil(total / limit),
        has_next: page * limit < total,
        has_prev: page > 1,
      },
      data: results,
    };
  } */


async findAll(
  admin_uuid: string,
  page: number = 1,
  limit: number = 15,
  filters: {
    region_uuid?: string;
    centre_uuid?: string;
    chapitre_uuid?: string;
    district_uuid?: string;
    groupe_uuid?: string;
    department_uuid?: string;
    division_uuid?: string;
  } = {},
): Promise<any> {
  const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
  if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

  const skip = (page - 1) * limit;

  // Déterminer la structure cible selon les filtres (même logique que getMemberStatsByConnectedUser)
  const targetStructureUuid =
    filters.groupe_uuid ||
    filters.district_uuid ||
    filters.chapitre_uuid ||
    filters.centre_uuid ||
    filters.region_uuid ||
    null;

  // Construire la requête
  let query = this.memberRepo
    .createQueryBuilder('m')
    .leftJoinAndSelect('m.member_accessories', 'ma')
    .where('m.deleted_at IS NULL');

  // Périmètre du demandeur (null = superadmin technique => aucun filtre hiérarchique)
  const scopeUuids = await this.getAccessibleStructureUuids(admin_uuid);

  if (targetStructureUuid) {
    // Une structure est ciblée : elle doit appartenir au périmètre du demandeur.
    if (scopeUuids !== null && !scopeUuids.includes(targetStructureUuid)) {
      throw new ForbiddenException('Structure hors de votre périmètre.');
    }
    const subStructureUuids = await this.structureTreeService.getAllSubStructureUuids(targetStructureUuid);
    query = query.andWhere('m.structure_uuid IN (:...structureUuids)', {
      structureUuids: subStructureUuids,
    });
  } else if (scopeUuids !== null) {
    // Pas de filtre explicite : on borne la liste au périmètre du demandeur.
    if (scopeUuids.length === 0) {
      query = query.andWhere('1 = 0');
    } else {
      query = query.andWhere('m.structure_uuid IN (:...scopeUuids)', { scopeUuids });
    }
  }

  // Filtres department et division : ces champs existent bien sur le membre
  if (filters.department_uuid) {
    query = query.andWhere('m.department_uuid = :department_uuid', {
      department_uuid: filters.department_uuid,
    });
  }

  if (filters.division_uuid) {
    query = query.andWhere('m.division_uuid = :division_uuid', {
      division_uuid: filters.division_uuid,
    });
  }

  const [results, total] = await query
    .orderBy('m.firstname', 'ASC')
    .skip(skip)
    .take(limit)
    .getManyAndCount();

  await this.logService.logAction(
    'members-findAll',
    admin.id,
    `Récupération des membres (page ${page}, limit ${limit})`,
  );

  return {
    success: true,
    message: 'Liste paginée récupérée avec succès',
    meta: {
      current_page: page,
      limit,
      total_items: total,
      total_pages: Math.ceil(total / limit),
      has_next: page * limit < total,
      has_prev: page > 1,
    },
    data: results,
  };
}

    /** Trouver un membre par UUID */
  async findOne(uuid: string, admin_uuid: string): Promise<MemberEntity> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const member = await this.memberRepo.findOne({
      where: { uuid },
      relations: [
        // Relations simples
        'civility',
        'marital_status',
        'country',
        'city',
        'formation',
        'job',
        'organisation_city',
        'department',
        'division',
        'structure',

        // Collections
        'member_accessories',
        'member_accessories.accessory',
        'member_responsibilities',
        'member_responsibilities.responsibility',
        'member_responsibilities.responsibility.level'
      ],
    });

    if (!member) {
      throw new NotFoundException('Aucun membre trouvé avec cet identifiant.');
    }

    await this.assertStructureInScope(member.structure_uuid, admin_uuid);

    await this.logService.logAction(
      'members-findOne',
      admin.id,
      `Consultation du membre ${member.firstname} ${member.lastname}`,
    );

    return member;
  }

  async findOneByUuid(uuid: string){
    const member = await this.memberRepo.findOne({
      where: { uuid },
    });

    return member;
  }

  /**
   * Suppression logique d’un membre, **et désactivation de son compte de connexion**.
   *
   * ⚠️ Sans la seconde partie, supprimer un membre ne coupait pas son accès : le compte `users`
   * restait `is_active = 1` avec son numéro, donc la personne pouvait encore demander son mot de
   * passe par SMS et se connecter alors que sa fiche n'existait plus (recette du 2026-07-31,
   * anomalie F1). C'est `is_active` qui referme les deux portes : `validateUser` refuse la
   * connexion (« Compte désactivé ») et `requestPasswordReset` n'envoie aucun SMS.
   *
   * On **désactive** plutôt que de supprimer le compte : la suppression du membre est elle-même
   * logique (`softRemove`), le compte doit pouvoir suivre le même chemin si la fiche est
   * restaurée. Les deux écritures sont dans une transaction - un membre supprimé dont le compte
   * resterait actif est précisément le défaut qu'on corrige.
   */
  async delete(uuid: string, admin_uuid: string): Promise<void> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    const member = await this.memberRepo.findOne({ where: { uuid } });
    if (!member) throw new NotFoundException('Aucun membre trouvé à supprimer.');

    await this.assertStructureInScope(member.structure_uuid, admin_uuid);

    let comptesDesactives = 0;
    // `memberRepo.manager.transaction` : le même accès que la création de membre plus haut,
    // pour ne pas injecter une `DataSource` de plus dans un constructeur déjà chargé.
    await this.memberRepo.manager.transaction(async (manager) => {
      await manager.softRemove(member);

      const res = await manager.update(
        User,
        { member_uuid: member.uuid, is_active: true },
        { is_active: false },
      );
      comptesDesactives = res.affected ?? 0;
    });

    await this.logService.logAction(
      'members-delete',
      admin.id,
      `Suppression logique du membre ${member.firstname} ${member.lastname}` +
        (comptesDesactives > 0
          ? ` - compte de connexion désactivé`
          : ` - aucun compte de connexion rattaché`),
    );
  }

  /**
   * Périmètre hiérarchique du demandeur (anti-IDOR).
   *
   * ⚠️ **Un responsable n'habite PAS la structure qu'il dirige** (cf. `CLAUDE.md`) : sa
   * responsabilité porte un **niveau**, et la structure qu'elle couvre est l'**ancêtre** de sa
   * structure de résidence à ce niveau - exactement le calcul de `findStructureByLevelUuid`
   * (`auth.service.ts`), factorisé dans `ancestorAtLevel()`.
   *
   * Cette méthode dérivait auparavant le périmètre de la structure de **résidence**, ce qui le
   * réduisait à une feuille : mesuré le 2026-07-24, le responsable du district VOMANZI ne
   * « voyait » que **12 membres sur 34** - il était borné à son propre sous-groupe. C'est la
   * même sémantique de périmètre que `StructureTreeService.assertTargetWithinPerimeter` et que
   * le module transfert (`allowedRootUuids` = structures des responsabilités) : les trois
   * doivent rester d'accord.
   *
   * @returns null si superadmin technique (aucune restriction) ;
   *          sinon les UUIDs des structures accessibles (racines de responsabilité + descendants) ;
   *          [] si l'utilisateur n'a ni responsabilité ni structure (ne voit rien).
   */
  async getAccessibleStructureUuids(admin_uuid: string): Promise<string[] | null> {
    const user = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!user) throw new NotFoundException("Identifiant de l'auteur introuvable");
    if (user.is_admin === true) return null;
    if (!user.member_uuid) return [];

    // Périmètre unifié : `AccessScopeService` prend le niveau le plus élevé atteint par une
    // responsabilité OU par un comité, et remonte les ancêtres du membre jusqu'à ce niveau.
    // ⚠️ UNE seule racine suffit : tous les paliers accessibles appartiennent à la même chaîne
    // d'ancêtres, donc le sous-arbre du plus haut contient ceux de tous les autres. C'est ce qui
    // remplace l'ancienne boucle sur chaque responsabilité (qui, elle, ignorait les comités).
    const scope = await this.accessScopeService.compute({
      uuid: user.uuid,
      member_uuid: user.member_uuid,
      is_admin: user.is_admin,
    });

    if (!scope.scope_structure_uuid) return [];

    return this.structureTreeService.getAllSubStructureUuids(
      scope.scope_structure_uuid,
    );
  }

  /** Vérifie qu'une structure est dans le périmètre du demandeur (sinon 403). */
  async assertStructureInScope(
    structureUuid: string | null | undefined,
    admin_uuid: string,
  ): Promise<void> {
    const scope = await this.getAccessibleStructureUuids(admin_uuid);
    if (scope === null) return; // superadmin technique
    if (!structureUuid || !scope.includes(structureUuid)) {
      throw new ForbiddenException(
        'Accès refusé : cet élément est hors de votre périmètre.',
      );
    }
  }

  async prepareMemberList(admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    const memberResponsibility = await this.memberResponsibilityRepo.findOne({ where: { member_uuid: admin.member_uuid, priority: 'high' }, relations: ['member'] });
    if (!memberResponsibility) throw new NotFoundException("Identifiant de la responsabilité introuvable");

    const responsibility_uuid = memberResponsibility.responsibility_uuid;


    const responsibility = await this.responsibilityRepo.findOne({ relations: ['level'], where: { uuid: responsibility_uuid } });
    if (!responsibility) throw new NotFoundException("Identifiant de la responsabilité introuvable");
    if (!memberResponsibility.member) throw new NotFoundException("Identifiant du membre introuvable");

    const sous_groupes = await this.structureService.findByAllChildrens(memberResponsibility.member.structure_uuid);
    return sous_groupes;
  }

  //liste des membres en fonction de l'utilisateur connecté
  async findAllMemberByUserConnected(
    admin_uuid: string,
    page: number = 1,
    limit: number = 15,
  ): Promise<any> {
    const sous_groupes = await this.prepareMemberList(admin_uuid);

    const skip = (page - 1) * limit;
    const members = await this.memberRepo.find({
      where: { structure_uuid: In(sous_groupes) },
      relations: ['formation'],
      order: { firstname: 'ASC' },
      skip,
      take: limit,
    });
    if (!members) throw new NotFoundException("Aucun membre trouvé");

    const total = await this.memberRepo.count({
      where: { structure_uuid: In(sous_groupes) },
    });

    return {
      results: members.map((member) => ({
        uuid: member.uuid,
        firstname: member.firstname,
        lastname: member.lastname,
        phone_number: member.phone,
        formation: member.formation?.name,
        status: member.status,
        gohonzon: member.has_gohonzon,
      })),
      meta: {
        current_page: page,
        limit,
        total_items: total,
        total_pages: Math.ceil(total / limit),
        has_next: page * limit < total,
        has_prev: page > 1,
      },
    }
  }

  async findAllBeneficiaryByUserConnected(
    admin_uuid: string,
    page?: number,
    limit?: number,
    search?: string,
  ): Promise<any> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    const sous_groupes = await this.prepareMemberList(admin_uuid);

    // Périmètre vide → liste vide (évite un `IN ()` invalide).
    if (!sous_groupes || sous_groupes.length === 0) {
      return { results: [] };
    }

    // Sélection ciblée (colonnes du picker uniquement) + recherche serveur optionnelle.
    const query = this.memberRepo
      .createQueryBuilder('m')
      .select(['m.uuid', 'm.firstname', 'm.lastname', 'm.phone'])
      .where('m.structure_uuid IN (:...sous_groupes)', { sous_groupes })
      .andWhere('m.deleted_at IS NULL')
      .orderBy('m.firstname', 'ASC');

    if (search?.trim()) {
      query.andWhere(
        '(m.firstname LIKE :s OR m.lastname LIKE :s)',
        { s: `%${search.trim()}%` },
      );
    }

    // Pagination OPTIONNELLE : si page/limit fournis on pagine + meta ; sinon, comportement
    // historique (toute la liste, même enveloppe) pour ne pas casser le picker existant.
    const paginate = page != null && limit != null && limit > 0;
    if (paginate) {
      const currentPage = Math.max(1, Number(page));
      const perPage = Number(limit);
      const [members, total] = await query
        .skip((currentPage - 1) * perPage)
        .take(perPage)
        .getManyAndCount();

      return {
        results: members.map((member) => ({
          uuid: member.uuid,
          firstname: member.firstname,
          lastname: member.lastname,
          phone_number: member.phone,
          selected: admin.member_uuid == member.uuid ? true : false,
        })),
        meta: {
          current_page: currentPage,
          limit: perPage,
          total_items: total,
          total_pages: Math.ceil(total / perPage),
          has_next: currentPage * perPage < total,
          has_prev: currentPage > 1,
        },
      };
    }

    const members = await query.getMany();
    return {
      results: members.map((member) => ({
        uuid: member.uuid,
        firstname: member.firstname,
        lastname: member.lastname,
        phone_number: member.phone,
        selected: admin.member_uuid == member.uuid ? true : false,
      })),
    };
  }


  async verifyPhoneNumber(payload: VerifyPhoneNumberDto) {

    let member;
    if(payload.category === 'principal') {
      member = await this.memberRepo.findOne({ where: { phone: payload.phone } });
    }else if(payload.category === 'whatsapp') {
      member = await this.memberRepo.findOne({ where: { phone_whatsapp: payload.phone } });
    }

    //if (member) throw new BadRequestException('Le numero de telephone est deja utilise.');

    return {
      message: member ? 'Le numero de telephone est deja utilise.' : 'Le numero de telephone est disponible.',
      is_available: !member,
    }
  }

  async verifyEmail(payload: VerifyEmailDto) {

    let member;
    if(payload.email) {
      member = await this.memberRepo.findOne({ where: { email: payload.email } });
    }

    //if (member) throw new BadRequestException('Le numero de telephone est deja utilise.');
    return {
      message: member ? 'L\'email est deja utilise.' : 'L\'email est disponible.',
      is_available: !member,
    }
  }

  async findByStructure(uuid: string, admin_uuid: string){
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    await this.assertStructureInScope(uuid, admin_uuid);

    const sous_groups = await this.structureService.findByAllChildrens(uuid);

    const members = await this.memberRepo.find({
      where: { structure_uuid: In(sous_groups) },
      order: { firstname: 'ASC' },
    });

    await this.logService.logAction(
      'members-findByStructure',
      admin.id,
      `Consultation des membres de la structure ${uuid}`,
    );

    return members;
  }

  // Obtenir les statistiques
async getStatsByStructure(uuid: string, admin_uuid: string) {
  const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
  if (!admin) {
    throw new NotFoundException("Identifiant de l'auteur introuvable");
  }

  await this.assertStructureInScope(uuid, admin_uuid);

  // Récupérer tous les sous-groupes du périmètre
  const sous_groupes = await this.structureService.findByAllChildrens(uuid);

  const stats = {
    total: 0,
    total_hommes: 0,
    total_femmes: 0,
    total_jeunes: 0,
    // Divisions
    total_jeune_hommes: 0,
    total_jeune_femmes: 0,
    total_avenir: 0,
    jeunes_sans_division: 0,
  };

  // Garde : périmètre vide → tout à zéro (évite un `IN ()` invalide).
  if (!sous_groupes || sous_groupes.length === 0) {
    await this.logService.logAction(
      'members-getStatsByStructure',
      admin.id,
      `Consultation des statistiques de la structure ${uuid}`,
    );
    return stats;
  }

  // UNE SEULE requête agrégée (remplace 8 COUNT distincts) : comptage par
  // département/division sur le périmètre, soft-delete exclu. L'agrégation finale
  // se fait en mémoire - comportement strictement identique à l'ancien.
  const rows = await this.memberRepo
    .createQueryBuilder('m')
    .leftJoin('m.department', 'd')
    .leftJoin('m.division', 'dv')
    .select('d.name', 'department_name')
    .addSelect('dv.name', 'division_name')
    .addSelect('COUNT(*)', 'count')
    .where('m.structure_uuid IN (:...sous_groupes)', { sous_groupes })
    .andWhere('m.deleted_at IS NULL')
    .groupBy('d.name')
    .addGroupBy('dv.name')
    .getRawMany();

  for (const r of rows) {
    const n = parseInt(r.count, 10) || 0;
    stats.total += n;

    // Départements
    if (r.department_name === 'HOMME') stats.total_hommes += n;
    if (r.department_name === 'FEMME') stats.total_femmes += n;
    if (r.department_name === 'JEUNESSE') {
      stats.total_jeunes += n;
      if (r.division_name === null) stats.jeunes_sans_division += n;
    }

    // Divisions
    if (r.division_name === 'JEUNES_HOMMES') stats.total_jeune_hommes += n;
    if (r.division_name === 'JEUNES_FEMMES') stats.total_jeune_femmes += n;
    if (r.division_name === 'AVENIR') stats.total_avenir += n;
  }

  await this.logService.logAction(
    'members-getStatsByStructure',
    admin.id,
    `Consultation des statistiques de la structure ${uuid}`,
  );

  return stats;
}


}

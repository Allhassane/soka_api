import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { CreateMemberDto } from 'src/members/dto/create-member.dto';
import { MemberService } from 'src/members/member.service';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { User } from 'src/users/entities/user.entity';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import { RejectMemberRegistrationDto } from './dto/decide-member-registration.dto';
import {
  MemberRegistrationEntity,
  RegistrationStatus,
  StepDecision,
  ValidationLevel,
} from './entities/member-registration.entity';
import {
  RegistrationAuthorityService,
  SignatureContext,
} from './registration-authority.service';

export interface RegistrationContext {
  userUuid: string;
  /** PK numérique du compte : c'est ce qu'attend `LogActivitiesService`. */
  userId: number;
  isAdmin: boolean;
}

/** Statuts pour lesquels le dossier attend encore une signature. */
const EN_ATTENTE = [
  RegistrationStatus.EN_ATTENTE_DISTRICT,
  RegistrationStatus.EN_ATTENTE_CHAPITRE,
];

/**
 * Plafond de lecture de l'écran « à valider ».
 *
 * Les dossiers en attente se comptent normalement en dizaines. Si ce plafond est atteint, la
 * réponse le **dit** (`scan_truncated`) : une liste tronquée en silence se lirait comme « tout
 * est traité ».
 */
const MAX_PENDING_SCAN = 1000;

/**
 * Circuit de validation d'un enregistrement de membre (`docs/VALIDATION-MEMBRES.md`).
 *
 * ⚠️ **Un dossier n'est pas un membre.** Aucune ligne n'est écrite dans `members` avant la
 * dernière signature : ni matricule, ni compte de connexion. C'est ce qui permet à tous les
 * autres modules (statistiques, exports, bénéficiaires, journal) d'ignorer complètement cette
 * fonctionnalité.
 */
@Injectable()
export class MemberRegistrationService {
  private readonly logger = new Logger(MemberRegistrationService.name);

  constructor(
    @InjectRepository(MemberRegistrationEntity)
    private readonly registrationRepository: Repository<MemberRegistrationEntity>,
    @InjectRepository(StructureEntity)
    private readonly structureRepository: Repository<StructureEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly authority: RegistrationAuthorityService,
    private readonly logActivitiesService: LogActivitiesService,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => MemberService))
    private readonly memberService: MemberService,
  ) {}

  /* ────────────────────────────────── Dépôt ────────────────────────────────── */

  /**
   * Dépose un dossier - ou crée le membre directement si les deux étapes sont acquises d'office
   * (règle R4 : responsable de chapitre et au-dessus, `is_admin`).
   *
   * C'est le **point d'entrée unique** de la création interactive : `POST /members` appelle ici.
   */
  async submit(
    dto: CreateMemberDto,
    ctx: RegistrationContext,
    resumedFrom?: string,
  ): Promise<{
    mode: 'membre_cree' | 'dossier_depose';
    member?: any;
    registration: MemberRegistrationEntity;
    /** Renseigné quand le membre a été créé sans compte de connexion (pas de téléphone). */
    account_skipped?: boolean;
  }> {
    const { plan, district_uuid, chapitre_uuid } =
      await this.authority.planForSubmission(
        ctx.userUuid,
        ctx.isAdmin,
        dto.structure_uuid,
      );

    if (plan.blocked) throw new BadRequestException(plan.blocked);

    await this.assertPhoneFree(dto.phone);
    if (resumedFrom) await this.assertResumable(resumedFrom);

    const base = this.registrationRepository.create({
      status: plan.status,
      payload: { ...dto } as Record<string, any>,
      lastname: dto.lastname ?? null,
      firstname: dto.firstname ?? null,
      phone: dto.phone ?? null,
      structure_uuid: dto.structure_uuid ?? null,
      district_uuid,
      chapitre_uuid,
      submitted_by_user_uuid: ctx.userUuid,
      submitted_at: new Date(),
      district_decision: plan.district,
      chapitre_decision: plan.chapitre,
      resumed_from_uuid: resumedFrom ?? null,
      admin_uuid: ctx.userUuid,
    });

    // ── Cas 1 : les deux étapes sont acquises → on crée le membre tout de suite ──
    if (plan.status === RegistrationStatus.VALIDEE) {
      const { member, registration, account_skipped } = await this.dataSource.transaction(
        async (manager) => {
          const member = await this.memberService.store(dto, ctx.userUuid, { manager });

          base.member_uuid = member.uuid;
          base.validated_at = new Date();
          if (plan.district === StepDecision.ACQUISE) {
            base.district_decided_by_user_uuid = ctx.userUuid;
            base.district_decided_at = new Date();
          }
          if (plan.chapitre === StepDecision.ACQUISE) {
            base.chapitre_decided_by_user_uuid = ctx.userUuid;
            base.chapitre_decided_at = new Date();
          }

          const registration = await manager.save(base);
          const account_skipped = !(await this.hasAccount(member.uuid, manager));

          return { member, registration, account_skipped };
        },
      );

      await this.logActivitiesService.logAction(
        'member_registration.auto_validated',
        ctx.userId,
        { registration_uuid: registration.uuid, member_uuid: member.uuid },
      );

      return { mode: 'membre_cree', member, registration, account_skipped };
    }

    // ── Cas 2 : au moins une signature manque → le dossier attend ──
    const registration = await this.registrationRepository.save(base);

    await this.logActivitiesService.logAction(
      'member_registration.submitted',
      ctx.userId,
      {
        registration_uuid: registration.uuid,
        status: registration.status,
        district_uuid,
        chapitre_uuid,
      },
    );

    return { mode: 'dossier_depose', registration };
  }

  /* ──────────────────────────────── Décisions ──────────────────────────────── */

  /**
   * Signe l'étape courante. Si c'était la dernière, le membre est créé dans la foulée.
   *
   * ⚠️ La séquence (district puis chapitre) n'a pas besoin d'être vérifiée : le `status` **nomme**
   * l'étape attendue, et c'est elle qu'on signe. Un dossier déjà tranché renvoie **409**.
   */
  async approve(uuid: string, ctx: RegistrationContext) {
    const dossier = await this.loadPending(uuid);
    const etape = this.currentStep(dossier);

    const verdict = await this.authority.canSign(
      ctx.userUuid,
      ctx.isAdmin,
      etape,
      dossier,
    );
    if (!verdict.allowed) {
      throw new ForbiddenException(
        `Vous n'êtes pas responsable ${etape === ValidationLevel.DISTRICT ? 'du district' : 'du chapitre'} de ce dossier.`,
      );
    }

    const maintenant = new Date();
    const patch: Partial<MemberRegistrationEntity> =
      etape === ValidationLevel.DISTRICT
        ? {
            district_decision: StepDecision.APPROUVEE,
            district_decided_by_user_uuid: ctx.userUuid,
            district_decided_at: maintenant,
            district_by_delegation: verdict.by_delegation,
          }
        : {
            chapitre_decision: StepDecision.APPROUVEE,
            chapitre_decided_by_user_uuid: ctx.userUuid,
            chapitre_decided_at: maintenant,
            chapitre_by_delegation: verdict.by_delegation,
          };

    const resteChapitre =
      etape === ValidationLevel.DISTRICT &&
      dossier.chapitre_decision === StepDecision.EN_ATTENTE;

    // ── Il reste une signature : on avance d'une étape, rien n'est créé ──
    if (resteChapitre) {
      await this.registrationRepository.update(
        { uuid: dossier.uuid },
        { ...patch, status: RegistrationStatus.EN_ATTENTE_CHAPITRE },
      );

      await this.logActivitiesService.logAction(
        'member_registration.district_approved',
        ctx.userId,
        { registration_uuid: dossier.uuid, by_delegation: verdict.by_delegation },
      );

      return this.findOne(dossier.uuid, ctx);
    }

    // ── Dernière signature : création du membre, matricule et compte compris ──
    const { member, account_skipped } = await this.finalize(dossier, patch, ctx);

    await this.logActivitiesService.logAction(
      'member_registration.validated',
      ctx.userId,
      {
        registration_uuid: dossier.uuid,
        member_uuid: member.uuid,
        by_delegation: verdict.by_delegation,
      },
    );

    return { ...(await this.findOne(dossier.uuid, ctx)), member, account_skipped };
  }

  /**
   * Création effective du membre, **en transaction** (règles R8 et R9).
   *
   * Les contrôles de saisie sont rejoués ici parce que la base a pu bouger depuis le dépôt :
   * `MemberService.store()` revalide civilité, structure et périmètre, et le téléphone est
   * revérifié juste avant - sinon on créerait un membre **sans compte de connexion**, c'est-à-dire
   * un membre qui ressemble à tous les autres mais ne peut jamais se connecter.
   */
  private async finalize(
    dossier: MemberRegistrationEntity,
    patch: Partial<MemberRegistrationEntity>,
    ctx: RegistrationContext,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const frais = await manager.findOne(MemberRegistrationEntity, {
        where: { uuid: dossier.uuid },
        lock: { mode: 'pessimistic_write' },
      });
      if (!frais || !EN_ATTENTE.includes(frais.status)) {
        throw new ConflictException('Ce dossier a déjà été traité.');
      }

      await this.assertPhoneFree(frais.phone, manager);

      const member = await this.memberService.store(
        frais.payload as CreateMemberDto,
        // Auteur = le déposant : c'est lui qui a saisi la fiche, pas le signataire.
        frais.submitted_by_user_uuid,
        // Le périmètre du déposant a déjà été vérifié au dépôt, et l'autorité du signataire
        // vient d'être vérifiée par R5. Le rejouer ici bloquerait un dossier légitime dont le
        // déposant a changé de structure entre-temps.
        { manager, scopeAlreadyChecked: true },
      );

      await manager.update(
        MemberRegistrationEntity,
        { uuid: frais.uuid },
        {
          ...patch,
          status: RegistrationStatus.VALIDEE,
          member_uuid: member.uuid,
          validated_at: new Date(),
        },
      );

      const account_skipped = !(await this.hasAccount(member.uuid, manager));
      if (account_skipped) {
        // Pas bloquant (le membre existe et peut recevoir un compte plus tard), mais jamais
        // silencieux : c'est l'angle mort qui avait laissé 360 membres sans connexion.
        this.logger.warn(
          `[VALIDATION] Membre ${member.uuid} créé SANS compte de connexion (dossier ${frais.uuid}) - téléphone absent.`,
        );
      }

      return { member, account_skipped };
    });
  }

  /** Refus - définitif (règle R7). */
  async reject(
    uuid: string,
    dto: RejectMemberRegistrationDto,
    ctx: RegistrationContext,
  ) {
    const dossier = await this.loadPending(uuid);
    const etape = this.currentStep(dossier);

    const verdict = await this.authority.canSign(
      ctx.userUuid,
      ctx.isAdmin,
      etape,
      dossier,
    );
    if (!verdict.allowed) {
      throw new ForbiddenException(
        `Vous n'êtes pas responsable ${etape === ValidationLevel.DISTRICT ? 'du district' : 'du chapitre'} de ce dossier.`,
      );
    }

    const maintenant = new Date();
    const patch: Partial<MemberRegistrationEntity> =
      etape === ValidationLevel.DISTRICT
        ? {
            district_decision: StepDecision.REFUSEE,
            district_decided_by_user_uuid: ctx.userUuid,
            district_decided_at: maintenant,
            district_by_delegation: verdict.by_delegation,
          }
        : {
            chapitre_decision: StepDecision.REFUSEE,
            chapitre_decided_by_user_uuid: ctx.userUuid,
            chapitre_decided_at: maintenant,
            chapitre_by_delegation: verdict.by_delegation,
          };

    // Un refus au chapitre annule la validation du district : elle reste tracée (audit) mais
    // n'a plus d'effet. Le dossier est clos, pas renvoyé à l'étape précédente.
    await this.registrationRepository.update(
      { uuid: dossier.uuid },
      {
        ...patch,
        status: RegistrationStatus.REFUSEE,
        refusal_level: etape,
        refusal_comment: dto.comment,
      },
    );

    await this.logActivitiesService.logAction(
      'member_registration.rejected',
      ctx.userId,
      { registration_uuid: dossier.uuid, level: etape, comment: dto.comment },
    );

    return this.findOne(dossier.uuid, ctx);
  }

  /** Retrait par le déposant, tant qu'aucun signataire ne s'est prononcé (règle R14). */
  async cancel(uuid: string, ctx: RegistrationContext) {
    const dossier = await this.loadPending(uuid);

    if (!ctx.isAdmin && dossier.submitted_by_user_uuid !== ctx.userUuid) {
      throw new ForbiddenException('Seul le déposant peut retirer son dossier.');
    }

    const dejaDecide =
      dossier.district_decision === StepDecision.APPROUVEE ||
      dossier.chapitre_decision === StepDecision.APPROUVEE;
    if (dejaDecide) {
      throw new ConflictException(
        'Ce dossier a déjà été validé à un niveau : il ne peut plus être retiré.',
      );
    }

    await this.registrationRepository.update(
      { uuid: dossier.uuid },
      { status: RegistrationStatus.ANNULEE },
    );

    await this.logActivitiesService.logAction(
      'member_registration.cancelled',
      ctx.userId,
      { registration_uuid: dossier.uuid },
    );

    return this.findOne(dossier.uuid, ctx);
  }

  /* ──────────────────────────────── Lectures ──────────────────────────────── */

  /**
   * Dossiers que **je** peux signer maintenant.
   *
   * Tri **du plus ancien au plus récent** : sans notification, l'ancienneté est le seul signal
   * qui distingue un dossier oublié d'un dossier récent (R13).
   */
  async pending(ctx: RegistrationContext, page = 1, limit = 15) {
    const { dossiers, tronque } = await this.scanPending();
    const signatureCtx = await this.authority.signatureContext();

    const signables = dossiers.filter(
      (d) =>
        this.authority.verdictFor(
          signatureCtx,
          ctx.userUuid,
          ctx.isAdmin,
          this.currentStep(d),
          d,
        ).allowed,
    );

    const total = signables.length;
    const page_data = signables.slice((page - 1) * limit, page * limit);

    return {
      data: await this.decorate(page_data, signatureCtx, ctx),
      meta: buildPaginationMeta({ total, page, perPage: limit }),
      scan_truncated: tronque,
    };
  }

  /** Compteur du badge de menu. */
  async countPending(ctx: RegistrationContext): Promise<{ count: number }> {
    const { dossiers } = await this.scanPending();
    const signatureCtx = await this.authority.signatureContext();

    return {
      count: dossiers.filter(
        (d) =>
          this.authority.verdictFor(
            signatureCtx,
            ctx.userUuid,
            ctx.isAdmin,
            this.currentStep(d),
            d,
          ).allowed,
      ).length,
    };
  }

  /** Mes dossiers déposés, tous statuts confondus - le plus récent d'abord. */
  async mine(
    ctx: RegistrationContext,
    page = 1,
    limit = 15,
    status?: RegistrationStatus,
  ) {
    const [dossiers, total] = await this.registrationRepository.findAndCount({
      where: {
        submitted_by_user_uuid: ctx.userUuid,
        ...(status ? { status } : {}),
      },
      order: { submitted_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const signatureCtx = await this.authority.signatureContext();

    return {
      data: await this.decorate(dossiers, signatureCtx, ctx),
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
  }

  /** Détail d'un dossier : le déposant, ceux qui peuvent le signer, et les admins. */
  async findOne(uuid: string, ctx: RegistrationContext) {
    const dossier = await this.registrationRepository.findOne({ where: { uuid } });
    if (!dossier) throw new NotFoundException('Dossier introuvable.');

    const signatureCtx = await this.authority.signatureContext();

    const peutVoir =
      ctx.isAdmin ||
      dossier.submitted_by_user_uuid === ctx.userUuid ||
      [ValidationLevel.DISTRICT, ValidationLevel.CHAPITRE].some(
        (niveau) =>
          this.authority.verdictFor(signatureCtx, ctx.userUuid, ctx.isAdmin, niveau, dossier)
            .allowed,
      );

    if (!peutVoir) {
      throw new ForbiddenException("Ce dossier n'est pas dans votre périmètre.");
    }

    const [decore] = await this.decorate([dossier], signatureCtx, ctx);
    return { ...decore, payload: dossier.payload };
  }

  /* ──────────────────────────────── Interne ──────────────────────────────── */

  /** Étape que le dossier attend, déduite de son statut. */
  private currentStep(dossier: MemberRegistrationEntity): ValidationLevel {
    return dossier.status === RegistrationStatus.EN_ATTENTE_DISTRICT
      ? ValidationLevel.DISTRICT
      : ValidationLevel.CHAPITRE;
  }

  private async loadPending(uuid: string): Promise<MemberRegistrationEntity> {
    const dossier = await this.registrationRepository.findOne({ where: { uuid } });
    if (!dossier) throw new NotFoundException('Dossier introuvable.');
    if (!EN_ATTENTE.includes(dossier.status)) {
      throw new ConflictException(
        `Ce dossier n'est plus en attente (statut : ${dossier.status}).`,
      );
    }
    return dossier;
  }

  private async scanPending() {
    const dossiers = await this.registrationRepository.find({
      where: { status: In(EN_ATTENTE) },
      order: { submitted_at: 'ASC' },
      take: MAX_PENDING_SCAN,
    });

    const tronque = dossiers.length === MAX_PENDING_SCAN;
    if (tronque) {
      this.logger.warn(
        `[VALIDATION] ${MAX_PENDING_SCAN} dossiers en attente lus : la liste est tronquée.`,
      );
    }

    return { dossiers, tronque };
  }

  /**
   * R10 - un numéro ne peut pas porter deux dossiers en attente, ni un dossier et un compte.
   *
   * Le téléphone **est** l'identifiant de connexion : deux membres sur un même numéro rendent la
   * connexion ambiguë, et `users.phone_number` n'a aucun index UNIQUE pour l'empêcher.
   */
  private async assertPhoneFree(
    phone: string | null | undefined,
    manager?: EntityManager,
  ): Promise<void> {
    if (!phone) return;

    const registrationRepo = manager
      ? manager.getRepository(MemberRegistrationEntity)
      : this.registrationRepository;
    const userRepo = manager ? manager.getRepository(User) : this.userRepository;

    const dossier = await registrationRepo.findOne({
      where: { phone, status: In(EN_ATTENTE) },
    });
    if (dossier) {
      throw new ConflictException(
        'Un dossier en attente de validation porte déjà ce numéro de téléphone.',
      );
    }

    const compte = await userRepo.findOne({ where: { phone_number: phone } });
    if (compte) {
      throw new ConflictException(
        'Ce numéro de téléphone est déjà utilisé par un compte existant.',
      );
    }
  }

  /** Un dossier ne se reprend que s'il est clos (règle R7b) - jamais un dossier vivant. */
  private async assertResumable(uuid: string): Promise<void> {
    const source = await this.registrationRepository.findOne({ where: { uuid } });
    if (!source) throw new NotFoundException('Dossier repris introuvable.');
    if (EN_ATTENTE.includes(source.status)) {
      throw new ConflictException(
        'Ce dossier est encore en attente : il ne peut pas être repris.',
      );
    }
  }

  private async hasAccount(
    memberUuid: string,
    manager: EntityManager,
  ): Promise<boolean> {
    const compte = await manager.getRepository(User).findOne({
      where: { member_uuid: memberUuid },
    });
    return !!compte;
  }

  /**
   * Ajoute ce qu'il faut à une liste : noms des structures, ancienneté, étape courante, et si
   * **moi** je peux signer (et par suppléance ou non).
   */
  private async decorate(
    dossiers: MemberRegistrationEntity[],
    signatureCtx: SignatureContext,
    ctx: RegistrationContext,
  ) {
    if (dossiers.length === 0) return [];

    const uuids = [
      ...new Set(
        dossiers.flatMap((d) => [d.district_uuid, d.chapitre_uuid, d.structure_uuid]),
      ),
    ].filter(Boolean) as string[];

    const structures = uuids.length
      ? await this.structureRepository.find({
          where: { uuid: In(uuids) },
          select: ['uuid', 'name'],
        })
      : [];
    const nom = new Map(structures.map((s) => [s.uuid, s.name]));

    const maintenant = Date.now();

    return dossiers.map((d) => {
      const enAttente = EN_ATTENTE.includes(d.status);
      const etape = this.currentStep(d);
      const verdict = enAttente
        ? this.authority.verdictFor(signatureCtx, ctx.userUuid, ctx.isAdmin, etape, d)
        : { allowed: false, by_delegation: false };

      return {
        uuid: d.uuid,
        status: d.status,
        firstname: d.firstname,
        lastname: d.lastname,
        phone: d.phone,
        structure_uuid: d.structure_uuid,
        structure_name: d.structure_uuid ? (nom.get(d.structure_uuid) ?? null) : null,
        district_uuid: d.district_uuid,
        district_name: d.district_uuid ? (nom.get(d.district_uuid) ?? null) : null,
        chapitre_uuid: d.chapitre_uuid,
        chapitre_name: d.chapitre_uuid ? (nom.get(d.chapitre_uuid) ?? null) : null,
        submitted_by_user_uuid: d.submitted_by_user_uuid,
        submitted_at: d.submitted_at,
        /** Ancienneté en jours : le signal qui remplace les notifications (R13). */
        age_days: Math.floor(
          (maintenant - new Date(d.submitted_at).getTime()) / 86_400_000,
        ),
        current_step: enAttente ? etape : null,
        district_decision: d.district_decision,
        district_decided_by_user_uuid: d.district_decided_by_user_uuid,
        district_decided_at: d.district_decided_at,
        district_by_delegation: d.district_by_delegation,
        chapitre_decision: d.chapitre_decision,
        chapitre_decided_by_user_uuid: d.chapitre_decided_by_user_uuid,
        chapitre_decided_at: d.chapitre_decided_at,
        chapitre_by_delegation: d.chapitre_by_delegation,
        refusal_level: d.refusal_level,
        refusal_comment: d.refusal_comment,
        resumed_from_uuid: d.resumed_from_uuid,
        member_uuid: d.member_uuid,
        validated_at: d.validated_at,
        /** Puis-je signer ce dossier maintenant, et à quel titre ? */
        can_sign: verdict.allowed,
        would_be_delegation: verdict.by_delegation,
      };
    });
  }
}

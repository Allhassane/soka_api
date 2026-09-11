import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, FindOperator, Repository } from 'typeorm';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { MemberService } from 'src/members/member.service';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { User } from 'src/users/entities/user.entity';
import { MemberRegistrationService } from './member-registration.service';
import { RegistrationAuthorityService } from './registration-authority.service';
import {
  MemberRegistrationEntity,
  RegistrationStatus,
  StepDecision,
} from './entities/member-registration.entity';

/**
 * Règle **R10** au moment de la signature finale (`docs/VALIDATION-MEMBRES.md`).
 *
 * `finalize()` rejoue le contrôle « ce téléphone est libre » avant de créer le membre, parce que
 * la base a pu bouger depuis le dépôt. Le piège : à cet instant le dossier qu'on valide est
 * **lui-même** encore en attente avec ce téléphone. Sans exclusion explicite, il se retrouve
 * lui-même et toute dernière signature échoue en 409 - le circuit se bloque au 2e niveau.
 */

/** Émulation minimale des opérateurs TypeORM utilisés par le service (`In`, `Not`). */
function matchValue(value: unknown, cond: unknown): boolean {
  if (cond instanceof FindOperator) {
    switch (cond.type) {
      case 'in':
        return (cond.value as unknown[]).includes(value);
      case 'not':
        return !matchValue(value, cond.value);
      default:
        throw new Error(`Opérateur non géré dans ce test : ${cond.type}`);
    }
  }
  return value === cond;
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([champ, cond]) => matchValue(row[champ], cond));
}

const PHONE = '0700000001';

function dossierEnAttenteChapitre(
  surcharge: Partial<MemberRegistrationEntity> = {},
): MemberRegistrationEntity {
  return {
    uuid: 'reg-1',
    status: RegistrationStatus.EN_ATTENTE_CHAPITRE,
    phone: PHONE,
    payload: { phone: PHONE, structure_uuid: 'str-1' },
    lastname: 'Kouassi',
    firstname: 'Ama',
    structure_uuid: 'str-1',
    district_uuid: 'dis-1',
    chapitre_uuid: 'cha-1',
    submitted_by_user_uuid: 'user-deposant',
    submitted_at: new Date(),
    district_decision: StepDecision.APPROUVEE,
    chapitre_decision: StepDecision.EN_ATTENTE,
    ...surcharge,
  } as MemberRegistrationEntity;
}

function build(dossiers: MemberRegistrationEntity[], comptes: Partial<User>[] = []) {
  const registrationRepo = {
    findOne: jest.fn(async ({ where }: any) => dossiers.find((d) => matches(d as any, where)) ?? null),
    update: jest.fn(async ({ uuid }: any, patch: any) => {
      Object.assign(dossiers.find((d) => d.uuid === uuid) as any, patch);
    }),
  };

  const userRepo = {
    findOne: jest.fn(async ({ where }: any) => comptes.find((c) => matches(c as any, where)) ?? null),
  };

  const manager = {
    findOne: jest.fn(async (_entity: unknown, { where }: any) =>
      dossiers.find((d) => matches(d as any, where)) ?? null,
    ),
    update: jest.fn(async (_entity: unknown, { uuid }: any, patch: any) => {
      Object.assign(dossiers.find((d) => d.uuid === uuid) as any, patch);
    }),
    getRepository: jest.fn((entity: unknown) =>
      entity === MemberRegistrationEntity ? registrationRepo : userRepo,
    ),
  } as unknown as EntityManager;

  const store = jest.fn(async () => ({ uuid: 'membre-1' }));

  const service = new MemberRegistrationService(
    registrationRepo as unknown as Repository<MemberRegistrationEntity>,
    { find: jest.fn(async () => []) } as unknown as Repository<StructureEntity>,
    userRepo as unknown as Repository<User>,
    {
      canSign: jest.fn(async () => ({ allowed: true, by_delegation: false })),
      signatureContext: jest.fn(async () => ({})),
      // Le signataire a autorité sur ce dossier : c'est ce qui lui ouvre aussi la relecture.
      verdictFor: jest.fn(() => ({ allowed: true, by_delegation: false })),
    } as unknown as RegistrationAuthorityService,
    { logAction: jest.fn() } as unknown as LogActivitiesService,
    { transaction: jest.fn(async (cb: any) => cb(manager)) } as unknown as DataSource,
    { store } as unknown as MemberService,
  );

  return { service, store, dossiers };
}

const CTX = { userUuid: 'user-signataire', userId: 42, isAdmin: false };

describe('MemberRegistrationService.approve - R10 à la signature finale', () => {
  it('valide le dossier : son propre téléphone n’est pas un doublon de lui-même', async () => {
    const { service, store, dossiers } = build([dossierEnAttenteChapitre()]);

    const resultat = (await service.approve('reg-1', CTX)) as { member: { uuid: string } };

    expect(store).toHaveBeenCalledTimes(1);
    expect(dossiers[0].status).toBe(RegistrationStatus.VALIDEE);
    expect(resultat.member).toEqual({ uuid: 'membre-1' });
  });

  it('refuse toujours un AUTRE dossier en attente sur le même téléphone', async () => {
    const { service, store } = build([
      dossierEnAttenteChapitre(),
      dossierEnAttenteChapitre({
        uuid: 'reg-2',
        status: RegistrationStatus.EN_ATTENTE_DISTRICT,
      }),
    ]);

    await expect(service.approve('reg-1', CTX)).rejects.toThrow(ConflictException);
    expect(store).not.toHaveBeenCalled();
  });

  it('refuse toujours un compte existant sur le même téléphone', async () => {
    const { service, store } = build([dossierEnAttenteChapitre()], [
      { phone_number: PHONE } as Partial<User>,
    ]);

    await expect(service.approve('reg-1', CTX)).rejects.toThrow(ConflictException);
    expect(store).not.toHaveBeenCalled();
  });
});

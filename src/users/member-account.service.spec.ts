/// <reference types="jest" />
import { MemberAccountService } from './member-account.service';

/**
 * Règle du compte de connexion d'un membre, partagée par le formulaire (`MemberService`)
 * et par l'import Excel (`ImportService`).
 *
 * Ce qui est verrouillé ici : (1) un membre importé ou créé **repart toujours avec un
 * compte** quand son numéro est libre - c'est l'écart qui avait laissé 360 membres
 * incapables de se connecter ; (2) on ne fabrique jamais deux comptes sur un même numéro
 * (la base n'a **aucun** index UNIQUE sur `users.phone_number` pour l'empêcher) ;
 * (3) le compte est écrit via l'entité, jamais en SQL brut - le hachage du mot de passe est
 * un hook `@BeforeInsert`.
 */

const MEMBER = {
  uuid: 'm-1',
  firstname: 'AMANI',
  lastname: 'KONAN',
  email: 'amani@example.ci',
  phone: '0700000001',
};

/** EntityManager minimal : `findOne(Entity, {where})` piloté par les lignes fournies. */
function makeDb(rows: any[] = []) {
  const save = jest.fn(async (e: any) => e);
  const findOne = jest.fn(async (_entity: any, opts: any) => {
    const where = opts?.where ?? {};
    return (
      rows.find((r) =>
        Object.entries(where).every(([k, v]) => (r as any)[k] === v),
      ) ?? null
    );
  });
  return { save, findOne } as any;
}

function makeService() {
  const create = jest.fn((data: any) => ({ ...data }));
  const service = new MemberAccountService({ create, manager: makeDb() } as any);
  return { service, create };
}

describe('MemberAccountService.reconcileAccount', () => {
  it('crée le compte quand le membre a un téléphone libre', async () => {
    const { service, create } = makeService();
    const db = makeDb();

    await expect(service.reconcileAccount(MEMBER, db)).resolves.toBe('created');

    // Via l'entité (create + save) : un INSERT SQL contournerait le hook @BeforeInsert et
    // stockerait le mot de passe EN CLAIR.
    expect(create).toHaveBeenCalledTimes(1);
    const account = create.mock.calls[0][0];
    expect(account.phone_number).toBe(MEMBER.phone);
    expect(account.member_uuid).toBe(MEMBER.uuid);
    expect(account.is_active).toBe(true);
    // Le vrai mot de passe part au 1er login (SMS) : le compte naît au défaut.
    expect(account.must_change_password).toBe(true);
    expect(db.save).toHaveBeenCalledTimes(1);
  });

  it('ne crée pas de compte sans téléphone (le numéro EST l identifiant de connexion)', async () => {
    const { service, create } = makeService();
    const db = makeDb();

    await expect(
      service.reconcileAccount({ ...MEMBER, phone: '' }, db),
    ).resolves.toBe('skipped_no_phone');
    expect(create).not.toHaveBeenCalled();
    expect(db.save).not.toHaveBeenCalled();
  });

  it('ne crée pas un 2e compte sur un numéro déjà pris', async () => {
    const { service, create } = makeService();
    const db = makeDb([
      { uuid: 'u-autre', phone_number: MEMBER.phone, member_uuid: 'm-autre' },
    ]);

    await expect(service.reconcileAccount(MEMBER, db)).resolves.toBe(
      'skipped_phone_taken',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('retombe sur un e-mail vide quand celui du membre est déjà pris (colonne UNIQUE)', async () => {
    const { service, create } = makeService();
    const db = makeDb([
      { uuid: 'u-autre', phone_number: '0700000099', email: MEMBER.email },
    ]);

    // Doit créer quand même : l'e-mail est accessoire, le téléphone est l'identifiant.
    await expect(service.reconcileAccount(MEMBER, db)).resolves.toBe('created');
    expect(create.mock.calls[0][0].email).toBeUndefined();
  });

  it('crée le compte d un membre EXISTANT qui n en avait pas (rattrapage au ré-import)', async () => {
    const { service } = makeService();
    const db = makeDb([
      { uuid: 'u-1', phone_number: '0700000042', member_uuid: 'm-autre' },
    ]);

    await expect(service.reconcileAccount(MEMBER, db)).resolves.toBe('created');
  });

  it('réaligne le téléphone de connexion quand la fiche change', async () => {
    const { service } = makeService();
    const linked = {
      uuid: 'u-1',
      member_uuid: MEMBER.uuid,
      firstname: 'AMANI',
      lastname: 'KONAN',
      email: MEMBER.email,
      phone_number: '0700000000',
    };
    const db = makeDb([linked]);

    await expect(service.reconcileAccount(MEMBER, db)).resolves.toBe('updated');
    expect(linked.phone_number).toBe(MEMBER.phone);
    expect(db.save).toHaveBeenCalledTimes(1);
  });

  it('NE déplace PAS le téléphone sur un numéro porté par un autre compte', async () => {
    const { service } = makeService();
    const linked = {
      uuid: 'u-1',
      member_uuid: MEMBER.uuid,
      firstname: MEMBER.firstname,
      lastname: MEMBER.lastname,
      email: MEMBER.email,
      phone_number: '0700000000',
    };
    const autre = {
      uuid: 'u-2',
      member_uuid: 'm-2',
      phone_number: MEMBER.phone,
    };
    const db = makeDb([linked, autre]);

    const outcome = await service.reconcileAccount(MEMBER, db);

    // Deux comptes sur un même numéro rendraient la connexion ambiguë, et rien en base ne
    // l'empêche (pas d'index UNIQUE) : on garde l'ancien identifiant.
    expect(linked.phone_number).toBe('0700000000');
    expect(outcome).toBe('unchanged');
  });

  it('ne réécrit rien quand le compte est déjà aligné', async () => {
    const { service } = makeService();
    const db = makeDb([
      {
        uuid: 'u-1',
        member_uuid: MEMBER.uuid,
        firstname: MEMBER.firstname,
        lastname: MEMBER.lastname,
        email: MEMBER.email,
        phone_number: MEMBER.phone,
      },
    ]);

    await expect(service.reconcileAccount(MEMBER, db)).resolves.toBe('unchanged');
    expect(db.save).not.toHaveBeenCalled();
  });
});

/// <reference types="jest" />
import { BadRequestException } from '@nestjs/common';
import { UserRoleService } from './user-roles.service';

/**
 * Ce que ces tests verrouillent :
 *
 * 1. **Les rôles SOCLE ne s'attribuent pas à la main.** MEMBRE et RESPONSABLE sont recalculés
 *    à chaque connexion : une attribution manuelle disparaîtrait au login suivant, sans que
 *    personne ne comprenne pourquoi. ADMINISTRATEUR est bloqué pour une autre raison - il
 *    ouvre toutes les permissions, ce serait un chemin d'élévation de privilèges discret.
 * 2. **Le cache de droits est invalidé** à chaque attribution et à chaque retrait. Un retrait
 *    est un geste de sécurité : il ne peut pas attendre l'expiration d'un TTL.
 * 3. **Un rôle retiré peut être redonné** : la ligne soft-deletée est ressuscitée, pas
 *    doublée - et l'unicité ne doit pas la confondre avec une attribution vivante.
 */

const ROLE_METIER = { uuid: 'r-compta', name: 'COMPTABLE', slug: 'comptable' };

function makeService(
  opts: { role?: any; ligneRetiree?: any; ligneCourante?: any; lignesMembre?: any[] } = {},
) {
  const role = 'role' in opts ? opts.role : ROLE_METIER;
  const invalider = jest.fn();
  const save = jest.fn(async (x: any) => ({ ...x, id: 1, uuid: 'ur-1' }));
  const restore = jest.fn(async () => undefined);
  const update = jest.fn(async () => undefined);
  const softDelete = jest.fn(async () => undefined);

  // ⚠️ Le service lance DEUX requêtes différentes sur ce QueryBuilder : le contrôle d'unicité
  // (qui filtre `deleted_at IS NULL`) et la recherche d'une ligne retirée (`withDeleted()`).
  // Un mock qui répond la même chose aux deux ferait échouer la résurrection sur un faux
  // « déjà assigné » - exactement le bug que ce test doit détecter s'il revenait.
  let avecSupprimees = false;
  const qb: any = {
    withDeleted: () => {
      avecSupprimees = true;
      return qb;
    },
    innerJoin: () => qb,
    where: () => qb,
    andWhere: () => qb,
    getOne: jest.fn(async () => {
      const r = avecSupprimees ? (opts.ligneRetiree ?? null) : null;
      avecSupprimees = false;
      return r;
    }),
  };

  const userRoleRepo: any = {
    createQueryBuilder: () => qb,
    create: (x: any) => x,
    save,
    restore,
    update,
    softDelete,
    findOneByOrFail: jest.fn(async () => ({ id: 1, uuid: 'ur-1' })),
    findOne: jest.fn(
      async () => opts.ligneCourante ?? { id: 9, uuid: 'ur-9', user_uuid: 'u-1' },
    ),
    manager: { query: jest.fn(async () => opts.lignesMembre ?? []) },
  };
  const userRepo: any = { findOneBy: jest.fn(async () => ({ uuid: 'u-1' })) };
  const roleRepo: any = { findOneBy: jest.fn(async () => role) };

  const service = new UserRoleService(userRoleRepo, userRepo, roleRepo, {
    invalider,
  } as any);
  return { service, invalider, save, restore, softDelete, qb, userRoleRepo };
}

describe('UserRoleService - attribution manuelle', () => {
  it.each([
    ['administrateur', 'ADMINISTRATEUR'],
    ['membre', 'MEMBRE'],
    ['responsable', 'RESPONSABLE'],
  ])('refuse le rôle socle %s', async (slug, name) => {
    const { service, save } = makeService({ role: { uuid: 'r-x', name, slug } });

    await expect(
      service.create({ user_uuid: 'u-1', role_uuid: 'r-x' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Rien n'a été écrit : le refus est un refus, pas un enregistrement silencieux.
    expect(save).not.toHaveBeenCalled();
  });

  it("explique POURQUOI le rôle est refusé (l'administrateur doit comprendre, pas contourner)", async () => {
    const { service } = makeService({
      role: { uuid: 'r-a', name: 'ADMINISTRATEUR', slug: 'administrateur' },
    });
    await expect(
      service.create({ user_uuid: 'u-1', role_uuid: 'r-a' } as any),
    ).rejects.toThrow(/toutes les permissions/i);

    const socle = makeService({
      role: { uuid: 'r-m', name: 'MEMBRE', slug: 'membre' },
    });
    await expect(
      socle.service.create({ user_uuid: 'u-1', role_uuid: 'r-m' } as any),
    ).rejects.toThrow(/calculé automatiquement/i);
  });

  it('accepte un rôle métier et invalide le cache de droits', async () => {
    const { service, save, invalider } = makeService();

    await service.create({ user_uuid: 'u-1', role_uuid: 'r-compta' } as any);

    expect(save).toHaveBeenCalledTimes(1);
    // ⚠️ Sans invalidation, le droit met jusqu'à 30 s à s'appliquer et le geste paraît sans effet.
    expect(invalider).toHaveBeenCalledWith('u-1');
  });

  it('ressuscite une attribution retirée au lieu d’empiler une seconde ligne', async () => {
    const { service, restore, save, invalider } = makeService({
      ligneRetiree: { id: 42, uuid: 'ur-42' },
    });

    await service.create({ user_uuid: 'u-1', role_uuid: 'r-compta' } as any);

    expect(restore).toHaveBeenCalledWith({ id: 42 });
    // Aucune insertion : la table n'a pas d'index unique, les doublons ne seraient pas rattrapés.
    expect(save).not.toHaveBeenCalled();
    expect(invalider).toHaveBeenCalledWith('u-1');
  });

  it('invalide le cache au RETRAIT', async () => {
    const { service, invalider, softDelete } = makeService();

    await service.softDelete('ur-9');

    expect(softDelete).toHaveBeenCalledWith({ id: 9 });
    expect(invalider).toHaveBeenCalledWith('u-1');
  });
});

describe('UserRoleService - recherche de candidats', () => {
  it('ne cherche rien en dessous de 2 caractères', async () => {
    const { service, userRoleRepo } = makeService();

    expect(await service.candidats('r-compta', 'a')).toEqual([]);
    expect(await service.candidats('r-compta', ' ')).toEqual([]);
    // Aucune requête : une lettre seule ramènerait des milliers de comptes.
    expect(userRoleRepo.manager.query).not.toHaveBeenCalled();
  });

  it('interroge la base dès 2 caractères', async () => {
    const { service, userRoleRepo } = makeService();

    await service.candidats('r-compta', 'ko');

    expect(userRoleRepo.manager.query).toHaveBeenCalledTimes(1);
    const [sql, params] = userRoleRepo.manager.query.mock.calls[0];
    // Le titulaire actuel doit être exclu, et la liste bornée.
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('LIMIT 20');
    expect(params).toContain('%ko%');
  });
});

/**
 * **Le rôle SOCLE ne se retire pas non plus.**
 *
 * 🚨 L'attribution était gardée (`assertRoleAttribuable`), le RETRAIT ne l'était pas : rien
 * n'empêchait un appel direct de supprimer la ligne MEMBRE ou RESPONSABLE d'une personne, qui
 * perdait alors ses droits jusqu'à sa prochaine connexion (le socle est resemé au login).
 * Masquer le bouton côté écran ne protège pas la route - la règle doit vivre ici.
 */
describe('UserRoleService - retrait', () => {
  const ligneSocle = (slug: string, name: string) => ({
    id: 7,
    uuid: 'ur-socle',
    user_uuid: 'u-1',
    role: { uuid: 'r-s', name, slug },
  });

  it.each([
    ['administrateur', 'ADMINISTRATEUR'],
    ['membre', 'MEMBRE'],
    ['responsable', 'RESPONSABLE'],
  ])('refuse de retirer le rôle socle %s', async (slug, name) => {
    const { service, softDelete, invalider } = makeService({
      ligneCourante: ligneSocle(slug, name),
    });

    await expect(service.softDelete('ur-socle')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    // Rien n'a été retiré, et le cache n'a pas bougé : un refus n'est pas un demi-geste.
    expect(softDelete).not.toHaveBeenCalled();
    expect(invalider).not.toHaveBeenCalled();
  });

  it('explique POURQUOI le socle ne se retire pas', async () => {
    const { service } = makeService({ ligneCourante: ligneSocle('membre', 'MEMBRE') });

    await expect(service.softDelete('ur-socle')).rejects.toThrow(/socle|calcul/i);
  });

  it('retire normalement un rôle métier', async () => {
    const { service, softDelete, invalider } = makeService({
      ligneCourante: {
        id: 7,
        uuid: 'ur-compta',
        user_uuid: 'u-1',
        role: ROLE_METIER,
      },
    });

    await service.softDelete('ur-compta');

    expect(softDelete).toHaveBeenCalledWith({ id: 7 });
    expect(invalider).toHaveBeenCalledWith('u-1');
  });
});

/**
 * **Les rôles d'un membre** - ce que l'onglet « Rôles » de la fiche affiche.
 *
 * La route part du membre, pas du compte : c'est l'uuid que porte l'écran. Chaque ligne dit si
 * le rôle est un socle, parce que c'est ce qui décide de l'affichage du bouton « Retirer ».
 */
describe('UserRoleService - rôles d’un membre', () => {
  it('marque les rôles socle, et eux seuls', async () => {
    const { service } = makeService({
      lignesMembre: [
        { user_role_uuid: 'ur-1', role_slug: 'membre', role_name: 'MEMBRE' },
        { user_role_uuid: 'ur-2', role_slug: 'comptable', role_name: 'COMPTABLE' },
      ],
    });

    const lignes = await service.rolesDuMembre('m-1');

    expect(lignes.map((l: any) => l.est_socle)).toEqual([true, false]);
  });

  it('interroge la base sur le MEMBRE et écarte les attributions retirées', async () => {
    const { service, userRoleRepo } = makeService();

    await service.rolesDuMembre('m-1');

    expect(userRoleRepo.manager.query).toHaveBeenCalledTimes(1);
    const [sql, params] = userRoleRepo.manager.query.mock.calls[0];
    expect(sql).toContain('member_uuid');
    expect(sql).toContain('ur.deleted_at IS NULL');
    expect(params).toContain('m-1');
  });

  it('rend une liste vide pour un membre sans compte, sans lever', async () => {
    const { service } = makeService({ lignesMembre: [] });

    await expect(service.rolesDuMembre('m-sans-compte')).resolves.toEqual([]);
  });
});

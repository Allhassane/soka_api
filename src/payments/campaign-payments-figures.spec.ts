import { In } from 'typeorm';
import {
  appliquerPerimetreBeneficiaire,
  chiffresReussis,
} from './campaign-payments-figures';
import { observationFiches, retablirFichesSupprimees } from './fiches-supprimees';

/**
 * RESPO-COMPTA-REGUL (2026-09-27) : UNE définition des chiffres financiers pour les responsables,
 * celle de la Comptabilité - `payments.payment_status = 'paid'`, `total_amount`, `source_uuid` -,
 * bornée au périmètre canonique par la structure du BÉNÉFICIAIRE.
 */
function qbFactice(brut: Record<string, string> = {}) {
  const appels: Array<[string, unknown?]> = [];
  const qb: any = {
    appels,
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    where: jest.fn((c: string, p?: unknown) => { appels.push([c, p]); return qb; }),
    andWhere: jest.fn((c: string, p?: unknown) => { appels.push([c, p]); return qb; }),
    getRawOne: jest.fn().mockResolvedValue(brut),
  };
  return qb;
}

describe('appliquerPerimetreBeneficiaire', () => {
  it('global (administrateur, national) : aucune condition', () => {
    const qb = qbFactice();
    appliquerPerimetreBeneficiaire(qb, null);
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('🚨 périmètre VIDE : aucune ligne - jamais toute la campagne', () => {
    // Le défaut corrigé : sans sous-groupe sous sa racine, la liste ne posait AUCUN filtre et
    // livrait toute la campagne, téléphones compris (3 structures dans ce cas au 26/09).
    const qb = qbFactice();
    appliquerPerimetreBeneficiaire(qb, new Set());
    expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
  });

  it('borne par la structure du BÉNÉFICIAIRE, lue en base y compris sur une fiche supprimée', () => {
    const qb = qbFactice();
    appliquerPerimetreBeneficiaire(qb, new Set(['s-1', 's-2']));
    const [condition, params] = qb.appels[0];
    expect(condition).toContain('p.beneficiary_uuid IN (SELECT');
    expect(condition).toContain('FROM members');
    // Pas de filtre `deleted_at` : un paiement reste à la structure de son bénéficiaire même si
    // la fiche a été supprimée depuis.
    expect(condition).not.toContain('deleted_at');
    expect(params).toEqual({ perimetreStructures: ['s-1', 's-2'] });
  });
});

describe('chiffresReussis', () => {
  it('compte ce que compte la Comptabilité : paiements `paid` de la campagne, montant total', async () => {
    const qb = qbFactice({ nombre: '1053', montant: '16230000.00', beneficiaires: '1049' });
    const repo = { createQueryBuilder: jest.fn(() => qb) };

    const chiffres = await chiffresReussis(repo as never, 'camp-1', new Set(['s-1']));

    expect(chiffres).toEqual({ nombre: 1053, montant: 16230000, beneficiaires: 1049 });
    expect(qb.appels).toEqual(
      expect.arrayContaining([
        ['p.source_uuid = :campagne', { campagne: 'camp-1' }],
        ['p.payment_status = :paye', { paye: 'paid' }],
      ]),
    );
    expect(qb.addSelect).toHaveBeenCalledWith('COALESCE(SUM(p.total_amount), 0)', 'montant');
  });

  it('applique la même recherche que la liste quand il y en a une', async () => {
    const qb = qbFactice({ nombre: '1', montant: '15000', beneficiaires: '1' });
    await chiffresReussis({ createQueryBuilder: () => qb } as never, 'camp-1', null, 'kossa');
    expect(qb.leftJoin).toHaveBeenCalledWith('p.actor', 'actor');
    expect(qb.leftJoin).toHaveBeenCalledWith('p.beneficiary', 'beneficiary');
    expect(qb.appels.some(([c]: [string]) => c.includes('LIKE'))).toBe(true);
  });

  it('rend des zéros, jamais `null`, sans aucun paiement', async () => {
    const qb = qbFactice({ nombre: '0', montant: '0', beneficiaires: '0' });
    await expect(chiffresReussis({ createQueryBuilder: () => qb } as never, 'c', new Set())).resolves.toEqual({
      nombre: 0, montant: 0, beneficiaires: 0,
    });
  });
});

describe('fiches supprimées', () => {
  // Le 27/09 : 3 paiements réussis sortaient de l'export comptable sans payeur ni bénéficiaire -
  // leurs fiches avaient été supprimées (doublons) et la jointure ORM les écarte d'office.
  it('rétablit la fiche supprimée du payeur et du bénéficiaire, et la signale', async () => {
    const fiche = { uuid: 'm-sup', firstname: 'ANSELME DE LOTUS', lastname: 'KOSSA', deleted_at: new Date() };
    const memberRepo = { find: jest.fn().mockResolvedValue([fiche]) };
    const paiements: any[] = [
      { uuid: 'p1', actor_uuid: 'm-sup', beneficiary_uuid: 'm-sup', actor: null, beneficiary: null },
      { uuid: 'p2', actor_uuid: 'm-ok', beneficiary_uuid: 'm-ok', actor: { uuid: 'm-ok' }, beneficiary: { uuid: 'm-ok' } },
    ];

    const supprimees = await retablirFichesSupprimees(paiements, memberRepo as never);

    expect(memberRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uuid: In(['m-sup']) }, withDeleted: true }),
    );
    expect(paiements[0].actor.lastname).toBe('KOSSA');
    expect(paiements[0].beneficiary.lastname).toBe('KOSSA');
    expect(paiements[1].actor).toEqual({ uuid: 'm-ok' });
    expect([...supprimees]).toEqual(['m-sup']);
  });

  it('ne va pas en base quand aucune fiche ne manque', async () => {
    const memberRepo = { find: jest.fn() };
    await retablirFichesSupprimees([{ actor: {}, beneficiary: {} }] as never, memberRepo as never);
    expect(memberRepo.find).not.toHaveBeenCalled();
  });

  it('observation : dit quelle fiche a disparu, et rien quand tout va bien', () => {
    const sup = new Set(['a']);
    expect(observationFiches({ actor_uuid: 'a', beneficiary_uuid: 'a' }, sup)).toBe(
      'Fiche du payeur et bénéficiaire supprimée',
    );
    expect(observationFiches({ actor_uuid: 'a', beneficiary_uuid: 'b' }, sup)).toBe('Fiche du payeur supprimée');
    expect(observationFiches({ actor_uuid: 'b', beneficiary_uuid: 'a' }, sup)).toBe(
      'Fiche du bénéficiaire supprimée',
    );
    expect(observationFiches({ actor_uuid: 'b', beneficiary_uuid: 'c' }, sup)).toBe('');
  });
});

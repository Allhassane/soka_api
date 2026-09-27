import { DonateService } from './donate.service';

/**
 * Chiffres de la fiche de campagne Zaimu (RESPO-COMPTA-REGUL, 2026-09-27) : même règle que les
 * abonnements - vérité des paiements, périmètre canonique, rattachement par bénéficiaire.
 */
function qbFactice(brut: Record<string, string>) {
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

function makeService(perimetre: { structures: Set<string> | null; racine_uuid: string | null }) {
  const reponses = [
    { nombre: '133', montant: '1356600.00', beneficiaires: '130' },
    { nombre: '388', montant: '3957600.00', beneficiaires: '380' },
  ];
  const qbs: any[] = [];
  const paymentsRepo = {
    createQueryBuilder: jest.fn(() => {
      const qb = qbFactice(reponses[qbs.length]);
      qbs.push(qb);
      return qb;
    }),
  };
  const donatePaymentRepo = {
    manager: { getRepository: jest.fn(() => paymentsRepo) },
    createQueryBuilder: jest.fn(() => { throw new Error('ligne métier interrogée'); }),
  };
  const accessScope = { perimetreFinancier: jest.fn().mockResolvedValue(perimetre) };

  const service = new DonateService(
    { findOne: jest.fn().mockResolvedValue({ uuid: 'zaimu-1', name: 'Gokuyo' }) } as never,
    { logAction: jest.fn() } as never,
    { findOne: jest.fn().mockResolvedValue({ id: 1, uuid: 'u-1' }) } as never,
    {} as never,
    donatePaymentRepo as never,
    { findByAllChildrens: jest.fn() } as never,
    accessScope as never,
  );
  return { service, accessScope, qbs };
}

describe('Fiche de campagne Zaimu - chiffres', () => {
  it('bornés au périmètre canonique, sur la vérité des paiements', async () => {
    const { service, accessScope, qbs } = makeService({
      structures: new Set(['region-2']),
      racine_uuid: 'region-2',
    });

    const fiche: any = await service.findOne('zaimu-1', 'u-1', 'm-1', true);

    expect(accessScope.perimetreFinancier).toHaveBeenCalledWith('u-1');
    expect(fiche.statistics).toMatchObject({
      total_successful_payments: 133,
      total_successful_amount: 1356600,
      total_members_donated: 130,
      total_campaign_amount: 3957600,
    });
    expect(qbs[0].appels.some(([c]: [string]) => c.includes('beneficiary_uuid IN'))).toBe(true);
  });

  it('sans le droit : la campagne seule', async () => {
    const { service, accessScope } = makeService({ structures: null, racine_uuid: null });
    const fiche: any = await service.findOne('zaimu-1', 'u-1', 'm-1', false);
    expect(fiche.statistics).toBeUndefined();
    expect(accessScope.perimetreFinancier).not.toHaveBeenCalled();
  });
});

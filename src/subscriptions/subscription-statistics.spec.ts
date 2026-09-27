import { SubscriptionService } from './subscription.service';

/**
 * Chiffres de la fiche de campagne d'abonnement (RESPO-COMPTA-REGUL, 2026-09-27).
 * « Montant récolté » et « Paiements réussis » disent désormais ce que dit la Comptabilité,
 * bornés au périmètre canonique du connecté (et non plus à `responsibilities[0]`).
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
    { nombre: '1053', montant: '16230000.00', beneficiaires: '1049' }, // périmètre
    { nombre: '4385', montant: '69105000.00', beneficiaires: '4301' }, // campagne entière
  ];
  const qbs: any[] = [];
  const paymentsRepo = {
    createQueryBuilder: jest.fn(() => {
      const qb = qbFactice(reponses[qbs.length]);
      qbs.push(qb);
      return qb;
    }),
  };
  const subscriptionPaymentRepo = {
    manager: { getRepository: jest.fn(() => paymentsRepo) },
    // La ligne métier ne sert plus aux chiffres : l'appeler serait une régression.
    createQueryBuilder: jest.fn(() => { throw new Error('ligne métier interrogée'); }),
  };
  const accessScope = { perimetreFinancier: jest.fn().mockResolvedValue(perimetre) };
  const structureService = { findByAllChildrens: jest.fn() };

  const service = new SubscriptionService(
    { findOne: jest.fn().mockResolvedValue({ uuid: 'camp-1', name: 'SERMENT 2027' }) } as never,
    { logAction: jest.fn() } as never,
    { findOne: jest.fn().mockResolvedValue({ id: 1, uuid: 'u-1' }) } as never,
    subscriptionPaymentRepo as never,
    structureService as never,
    accessScope as never,
  );
  return { service, accessScope, structureService, qbs };
}

describe('Fiche de campagne d\'abonnement - chiffres', () => {
  it('bornés au périmètre CANONIQUE du connecté, sur la vérité des paiements', async () => {
    const { service, accessScope, structureService, qbs } = makeService({
      structures: new Set(['region-1', 'district-1']),
      racine_uuid: 'region-1',
    });

    const fiche: any = await service.findOne('camp-1', 'u-1', 'm-1', true);

    expect(accessScope.perimetreFinancier).toHaveBeenCalledWith('u-1');
    expect(structureService.findByAllChildrens).not.toHaveBeenCalled();
    expect(fiche.statistics).toMatchObject({
      total_successful_payments: 1053,
      total_successful_amount: 16230000,
      total_members_subscribed: 1049,
      total_campaign_amount: 69105000,
      root_structure_uuid: 'region-1',
    });
    // Le périmètre borne le chiffre affiché ; le total de campagne, lui, reste global.
    expect(qbs[0].appels.some(([c]: [string]) => c.includes('beneficiary_uuid IN'))).toBe(true);
    expect(qbs[1].appels.some(([c]: [string]) => c.includes('beneficiary_uuid IN'))).toBe(false);
  });

  it('administrateur ou national : le chiffre de la Comptabilité, sans filtre', async () => {
    const { service, qbs } = makeService({ structures: null, racine_uuid: null });
    await service.findOne('camp-1', 'u-1', 'm-1', true);
    expect(qbs[0].appels.some(([c]: [string]) => c.includes('beneficiary_uuid IN'))).toBe(false);
  });

  it('sans le droit de voir les chiffres : la campagne seule, sans clé `statistics`', async () => {
    const { service, accessScope } = makeService({ structures: null, racine_uuid: null });
    const fiche: any = await service.findOne('camp-1', 'u-1', 'm-1', false);
    expect(fiche.statistics).toBeUndefined();
    expect(accessScope.perimetreFinancier).not.toHaveBeenCalled();
  });
});

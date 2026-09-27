import { PaymentService } from './payment.service';

/**
 * Liste des paiements d'une campagne vue par un responsable (`GET /payments/subgroups/…`),
 * RESPO-COMPTA-REGUL (2026-09-27).
 *
 * Avant : périmètre tiré de `responsibilities[0]`, sous-groupes seuls, rattachement par PAYEUR,
 * totaux lus sur la ligne métier - et, sans sous-groupe sous la racine, AUCUN filtre (toute la
 * campagne, téléphones compris). Désormais : périmètre canonique, bénéficiaire, vérité `payments`.
 */
function qbFactice(lignes: any[], total: number, brut: Record<string, string>) {
  const appels: Array<[string, unknown?]> = [];
  const qb: any = {
    appels,
    leftJoinAndSelect: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn((c: string, p?: unknown) => { appels.push([c, p]); return qb; }),
    andWhere: jest.fn((c: string, p?: unknown) => { appels.push([c, p]); return qb; }),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue([lignes, total]),
    getRawOne: jest.fn().mockResolvedValue(brut),
  };
  return qb;
}

function makeService(options: {
  perimetre: { structures: Set<string> | null; racine_uuid: string | null };
  lignes?: any[];
  fichesSupprimees?: any[];
}) {
  const qbs: any[] = [];
  const agregats = [
    { nombre: '1053', montant: '16230000.00', beneficiaires: '1049' },
    { nombre: '4385', montant: '69105000.00', beneficiaires: '4301' },
  ];
  const paymentRepo = {
    createQueryBuilder: jest.fn(() => {
      const qb = qbFactice(options.lignes ?? [], (options.lignes ?? []).length, agregats[Math.max(0, qbs.length - 1)]);
      qbs.push(qb);
      return qb;
    }),
  };
  const memberRepo = { find: jest.fn().mockResolvedValue(options.fichesSupprimees ?? []), findOne: jest.fn() };
  const structureService = { findByAllChildrens: jest.fn() };
  const accessScope = { perimetreFinancier: jest.fn().mockResolvedValue(options.perimetre) };
  const lignesMetier = { findOne: jest.fn().mockResolvedValue(null) };

  const service = new PaymentService(
    paymentRepo as never,
    memberRepo as never,
    null as never, // subscriptionRepo
    null as never, // donationRepo
    lignesMetier as never, // donatePaymentRepo
    lignesMetier as never, // subscriptionPaymentRepo
    null as never, // exportJobService
    null as never, // exportProcessorService
    { findOne: jest.fn().mockResolvedValue({ uuid: 'u-1', member_uuid: 'm-1' }) } as never,
    structureService as never,
    null as never, // logService
    null as never, // hubService
    accessScope as never,
  );
  return { service, qbs, accessScope, structureService, memberRepo };
}

const ligneListe = (qb: any) => qb.appels;

describe('Liste des paiements d\'une campagne (responsable)', () => {
  it('borne la liste au périmètre canonique par le BÉNÉFICIAIRE', async () => {
    const { service, qbs, accessScope, structureService } = makeService({
      perimetre: { structures: new Set(['region-1', 'district-1']), racine_uuid: 'region-1' },
    });

    await service.findTransactionsForSubGroups('camp-1', 'u-1', 1, 50);

    expect(accessScope.perimetreFinancier).toHaveBeenCalledWith('u-1');
    expect(structureService.findByAllChildrens).not.toHaveBeenCalled();
    expect(ligneListe(qbs[0]).some(([c]: [string]) => c.includes('p.beneficiary_uuid IN'))).toBe(true);
    expect(ligneListe(qbs[0]).some(([c]: [string]) => c.includes('actor.structure_uuid'))).toBe(false);
  });

  it('🚨 périmètre VIDE : aucune ligne - plus jamais toute la campagne', async () => {
    const { service, qbs } = makeService({ perimetre: { structures: new Set(), racine_uuid: null } });
    await service.findTransactionsForSubGroups('camp-1', 'u-1', 1, 50);
    expect(ligneListe(qbs[0])).toContainEqual(['1 = 0', undefined]);
  });

  it('administrateur / national : la campagne entière, sans filtre de structure', async () => {
    const { service, qbs } = makeService({ perimetre: { structures: null, racine_uuid: null } });
    await service.findTransactionsForSubGroups('camp-1', 'u-1', 1, 50);
    expect(ligneListe(qbs[0]).some(([c]: [string]) => c.includes('beneficiary_uuid IN') || c === '1 = 0')).toBe(false);
  });

  it('ses totaux sont ceux de la Comptabilité : paiements `paid`, dans le même périmètre', async () => {
    const { service, qbs } = makeService({
      perimetre: { structures: new Set(['region-1']), racine_uuid: 'region-1' },
    });

    const r: any = await service.findTransactionsForSubGroups('camp-1', 'u-1', 1, 50);

    expect(r.total_successful_payments).toBe(1053);
    expect(r.total_successful_amount).toBe(16230000);
    expect(r.total_campaign_amount).toBe(69105000);
    const agregatPerimetre = qbs[1];
    expect(agregatPerimetre.appels).toContainEqual(['p.payment_status = :paye', { paye: 'paid' }]);
    expect(agregatPerimetre.appels.some(([c]: [string]) => c.includes('beneficiary_uuid IN'))).toBe(true);
  });

  it('affiche l\'identité d\'une fiche SUPPRIMÉE au lieu d\'une ligne anonyme, et le signale', async () => {
    const { service } = makeService({
      perimetre: { structures: null, racine_uuid: null },
      lignes: [{
        uuid: 'p1', source: 'subscription', actor_uuid: 'm-sup', beneficiary_uuid: 'm-sup',
        actor: null, beneficiary: null, total_amount: 15000,
      }],
      fichesSupprimees: [{
        uuid: 'm-sup', firstname: 'TCHIN DOMINIQUE', lastname: 'MEHOUE', phone: '0700000000',
        deleted_at: new Date('2026-09-22'), structure: { uuid: 's-9', name: 'SOUS-GROUPE 9' },
      }],
    });

    const r: any = await service.findTransactionsForSubGroups('camp-1', 'u-1', 1, 50);

    expect(r.data[0].actor).toMatchObject({ lastname: 'MEHOUE', fiche_supprimee: true });
    expect(r.data[0].beneficiary).toMatchObject({ lastname: 'MEHOUE', fiche_supprimee: true });
  });
});

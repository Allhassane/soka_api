import {
  appliquerFiltresExportTransactions,
  statutGuichetDepuisExport,
} from './transactions-export-query';

/**
 * Filtre de l'export des transactions d'une campagne lancé par un responsable
 * (RESPO-COMPTA-REGUL, 2026-09-27) : le fichier doit contenir EXACTEMENT les lignes que compte la
 * fiche de campagne du même utilisateur - même périmètre, même statut, même vérité.
 */
function qbFactice() {
  const appels: Array<[string, unknown?]> = [];
  const qb: any = {
    appels,
    where: jest.fn((c: string, p?: unknown) => { appels.push([c, p]); return qb; }),
    andWhere: jest.fn((c: string, p?: unknown) => { appels.push([c, p]); return qb; }),
    orderBy: jest.fn(() => qb),
  };
  return qb;
}

describe('statutGuichetDepuisExport', () => {
  it.each([
    ['success', 'paid'],
    ['paid', 'paid'],
    ['fail', 'failed'],
    ['failed', 'failed'],
    ['pending', 'pending'],
    ['canceled', 'cancelled'],
    ['cancelled', 'cancelled'],
  ])('traduit « %s » en `payment_status = %s`', (entree, attendu) => {
    expect(statutGuichetDepuisExport(entree)).toBe(attendu);
  });

  it.each([['all'], [''], [undefined]])('« %p » = tous les statuts', (entree) => {
    expect(statutGuichetDepuisExport(entree as never)).toBeNull();
  });
});

describe('appliquerFiltresExportTransactions', () => {
  it('filtre le STATUT DU GUICHET (`payment_status`), jamais le statut métier', () => {
    // La fiche compte `payment_status = 'paid'` ; un export sur `p.status` pouvait diverger.
    const qb = qbFactice();
    appliquerFiltresExportTransactions(qb, { source_uuid: 'camp-1', structures: null, status: 'success' });
    expect(qb.appels).toContainEqual(['p.source_uuid = :source_uuid', { source_uuid: 'camp-1' }]);
    expect(qb.appels).toContainEqual(['p.payment_status = :statutGuichet', { statutGuichet: 'paid' }]);
    expect(qb.appels.some(([c]: [string]) => c.includes('p.status'))).toBe(false);
  });

  it('borne au périmètre canonique par le bénéficiaire', () => {
    const qb = qbFactice();
    appliquerFiltresExportTransactions(qb, {
      source_uuid: 'camp-1', structures: new Set(['district-1']), status: 'all',
    });
    expect(qb.appels.some(([c]: [string]) => c.includes('p.beneficiary_uuid IN'))).toBe(true);
    expect(qb.appels.some(([c]: [string]) => c.includes('payment_status'))).toBe(false);
  });

  it('périmètre vide : un fichier vide, jamais toute la campagne', () => {
    const qb = qbFactice();
    appliquerFiltresExportTransactions(qb, { source_uuid: 'camp-1', structures: new Set(), status: 'success' });
    expect(qb.appels).toContainEqual(['1 = 0', undefined]);
  });
});

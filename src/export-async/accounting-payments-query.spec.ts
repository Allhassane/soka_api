import { appliquerFiltresPaiementsCompta } from './accounting-payments-query';

/**
 * **Le filtre de l'export DOIT être celui de la tuile.**
 *
 * 🚨 Contrat de cohérence : le fichier exporté depuis une carte KPI contient exactement les
 * lignes que cette carte compte. Deux pièges, tous deux déjà présents dans le code voisin :
 *
 * 1. **`payments` porte DEUX colonnes de statut** - `status` (le statut métier, filtré par
 *    l'export du module Exports) et `payment_status` (celui du guichet, affiché par la
 *    Comptabilité). Filtrer sur la mauvaise rendrait un fichier plausible mais faux.
 * 2. **Aucun périmètre de structure** : `campaignPayments` n'en applique aucun, donc la tuile
 *    compte toute l'organisation. Scoper l'export livrerait un fichier plus court que le
 *    chiffre affiché, sans que rien ne le signale.
 */

function fauxQueryBuilder() {
  const conditions: { clause: string; params?: any }[] = [];
  const qb: any = {
    conditions,
    where: jest.fn((clause: string, params?: any) => {
      conditions.push({ clause, params });
      return qb;
    }),
    andWhere: jest.fn((clause: string, params?: any) => {
      conditions.push({ clause, params });
      return qb;
    }),
    orderBy: jest.fn(() => qb),
  };
  return qb;
}

const clauses = (qb: any) => qb.conditions.map((c: any) => c.clause);

describe('appliquerFiltresPaiementsCompta', () => {
  it('filtre sur payment_status - JAMAIS sur status', () => {
    const qb = fauxQueryBuilder();

    appliquerFiltresPaiementsCompta(qb, {
      type: 'subscription',
      campaign_uuid: 'camp-1',
      bucket: 'failed',
    });

    expect(qb.andWhere).toHaveBeenCalledWith('p.payment_status = :seau', {
      seau: 'failed',
    });
    expect(clauses(qb).some((c: string) => /\bp\.status\b/.test(c))).toBe(false);
  });

  it('ne pose AUCUN filtre de statut sur le seau « all »', () => {
    const qb = fauxQueryBuilder();

    appliquerFiltresPaiementsCompta(qb, {
      type: 'donation',
      campaign_uuid: 'camp-2',
      bucket: 'all',
    });

    expect(clauses(qb).some((c: string) => /payment_status/.test(c))).toBe(false);
  });

  it('borne au type et à la campagne regardés', () => {
    const qb = fauxQueryBuilder();

    appliquerFiltresPaiementsCompta(qb, {
      type: 'subscription',
      campaign_uuid: 'camp-1',
      bucket: 'paid',
    });

    expect(qb.where).toHaveBeenCalledWith('p.source = :type', { type: 'subscription' });
    expect(qb.andWhere).toHaveBeenCalledWith('p.source_uuid = :campagne', {
      campagne: 'camp-1',
    });
  });

  it('🚨 n’applique AUCUN périmètre de structure', () => {
    const qb = fauxQueryBuilder();

    appliquerFiltresPaiementsCompta(qb, {
      type: 'subscription',
      campaign_uuid: 'camp-1',
      bucket: 'all',
    });

    expect(clauses(qb).some((c: string) => /structure_uuid/.test(c))).toBe(false);
  });

  it('sans campagne, ne borne que le type (toutes campagnes du type)', () => {
    const qb = fauxQueryBuilder();

    appliquerFiltresPaiementsCompta(qb, { type: 'donation', bucket: 'all' });

    expect(clauses(qb).some((c: string) => /source_uuid/.test(c))).toBe(false);
  });
});

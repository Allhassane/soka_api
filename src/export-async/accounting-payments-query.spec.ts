import {
  appliquerFiltresPaiementsCompta,
  structuresDuFiltreCompta,
} from './accounting-payments-query';

/**
 * **Le filtre de l'export DOIT être celui de la tuile.**
 *
 * 🚨 Contrat de cohérence : le fichier exporté depuis une carte KPI contient exactement les
 * lignes que cette carte compte. Deux pièges, tous deux déjà présents dans le code voisin :
 *
 * 1. **`payments` porte DEUX colonnes de statut** - `status` (le statut métier, filtré par
 *    l'export du module Exports) et `payment_status` (celui du guichet, affiché par la
 *    Comptabilité). Filtrer sur la mauvaise rendrait un fichier plausible mais faux.
 * 2. **Aucun périmètre de l'UTILISATEUR** : la tuile compte toute l'organisation. Scoper
 *    l'export au connecté livrerait un fichier plus court que le chiffre affiché, sans que rien
 *    ne le signale. La seule restriction admise est le filtre « Structure » CHOISI à l'écran
 *    (2026-09-27) - et il passe alors, à l'identique, dans le tableau et dans le fichier.
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

  it('🚨 n’applique AUCUN périmètre de structure tant qu’aucune n’est choisie', () => {
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

/**
 * **Le filtre « Structure » du bloc de lignes** (2026-09-27).
 *
 * Règle unique, celle de RESPO-COMPTA-REGUL : structure du BÉNÉFICIAIRE, sous-arbre COMPLET
 * (tous niveaux). Filtrer la Comptabilité sur une région rend donc exactement les paiements que
 * voit le responsable de cette région - jamais une deuxième définition de « sa » région.
 */
describe('appliquerFiltresPaiementsCompta - filtre « Structure »', () => {
  it('borne au BÉNÉFICIAIRE rattaché au sous-arbre choisi - jamais au payeur', () => {
    const qb = fauxQueryBuilder();

    appliquerFiltresPaiementsCompta(qb, {
      type: 'subscription',
      campaign_uuid: 'camp-1',
      bucket: 'paid',
      structures: new Set(['region-1', 'district-9']),
    });

    const filtre = qb.conditions.find((c: any) => /beneficiary_uuid/.test(c.clause));
    expect(filtre).toBeDefined();
    expect(filtre.clause).toMatch(
      /p\.beneficiary_uuid IN \(SELECT .+ FROM members .+\.structure_uuid IN \(:\.\.\.perimetreStructures\)\)/,
    );
    expect([...filtre.params.perimetreStructures].sort()).toEqual(['district-9', 'region-1']);
    expect(clauses(qb).some((c: string) => /actor/.test(c))).toBe(false);
  });

  it('`null` (« Toutes les structures ») ne filtre rien', () => {
    const qb = fauxQueryBuilder();

    appliquerFiltresPaiementsCompta(qb, {
      type: 'subscription',
      bucket: 'all',
      structures: null,
    });

    expect(clauses(qb).some((c: string) => /beneficiary_uuid|structure_uuid/.test(c))).toBe(false);
  });

  it('un ensemble vide ne rend AUCUNE ligne - jamais « tout »', () => {
    const qb = fauxQueryBuilder();

    appliquerFiltresPaiementsCompta(qb, {
      type: 'subscription',
      bucket: 'all',
      structures: new Set(),
    });

    expect(clauses(qb)).toContain('1 = 0');
  });
});

describe('structuresDuFiltreCompta - ce que désigne la structure choisie', () => {
  it('rend `null` sans structure choisie, sans interroger la base', async () => {
    const accessScope = { sousArbre: jest.fn() };

    await expect(structuresDuFiltreCompta(accessScope, undefined)).resolves.toBeNull();
    await expect(structuresDuFiltreCompta(accessScope, '  ')).resolves.toBeNull();
    expect(accessScope.sousArbre).not.toHaveBeenCalled();
  });

  it('rend le sous-arbre COMPLET de la structure choisie (tous niveaux)', async () => {
    const accessScope = {
      sousArbre: jest.fn().mockResolvedValue(new Set(['region-1', 'centre-2', 'groupe-3'])),
    };

    const structures = await structuresDuFiltreCompta(accessScope, ' region-1 ');

    expect(accessScope.sousArbre).toHaveBeenCalledWith('region-1');
    expect([...(structures ?? [])]).toEqual(['region-1', 'centre-2', 'groupe-3']);
  });

  it('refuse une structure inconnue - un tableau vide se lirait « rien de payé ici »', async () => {
    const accessScope = { sousArbre: jest.fn().mockResolvedValue(new Set()) };

    await expect(structuresDuFiltreCompta(accessScope, 'nexiste-pas')).rejects.toMatchObject({
      response: { data: { code: 'STRUCTURE_INCONNUE' } },
    });
  });
});

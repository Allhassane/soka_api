import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { REQUIRE_PERMISSIONS_KEY } from 'src/auth/decorators/require-permissions.decorator';
import { listCatalogPermissions } from 'src/permission/permission-catalog';
import { ControleController } from './controle.controller';
import { CONTROLE, ChiffresControle, construireControle } from './controle.helpers';
import { ControleService } from './controle.service';

/**
 * Module Contrôle - onglet Abonnement (2026-09-27).
 *
 * La règle de l'utilisateur : 1 paiement réussi = 1 paiement collecté ; un paiement de quantité 2
 * = 1 abonné et 2 journaux ; 1 journal = le tarif de la campagne (15 000 F). Le montant collecté
 * divisé par le tarif doit retomber sur les journaux payés, région par région, puis
 * journaux × tarif - commission HUB2 (2 %) = net.
 */

const chiffres = (c: Partial<ChiffresControle>): ChiffresControle => ({
  paiements: 0, montant: 0, journaux: 0, abonnes: 0, hors_tarif: 0, ...c,
});

/** Les chiffres réels de la copie prod du 26/09 (campagne SERMENT DU BONHEUR 2027). */
const reels = {
  campagne: {
    uuid: 'camp-2027', nom: 'CAMPAGNE D\'ABONNEMENT LE SERMENT DU BONHEUR 2027',
    statut: 'started', annee: 2027, tarif: 15000,
  },
  taux: 0.02,
  global: chiffres({ paiements: 4385, montant: 69105000, journaux: 4607, abonnes: 3818 }),
  regions: [
    { uuid: 'r-justice', nom: 'JUSTICE', chiffres: chiffres({ paiements: 1729, montant: 27435000, journaux: 1829, abonnes: 1546 }) },
    { uuid: 'r-cv1', nom: 'CHÂTEAU DE LA VICTOIRE SOKA 1', chiffres: chiffres({ paiements: 1053, montant: 16230000, journaux: 1082, abonnes: 884 }) },
    { uuid: 'r-le', nom: 'LUTTER ENSEMBLE', chiffres: chiffres({ paiements: 1007, montant: 15915000, journaux: 1061, abonnes: 859 }) },
    { uuid: 'r-cv2', nom: 'CHÂTEAU DE LA VICTOIRE SOKA 2', chiffres: chiffres({ paiements: 596, montant: 9525000, journaux: 635, abonnes: 529 }) },
  ],
  anomalies: [],
};

describe('Contrôle abonnement - le calcul', () => {
  it('rend la trame de l’utilisateur sur les chiffres réels : tout concorde', () => {
    const c = construireControle(reels);

    expect(c.montant_collecte).toBe(69105000);
    expect(c.journaux_du_montant).toBe(4607);
    expect(c.regions.map((r) => [r.nom, r.journaux, r.abonnes])).toEqual([
      ['CHÂTEAU DE LA VICTOIRE SOKA 1', 1082, 884],
      ['CHÂTEAU DE LA VICTOIRE SOKA 2', 635, 529],
      ['JUSTICE', 1829, 1546],
      ['LUTTER ENSEMBLE', 1061, 859],
    ]);
    expect(c.total_journaux).toBe(4607);
    expect(c.total_abonnes).toBe(3818);
    expect(c.produit).toBe(69105000);
    expect(c.commission).toEqual({ taux: 0.02, montant: 1382100 });
    expect(c.net).toBe(67722900);
    expect(c.hors_region).toBeNull();
    expect(c.controles).toEqual({ montant_tarif: true, regions: true, tarif: true });
    expect(c.coherent).toBe(true);
  });

  it('🚨 un montant qui ne tombe pas juste sur le tarif est signalé, jamais arrondi en silence', () => {
    const c = construireControle({
      ...reels,
      global: { ...reels.global, montant: 69110000, hors_tarif: 1 },
    });

    expect(c.journaux_du_montant).toBe(4607.33);
    expect(c.controles.montant_tarif).toBe(false);
    expect(c.controles.tarif).toBe(false);
    expect(c.coherent).toBe(false);
  });

  it('🚨 des journaux sans région sont NOMMÉS, jamais perdus : la somme retombe sur le total', () => {
    const c = construireControle({
      ...reels,
      global: { ...reels.global, paiements: 4387, montant: 69135000, journaux: 4609, abonnes: 3820 },
    });

    expect(c.hors_region).toEqual({ paiements: 2, montant: 30000, journaux: 2, abonnes: 2 });
    expect(c.controles.regions).toBe(false);
    expect(c.coherent).toBe(false);
    const somme = c.regions.reduce((s, r) => s + r.journaux, 0) + (c.hors_region?.journaux ?? 0);
    expect(somme).toBe(c.total_journaux);
  });

  it('le prix d’un journal est le tarif de LA campagne, pas une constante', () => {
    const c = construireControle({
      ...reels,
      campagne: { ...reels.campagne, tarif: 100 },
      global: chiffres({ paiements: 3, montant: 500, journaux: 5, abonnes: 2 }),
      regions: [],
    });

    expect(c.journaux_du_montant).toBe(5);
    expect(c.produit).toBe(500);
  });

  it('tarif absent : aucune division inventée', () => {
    const c = construireControle({ ...reels, campagne: { ...reels.campagne, tarif: 0 } });

    expect(c.journaux_du_montant).toBeNull();
    expect(c.controles.montant_tarif).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Le service : quelles lignes il compte
// ─────────────────────────────────────────────────────────────────────────────

function makeService(o: {
  campagneEnCours?: any;
  campagneDemandee?: any;
  global?: Partial<ChiffresControle>;
  parRegion?: Record<string, Partial<ChiffresControle>>;
} = {}) {
  /** Chaque query builder créé, avec ses conditions : on vérifie CE QUI est compté. */
  const qbs: any[] = [];
  const paymentRepo = {
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        conditions: [] as Array<[string, any]>,
        region: null as string | null,
      };
      const note = (sql: string, params?: any) => {
        qb.conditions.push([sql, params]);
        if (params?.perimetreStructures) qb.region = params.perimetreStructures[0];
        return qb;
      };
      qb.where = jest.fn(note);
      qb.andWhere = jest.fn(note);
      qb.select = jest.fn(() => qb);
      qb.addSelect = jest.fn(() => qb);
      qb.orderBy = jest.fn(() => qb);
      qb.setParameter = jest.fn(() => qb);
      qb.leftJoin = jest.fn(() => qb);
      qb.limit = jest.fn(() => qb);
      qb.getRawOne = jest.fn(async () => {
        const c = qb.region ? o.parRegion?.[qb.region] ?? {} : o.global ?? {};
        return {
          paiements: String(c.paiements ?? 0), montant: String(c.montant ?? 0),
          journaux: String(c.journaux ?? 0), abonnes: String(c.abonnes ?? 0),
          hors_tarif: String(c.hors_tarif ?? 0),
        };
      });
      qb.getRawMany = jest.fn(async () => []);
      qbs.push(qb);
      return qb;
    }),
  };
  const subscriptionRepo = {
    findOne: jest.fn(async ({ where }: any) =>
      where?.uuid ? o.campagneDemandee ?? null : o.campagneEnCours ?? null),
    find: jest.fn(async () => []),
  };
  const structureRepo = {
    findOne: jest.fn(async () => ({ uuid: 'national' })),
    find: jest.fn(async () => [
      { uuid: 'r-justice', name: 'JUSTICE' },
      { uuid: 'r-le', name: 'LUTTER ENSEMBLE' },
    ]),
  };
  // Le sous-arbre d'une région commence par la région elle-même.
  const accessScope = {
    sousArbre: jest.fn(async (uuid: string) => new Set([uuid, `${uuid}-enfant`])),
  };
  const service = new ControleService(
    paymentRepo as never,
    subscriptionRepo as never,
    structureRepo as never,
    accessScope as never,
  );
  return { service, qbs, subscriptionRepo, accessScope };
}

const campagne2027 = {
  uuid: 'camp-2027', name: 'SERMENT 2027', status: 'started', year: 2027, amount: 15000,
};

describe('Contrôle abonnement - les paiements comptés', () => {
  it('🚨 compte EXACTEMENT les paiements de la tuile « Paiement réussi » de la Comptabilité', async () => {
    const { service, qbs } = makeService({
      campagneEnCours: campagne2027,
      global: { paiements: 2, montant: 45000, journaux: 3, abonnes: 2 },
      parRegion: { 'r-justice': { paiements: 2, montant: 45000, journaux: 3, abonnes: 2 } },
    });

    await service.abonnement();

    const global = qbs.find((q) => q.region === null);
    expect(global.conditions).toEqual(
      expect.arrayContaining([
        ['p.source = :type', { type: 'subscription' }],
        ['p.source_uuid = :campagne', { campagne: 'camp-2027' }],
        ['p.payment_status = :seau', { seau: 'paid' }],
      ]),
    );
  });

  it('une région = son sous-arbre COMPLET, par la structure du BÉNÉFICIAIRE (règle de la Comptabilité)', async () => {
    const { service, qbs, accessScope } = makeService({
      campagneEnCours: campagne2027,
      global: { paiements: 3, montant: 45000, journaux: 3, abonnes: 3 },
      parRegion: {
        'r-justice': { paiements: 2, montant: 30000, journaux: 2, abonnes: 2 },
        'r-le': { paiements: 1, montant: 15000, journaux: 1, abonnes: 1 },
      },
    });

    const c = await service.abonnement();

    expect(accessScope.sousArbre).toHaveBeenCalledWith('r-justice');
    const justice = qbs.find((q) => q.region === 'r-justice');
    expect(justice.conditions).toEqual(
      expect.arrayContaining([
        [
          'p.beneficiary_uuid IN (SELECT pm.uuid FROM members pm WHERE pm.structure_uuid IN (:...perimetreStructures))',
          { perimetreStructures: ['r-justice', 'r-justice-enfant'] },
        ],
      ]),
    );
    expect(c.regions?.map((r) => [r.nom, r.journaux])).toEqual([['JUSTICE', 2], ['LUTTER ENSEMBLE', 1]]);
    expect(c.coherent).toBe(true);
  });

  it('sans campagne précisée : la campagne d’abonnement EN COURS la plus récente', async () => {
    const { service, subscriptionRepo } = makeService({ campagneEnCours: campagne2027 });

    const c = await service.abonnement();

    expect(subscriptionRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'started' }, order: { created_at: 'DESC' } }),
    );
    expect(c.campagne?.uuid).toBe('camp-2027');
    expect(c.campagne?.tarif).toBe(15000);
  });

  it('campagne inconnue : refus lisible, jamais « 0 journal »', async () => {
    const { service } = makeService({ campagneDemandee: null });

    await expect(service.abonnement('inconnue')).rejects.toEqual(
      expect.objectContaining({
        response: expect.objectContaining({
          data: expect.objectContaining({ code: 'CAMPAGNE_INCONNUE' }),
        }),
      }),
    );
  });

  it('aucune campagne en cours : pas de chiffres, sans erreur', async () => {
    const { service, qbs } = makeService({ campagneEnCours: null });

    const c = await service.abonnement();

    expect(c.campagne).toBeNull();
    expect(qbs).toHaveLength(0);
  });

  it('ne cherche les paiements en cause que s’il y en a', async () => {
    const { service, qbs } = makeService({
      campagneEnCours: campagne2027,
      global: { paiements: 1, montant: 15000, journaux: 1, abonnes: 1 },
      parRegion: { 'r-justice': { paiements: 1, montant: 15000, journaux: 1, abonnes: 1 } },
    });

    await service.abonnement();

    expect(qbs.every((q) => q.getRawMany.mock.calls.length === 0)).toBe(true);
  });
});

describe('Contrôle - accès', () => {
  it('🚨 la route ne sert que des LECTURES, toutes sous la permission du module', () => {
    const proto = ControleController.prototype as unknown as Record<string, object>;
    const routes = Object.getOwnPropertyNames(proto)
      .filter((nom) => nom !== 'constructor')
      .map((nom) => ({
        verbe: Reflect.getMetadata(METHOD_METADATA, proto[nom]),
        droits: Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, proto[nom]),
      }))
      .filter((r) => r.verbe !== undefined);

    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(r.verbe).toBe(RequestMethod.GET);
      expect(r.droits).toEqual([CONTROLE]);
    }
  });

  it('une seule permission au catalogue, cochée pour ADMINISTRATEUR seul à sa création', () => {
    const duModule = listCatalogPermissions().filter((p) => p.module === 'Contrôle');

    expect(duModule.map((p) => p.slug)).toEqual([CONTROLE]);
    // ⚠️ Clés en minuscules : le seed lit `defaults[role.slug.toLowerCase()]`.
    expect(duModule[0].defaults).toEqual({ administrateur: true });
  });
});

import axios, { AxiosError, AxiosResponse } from 'axios';
import { HubGatewayPayment, HubService } from './hub.service';

/**
 * Lecture de la liste marchande du guichet - le cœur du « Rafraîchir » de la Comptabilité.
 *
 * Le 26/09, ce bouton échouait en production : 94 allers-retours de 100 lignes (chacun rejouant
 * le tri et le comptage de tout l'historique) dépassaient à eux seuls les 30 s du navigateur.
 * Ces tests verrouillent la lecture en grandes pages, son repli sur un guichet pas encore déployé,
 * et le dédoublonnage qu'impose une pagination par décalage lue pendant que des paiements arrivent.
 */

// Aucune requête réelle ne doit partir : `axios.get` est remplacé, et l'URL visée n'existe pas.
process.env.HUB_API_KEY = 'sk_live_test';
process.env.HUB_API_URL = 'http://guichet.invalid/api/v1/payment-links';

const tentative = (id: string): HubGatewayPayment => ({
  id,
  linkId: `plink_${id}`,
  status: 'successful',
  amount: 15000,
  currency: 'XOF',
  environment: 'live',
  createdAt: '2026-09-26T10:00:00.000Z',
  updatedAt: '2026-09-26T10:00:00.000Z',
});

/** Une page telle que le guichet la rend (`{ data, meta }`). */
const page = (ids: string[], total: number, totalPages: number, perPage = 5000) =>
  ({
    data: {
      data: ids.map(tentative),
      meta: { page: 1, perPage, total, totalPages },
    },
  }) as AxiosResponse;

/** Le refus d'un guichet antérieur au 26/09 : `perPage` au-delà de 100 → 400. */
const refusTaillePage = () =>
  new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    data: { error: { code: 'VALIDATION_ERROR' } },
  } as AxiosResponse);

describe('Liste marchande du guichet - lecture pour la concordance', () => {
  let get: jest.SpyInstance;
  const demandes = () => get.mock.calls.map(([, config]) => config.params);

  beforeEach(() => {
    get = jest.spyOn(axios, 'get');
  });
  afterEach(() => get.mockRestore());

  it('lit la liste par pages de 5 000 : 2 appels au lieu de 94 pour 9 323 tentatives', async () => {
    get
      .mockResolvedValueOnce(page(['a', 'b'], 9323, 2))
      .mockResolvedValueOnce(page(['c'], 9323, 2));

    const { payments } = await new HubService().listGatewayPayments();

    expect(demandes()).toEqual([
      expect.objectContaining({ page: 1, perPage: 5000 }),
      expect.objectContaining({ page: 2, perPage: 5000 }),
    ]);
    expect(payments.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('🚨 retombe sur des pages de 100 quand le guichet, pas encore déployé, refuse 5 000', async () => {
    // Sans ce repli, déployer l'API AVANT le guichet mettrait le bouton en échec (400) jusqu'au
    // déploiement suivant. Avec lui, l'ordre des déploiements est indifférent.
    get.mockImplementation((_url, config) =>
      config.params.perPage > 100
        ? Promise.reject(refusTaillePage())
        : Promise.resolve(page(config.params.page === 1 ? ['a'] : ['b'], 2, 2, 100)),
    );

    const { payments, complet } = await new HubService().listGatewayPayments();

    expect(demandes().map((d) => d.perPage)).toEqual([5000, 100, 100]);
    expect(payments.map((p) => p.id)).toEqual(['a', 'b']);
    expect(complet).toBe(true);
  });

  it('ne masque pas une vraie panne du guichet derrière le repli', async () => {
    get.mockRejectedValue(
      new AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', undefined, undefined, {
        status: 500,
      } as AxiosResponse),
    );

    await expect(new HubService().listGatewayPayments()).rejects.toThrow('500');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('🚨 dédoublonne une tentative relue sur deux pages (paiement arrivé pendant la lecture)', async () => {
    // La liste est triée par date décroissante et paginée par décalage : un paiement arrivé entre
    // deux pages décale tout d'un rang, et la dernière ligne de la page 1 revient en tête de la
    // page 2. Comptée deux fois, elle gonflerait le brut ; écrite deux fois, elle violerait
    // l'index unique de l'instantané (`UQ_acc_line_snapshot_payment`) et ferait tomber le
    // rafraîchissement en 500.
    get
      .mockResolvedValueOnce(page(['c', 'b'], 3, 2))
      .mockResolvedValueOnce(page(['b', 'a'], 4, 2));

    const { payments, complet } = await new HubService().listGatewayPayments();

    expect(payments.map((p) => p.id)).toEqual(['c', 'b', 'a']);
    // Le paiement arrivé en cours de lecture est postérieur à la photo : ce n'est pas une
    // troncature, et l'écran ne doit pas crier « lecture tronquée ».
    expect(complet).toBe(true);
  });

  it('signale une lecture coupée par le garde-fou du nombre de pages', async () => {
    get.mockResolvedValue(page(['a'], 10001, 3));

    const { complet } = await new HubService().listGatewayPayments({ maxPages: 2 });

    expect(get).toHaveBeenCalledTimes(2);
    expect(complet).toBe(false);
  });
});

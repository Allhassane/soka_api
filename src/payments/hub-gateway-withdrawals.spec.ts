import axios, { AxiosResponse } from 'axios';
import { HubGatewayWithdrawal, HubService } from './hub.service';

/**
 * Retraits du compte de collecte HUB2, relayés par le guichet (`GET /withdrawals`, 2026-09-27).
 *
 * Ils entrent dans le décompte du solde : une liste vide ou partielle prise pour la vérité
 * ferait passer un vrai retrait pour un écart. Ces tests verrouillent donc les refus.
 */

// Aucune requête réelle ne doit partir : `axios.get` est remplacé, et l'URL visée n'existe pas.
process.env.HUB_API_KEY = 'sk_live_test';
process.env.HUB_API_URL = 'http://guichet.invalid/api/v1/payment-links';

const retrait: HubGatewayWithdrawal = {
  id: 'prov_IG5jhhHc2IZryqAyM0QDN',
  date: '2026-09-16T13:33:09.126Z',
  amount: 100000,
  currency: 'XOF',
  status: 'successful',
  description: 'Test Virement vers Banque',
  failureCause: null,
};

const reponse = (corps: unknown) => ({ data: corps }) as AxiosResponse;

describe('Retraits du compte de collecte - relais du guichet', () => {
  let get: jest.SpyInstance;

  beforeEach(() => {
    get = jest.spyOn(axios, 'get');
  });
  afterEach(() => get.mockRestore());

  it('lit `/withdrawals` à la racine de l’API marchande, avec la clé et le délai du guichet', async () => {
    get.mockResolvedValueOnce(reponse({ environment: 'live', data: [retrait], complete: true }));

    const retraits = await new HubService().listGatewayWithdrawals();

    expect(retraits).toEqual([retrait]);
    expect(get).toHaveBeenCalledWith('http://guichet.invalid/api/v1/withdrawals', {
      headers: { Authorization: 'Bearer sk_live_test' },
      timeout: 8000,
    });
  });

  it('🚨 refuse une liste que le guichet déclare INCOMPLÈTE : jamais un total partiel', async () => {
    get.mockResolvedValueOnce(reponse({ environment: 'live', data: [retrait], complete: false }));

    await expect(new HubService().listGatewayWithdrawals()).rejects.toThrow(/incompl/i);
  });

  it('refuse une réponse sans liste plutôt que d’annoncer « aucun retrait »', async () => {
    get.mockResolvedValueOnce(reponse({ error: { code: 'not_found' } }));

    await expect(new HubService().listGatewayWithdrawals()).rejects.toThrow(/invalide/i);
  });
});

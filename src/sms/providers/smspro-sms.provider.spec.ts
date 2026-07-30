/// <reference types="jest" />
const mockPost = jest.fn();
const mockGet = jest.fn();
// On capture la config passée à axios.create : c'est là que vit l'authentification
// (en-tête Bearer) et la base d'API, donc c'est ce qu'il faut couvrir.
const mockCreate = jest.fn((_config?: any) => ({
  post: mockPost,
  get: mockGet,
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: { create: (config?: any) => mockCreate(config) },
}));

import { SmspproSmsProvider } from './smspro-sms.provider';

function makeProvider(env: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    SMSPRO_API_TOKEN: 'tok',
    SMSPRO_SENDER_ID: 'SGBNDCI',
    SMSPRO_ENABLED: 'true',
  };
  const merged = { ...defaults, ...env };
  const config = { get: (k: string) => merged[k] };
  return new SmspproSmsProvider(config as any);
}

/** Config du dernier axios.create() (baseURL, headers…). */
const lastCreateConfig = () => mockCreate.mock.calls.at(-1)?.[0] as any;

describe('SmspproSmsProvider', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
    mockCreate.mockClear();
  });

  it("s'authentifie par en-tête Bearer sur l'API v3", () => {
    makeProvider();
    const cfg = lastCreateConfig();
    expect(cfg.baseURL).toBe('https://app.smspro.africa/api/v3');
    expect(cfg.headers.Authorization).toBe('Bearer tok');
  });

  it("ne pose AUCUN en-tête d'authentification quand le token est absent", () => {
    makeProvider({ SMSPRO_API_TOKEN: '' });
    expect(lastCreateConfig().headers.Authorization).toBeUndefined();
  });

  it('normalizePhone conserve le 0 (225 + 10 chiffres)', () => {
    const p = makeProvider();
    expect(p.normalizePhone('0749326623')).toBe('2250749326623');
    expect(p.normalizePhone('749326623')).toBe('2250749326623'); // 9 chiffres réparés
    expect(p.normalizePhone('2250749326623')).toBe('2250749326623');
  });

  it('canSend() = enabled ET token présent', () => {
    expect(makeProvider().canSend()).toBe(true);
    expect(makeProvider({ SMSPRO_ENABLED: 'false' }).canSend()).toBe(false);
    expect(makeProvider({ SMSPRO_API_TOKEN: '' }).canSend()).toBe(false);
  });

  it('send() poste le bon body (SANS token : il est dans l’en-tête) et mappe status=success', async () => {
    mockPost.mockResolvedValue({ data: { status: 'success', data: { id: 'abc' } } });
    const p = makeProvider();
    const res = await p.send({ to: '0749326623', message: 'hi', reference: 'r1' });
    expect(mockPost).toHaveBeenCalledWith('/sms/send', {
      recipient: '2250749326623',
      sender_id: 'SGBNDCI',
      type: 'plain',
      message: 'hi',
    });
    // Le token ne doit jamais réapparaître dans le corps de la requête.
    expect(mockPost.mock.calls[0][1]).not.toHaveProperty('api_token');
    expect(res.success).toBe(true);
    expect(res.provider).toBe('smspro');
    expect(res.provider_message_id).toBe('abc');
  });

  it('getBalance() interroge /balance sans token en query string', async () => {
    mockGet.mockResolvedValue({
      data: { status: 'success', data: { remaining_balance: '15,020 FCFA' } },
    });
    const res = await makeProvider().getBalance();
    expect(mockGet).toHaveBeenCalledWith('/balance');
    expect(res.available).toBe(true);
    expect(res.display).toBe('15,020 FCFA');
  });

  it('send() : HTTP 200 mais enveloppe status=error => échec', async () => {
    mockPost.mockResolvedValue({ data: { status: 'error', message: 'Crédit insuffisant' } });
    const res = await makeProvider().send({ to: '0749326623', message: 'x' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Crédit insuffisant');
  });

  it('send() : erreur HTTP (422/429) => échec avec message exploitable', async () => {
    mockPost.mockRejectedValue({ response: { status: 422, data: { message: 'invalid sender' } } });
    const res = await makeProvider().send({ to: '0749326623', message: 'x' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('invalid sender');
  });
});

/// <reference types="jest" />
const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('axios', () => ({
  __esModule: true,
  default: { create: () => ({ post: mockPost, get: mockGet }) },
}));

import { SmspproSmsProvider } from './smspro-sms.provider';

function makeProvider(env: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    SMSPRO_API_TOKEN: 'tok',
    SMSPRO_SENDER_ID: 'SG-CI',
    SMSPRO_ENABLED: 'true',
  };
  const merged = { ...defaults, ...env };
  const config = { get: (k: string) => merged[k] };
  return new SmspproSmsProvider(config as any);
}

describe('SmspproSmsProvider', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
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

  it('send() poste le bon body (api_token dans le body, type plain) et mappe status=success', async () => {
    mockPost.mockResolvedValue({ data: { status: 'success', data: { id: 'abc' } } });
    const p = makeProvider();
    const res = await p.send({ to: '0749326623', message: 'hi', reference: 'r1' });
    expect(mockPost).toHaveBeenCalledWith('/sms/send', {
      api_token: 'tok',
      recipient: '2250749326623',
      sender_id: 'SG-CI',
      type: 'plain',
      message: 'hi',
    });
    expect(res.success).toBe(true);
    expect(res.provider).toBe('smspro');
    expect(res.provider_message_id).toBe('abc');
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

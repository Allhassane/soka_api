/// <reference types="jest" />
import { SmsDispatcher } from './sms-dispatcher.service';
import {
  SETTING_SMS_ACTIVE_PROVIDER,
  SETTING_SMS_FAILOVER_ENABLED,
  settingProviderEnabledKey,
} from './sms.constants';

function fakeProvider(name: string, opts: { canSend?: boolean; ok?: boolean } = {}) {
  const canSend = opts.canSend ?? true;
  const ok = opts.ok ?? true;
  return {
    name,
    canSend: () => canSend,
    send: jest.fn(async () =>
      ok
        ? { success: true, provider: name, provider_message_id: `${name}-1` }
        : { success: false, provider: name, error: `${name} down` },
    ),
  };
}

function makeSettings(vals: Record<string, string>) {
  return {
    get: async (k: string, fb: string) => (k in vals ? vals[k] : fb),
    getBool: async (k: string, fb: boolean) =>
      k in vals ? vals[k] === 'true' : fb,
  };
}

function makeDispatcher(
  providers: Record<string, any>,
  vals: Record<string, string>,
  isProd = false,
) {
  const registry = { get: (n: string) => providers[n] } as any;
  const settings = makeSettings(vals) as any;
  const appConfig = { isProd } as any;
  return new SmsDispatcher(registry, settings, appConfig);
}

const IN = { to: '0749326623', message: 'pw', reference: 'firstlogin-x' };

describe('SmsDispatcher', () => {
  it('actif OK => un seul fournisseur appelé', async () => {
    const letexto = fakeProvider('letexto', { ok: true });
    const smspro = fakeProvider('smspro', { ok: true });
    const d = makeDispatcher(
      { letexto, smspro },
      {
        [SETTING_SMS_ACTIVE_PROVIDER]: 'letexto',
        [SETTING_SMS_FAILOVER_ENABLED]: 'true',
      },
    );
    const res = await d.send(IN);
    expect(res.success).toBe(true);
    expect(res.provider).toBe('letexto');
    expect(letexto.send).toHaveBeenCalledTimes(1);
    expect(smspro.send).not.toHaveBeenCalled();
  });

  it('actif échoue + failover ON => bascule sur l’autre', async () => {
    const letexto = fakeProvider('letexto', { ok: false });
    const smspro = fakeProvider('smspro', { ok: true });
    const d = makeDispatcher(
      { letexto, smspro },
      {
        [SETTING_SMS_ACTIVE_PROVIDER]: 'letexto',
        [SETTING_SMS_FAILOVER_ENABLED]: 'true',
      },
    );
    const res = await d.send(IN);
    expect(res.success).toBe(true);
    expect(res.provider).toBe('smspro');
    expect(letexto.send).toHaveBeenCalledTimes(1);
    expect(smspro.send).toHaveBeenCalledTimes(1);
  });

  it('failover OFF => pas de bascule, renvoie l’échec de l’actif', async () => {
    const letexto = fakeProvider('letexto', { ok: false });
    const smspro = fakeProvider('smspro', { ok: true });
    const d = makeDispatcher(
      { letexto, smspro },
      {
        [SETTING_SMS_ACTIVE_PROVIDER]: 'letexto',
        [SETTING_SMS_FAILOVER_ENABLED]: 'false',
      },
    );
    const res = await d.send(IN);
    expect(res.success).toBe(false);
    expect(res.provider).toBe('letexto');
    expect(smspro.send).not.toHaveBeenCalled();
  });

  it('les deux échouent => dernière erreur, ne throw jamais', async () => {
    const letexto = fakeProvider('letexto', { ok: false });
    const smspro = fakeProvider('smspro', { ok: false });
    const d = makeDispatcher(
      { letexto, smspro },
      {
        [SETTING_SMS_ACTIVE_PROVIDER]: 'letexto',
        [SETTING_SMS_FAILOVER_ENABLED]: 'true',
      },
    );
    const res = await d.send(IN);
    expect(res.success).toBe(false);
    expect(res.provider).toBe('smspro'); // dernier tenté
  });

  it('actif désactivé (toggle) + failover => utilise l’autre activé', async () => {
    const letexto = fakeProvider('letexto', { ok: true });
    const smspro = fakeProvider('smspro', { ok: true });
    const d = makeDispatcher(
      { letexto, smspro },
      {
        [SETTING_SMS_ACTIVE_PROVIDER]: 'letexto',
        [SETTING_SMS_FAILOVER_ENABLED]: 'true',
        [settingProviderEnabledKey('letexto')]: 'false',
      },
    );
    const res = await d.send(IN);
    expect(res.success).toBe(true);
    expect(res.provider).toBe('smspro');
    expect(letexto.send).not.toHaveBeenCalled();
  });

  it('aucun fournisseur activable + DEV => simulation = SUCCÈS', async () => {
    const letexto = fakeProvider('letexto', { canSend: false });
    const smspro = fakeProvider('smspro', { canSend: false });
    const d = makeDispatcher(
      { letexto, smspro },
      { [SETTING_SMS_ACTIVE_PROVIDER]: 'letexto' },
      false,
    );
    const res = await d.send(IN);
    expect(res.success).toBe(true);
    expect(res.simulated).toBe(true);
    expect(letexto.send).not.toHaveBeenCalled();
  });

  it('aucun fournisseur activable + PROD => simulation = ÉCHEC (anti-verrouillage)', async () => {
    const letexto = fakeProvider('letexto', { canSend: false });
    const smspro = fakeProvider('smspro', { canSend: false });
    const d = makeDispatcher(
      { letexto, smspro },
      { [SETTING_SMS_ACTIVE_PROVIDER]: 'letexto' },
      true,
    );
    const res = await d.send(IN);
    expect(res.success).toBe(false);
    expect(res.simulated).toBe(true);
  });

  it('testSend refuse un fournisseur non activable (jamais de faux succès)', async () => {
    const letexto = fakeProvider('letexto', { canSend: false });
    const d = makeDispatcher({ letexto }, {});
    const res = await d.testSend('letexto', IN);
    expect(res.success).toBe(false);
    expect(letexto.send).not.toHaveBeenCalled();
  });

  it('testSend envoie via le fournisseur choisi si activable', async () => {
    const smspro = fakeProvider('smspro', { ok: true });
    const d = makeDispatcher({ smspro }, {});
    const res = await d.testSend('smspro', IN);
    expect(res.success).toBe(true);
    expect(smspro.send).toHaveBeenCalledTimes(1);
  });
});

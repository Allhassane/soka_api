/// <reference types="jest" />
import { SmsDispatcher } from './sms-dispatcher.service';
import {
  SETTING_SMS_ACTIVE_PROVIDER,
  SETTING_SMS_BROADCAST_ENABLED,
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
  // Les cas d'aiguillage/failover ci-dessous testent le mode NON diffusé : le
  // défaut `.env` est donc forcé à false, chaque test de diffusion posant
  // explicitement la clé en base.
  const appConfig = { isProd, smsBroadcastEnabled: false } as any;
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

  // --- Mode DIFFUSION : les DEUX fournisseurs envoient (2 SMS reçus) ---------
  describe('diffusion (broadcast)', () => {
    const BROADCAST = {
      [SETTING_SMS_ACTIVE_PROVIDER]: 'smspro',
      [SETTING_SMS_BROADCAST_ENABLED]: 'true',
    };

    it('envoie via TOUS les fournisseurs activés, exactement une fois chacun', async () => {
      const letexto = fakeProvider('letexto', { ok: true });
      const smspro = fakeProvider('smspro', { ok: true });
      const d = makeDispatcher({ letexto, smspro }, BROADCAST);
      const res = await d.send(IN);
      expect(res.success).toBe(true);
      expect(letexto.send).toHaveBeenCalledTimes(1);
      expect(smspro.send).toHaveBeenCalledTimes(1);
      expect(res.providers).toEqual(['smspro', 'letexto']); // actif d'abord
      expect(res.attempts).toHaveLength(2);
    });

    it('ignore le failover : il n’a plus d’objet quand tout le monde envoie', async () => {
      const letexto = fakeProvider('letexto', { ok: true });
      const smspro = fakeProvider('smspro', { ok: true });
      const d = makeDispatcher(
        { letexto, smspro },
        { ...BROADCAST, [SETTING_SMS_FAILOVER_ENABLED]: 'false' },
      );
      const res = await d.send(IN);
      expect(res.success).toBe(true);
      expect(letexto.send).toHaveBeenCalledTimes(1);
      expect(smspro.send).toHaveBeenCalledTimes(1);
    });

    it('un fournisseur en échec => SUCCÈS partiel (le membre a reçu son mot de passe)', async () => {
      const letexto = fakeProvider('letexto', { ok: false });
      const smspro = fakeProvider('smspro', { ok: true });
      const d = makeDispatcher({ letexto, smspro }, BROADCAST);
      const res = await d.send(IN);
      expect(res.success).toBe(true);
      expect(res.providers).toEqual(['smspro']);
      expect(res.error).toBeUndefined(); // invariant : error <=> !success
      expect(res.attempts?.filter((a) => !a.success)).toHaveLength(1);
    });

    it('les deux en échec => échec, avec les deux erreurs', async () => {
      const letexto = fakeProvider('letexto', { ok: false });
      const smspro = fakeProvider('smspro', { ok: false });
      const d = makeDispatcher({ letexto, smspro }, BROADCAST);
      const res = await d.send(IN);
      expect(res.success).toBe(false);
      expect(res.providers).toEqual([]);
      expect(res.error).toContain('smspro down');
      expect(res.error).toContain('letexto down');
    });

    it('n’envoie que par les fournisseurs activés en base', async () => {
      const letexto = fakeProvider('letexto', { ok: true });
      const smspro = fakeProvider('smspro', { ok: true });
      const d = makeDispatcher(
        { letexto, smspro },
        { ...BROADCAST, [settingProviderEnabledKey('letexto')]: 'false' },
      );
      const res = await d.send(IN);
      expect(res.success).toBe(true);
      expect(res.providers).toEqual(['smspro']);
      expect(letexto.send).not.toHaveBeenCalled();
    });

    it('un fournisseur non activable est écarté (pas d’échec parasite)', async () => {
      const letexto = fakeProvider('letexto', { canSend: false });
      const smspro = fakeProvider('smspro', { ok: true });
      const d = makeDispatcher({ letexto, smspro }, BROADCAST);
      const res = await d.send(IN);
      expect(res.success).toBe(true);
      expect(res.providers).toEqual(['smspro']);
      expect(letexto.send).not.toHaveBeenCalled();
    });

    it('aucun fournisseur activable + PROD => ÉCHEC (anti-verrouillage préservé)', async () => {
      const letexto = fakeProvider('letexto', { canSend: false });
      const smspro = fakeProvider('smspro', { canSend: false });
      const d = makeDispatcher({ letexto, smspro }, BROADCAST, true);
      const res = await d.send(IN);
      expect(res.success).toBe(false);
      expect(res.simulated).toBe(true);
    });

    it('les envois sont PARALLÈLES (chemin synchrone du login)', async () => {
      // Chaque provider ne rend la main que lorsque les DEUX ont démarré :
      // en série, ce test resterait bloqué (timeout Jest).
      let started = 0;
      let unlock: () => void;
      const bothStarted = new Promise<void>((r) => (unlock = r));
      const slow = (name: string) => ({
        name,
        canSend: () => true,
        send: jest.fn(async () => {
          if (++started === 2) unlock();
          await bothStarted;
          return { success: true, provider: name };
        }),
      });
      const d = makeDispatcher(
        { letexto: slow('letexto'), smspro: slow('smspro') },
        BROADCAST,
      );
      const res = await d.send(IN);
      expect(res.success).toBe(true);
      expect(started).toBe(2);
    });

    it('le défaut `.env` s’applique quand la base ne dit rien', async () => {
      const letexto = fakeProvider('letexto', { ok: true });
      const smspro = fakeProvider('smspro', { ok: true });
      const registry = {
        get: (n: string) => ({ letexto, smspro })[n],
      } as any;
      const settings = makeSettings({}) as any;
      const d = new SmsDispatcher(registry, settings, {
        isProd: false,
        smsBroadcastEnabled: true,
      } as any);
      const res = await d.send(IN);
      expect(res.success).toBe(true);
      expect(letexto.send).toHaveBeenCalledTimes(1);
      expect(smspro.send).toHaveBeenCalledTimes(1);
    });
  });
});

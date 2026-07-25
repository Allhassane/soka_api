/// <reference types="jest" />
// Les globals Jest ne sont pas dans le tsconfig global (types: ["node","multer"]).
import { SettingsService } from './settings.service';

function makeRepo(init: Record<string, string | null> = {}) {
  const store = new Map<string, string | null>(Object.entries(init));
  return {
    _store: store,
    findOne: jest.fn(async ({ where }: any) => {
      const k = where.setting_key;
      return store.has(k)
        ? { setting_key: k, setting_value: store.get(k) ?? null }
        : null;
    }),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => {
      store.set(x.setting_key, x.setting_value ?? null);
      return x;
    }),
  };
}

describe('SettingsService', () => {
  it('get() retombe sur le fallback si la clé est absente', async () => {
    const s = new SettingsService(makeRepo() as any);
    expect(await s.get('sms.active_provider', 'letexto')).toBe('letexto');
  });

  it('get() retourne la valeur stockée', async () => {
    const s = new SettingsService(
      makeRepo({ 'sms.active_provider': 'smspro' }) as any,
    );
    expect(await s.get('sms.active_provider', 'letexto')).toBe('smspro');
  });

  it('getBool() interprète true/false et le fallback', async () => {
    const s = new SettingsService(makeRepo({ x: 'true', y: 'false' }) as any);
    expect(await s.getBool('x', false)).toBe(true);
    expect(await s.getBool('y', true)).toBe(false);
    expect(await s.getBool('absent', true)).toBe(true);
  });

  it('get() NE LÈVE JAMAIS : repli défensif si le repo échoue (DB down)', async () => {
    const repo = {
      findOne: jest.fn(async () => {
        throw new Error('DB down');
      }),
    };
    const s = new SettingsService(repo as any);
    // Chemin d'auth : ne doit pas casser le login/reset.
    expect(await s.get('k', 'defaut')).toBe('defaut');
    expect(await s.getBool('k', true)).toBe(true);
  });

  it('set() upsert + invalide le cache (lecture suivante = nouvelle valeur)', async () => {
    const s = new SettingsService(makeRepo({ k: 'old' }) as any);
    expect(await s.get('k', 'x')).toBe('old');
    await s.set('k', 'new');
    expect(await s.get('k', 'x')).toBe('new');
  });
});

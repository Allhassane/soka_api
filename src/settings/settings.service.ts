import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from './entities/app-setting.entity';

interface CacheEntry {
  value: string | null;
  ts: number;
}

/**
 * Lecture/écriture des réglages runtime (`app_settings`) avec un cache mémoire à
 * TTL court.
 *
 * Invariants CRITIQUES (ce service est sur le chemin d'auth : 1re connexion /
 * mot de passe oublié) :
 *  - `get()` ne LÈVE JAMAIS : toute erreur (table absente en dev avant migration,
 *    DB indisponible…) retombe sur la valeur par défaut fournie. Sans ça, un hoquet
 *    DB casserait le login/reset en 500.
 *  - `set()` invalide le cache IMMÉDIATEMENT → la bascule de fournisseur prend effet
 *    au prochain envoi, sans redéploiement. Le TTL court (30 s) propage les
 *    changements entre plusieurs instances (le cache est par-process).
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 30_000;

  constructor(
    @InjectRepository(AppSetting)
    private readonly repo: Repository<AppSetting>,
  ) {}

  /** Lecture brute défensive. Retourne `undefined` si absent, `fallback` sur erreur. */
  private async readRaw(key: string): Promise<string | null | undefined> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.ttlMs) {
      return cached.value ?? undefined;
    }
    const row = await this.repo.findOne({ where: { setting_key: key } });
    const value = row ? row.setting_value : null;
    this.cache.set(key, { value: row ? value : null, ts: Date.now() });
    return row ? (value ?? null) : undefined;
  }

  /** Chaîne. Ne throw jamais : retombe sur `fallback` en cas d'absence OU d'erreur. */
  async get(key: string, fallback: string): Promise<string> {
    try {
      const v = await this.readRaw(key);
      return v === undefined || v === null ? fallback : v;
    } catch (err) {
      this.logger.warn(
        `SettingsService.get('${key}') a échoué (repli sur défaut '${fallback}') : ${(err as Error)?.message}`,
      );
      return fallback;
    }
  }

  /** Booléen. `'true'` (insensible à la casse) => true. Ne throw jamais. */
  async getBool(key: string, fallback: boolean): Promise<boolean> {
    const raw = await this.get(key, fallback ? 'true' : 'false');
    return raw.trim().toLowerCase() === 'true';
  }

  /** Upsert + invalidation immédiate du cache. */
  async set(
    key: string,
    value: string,
    type: 'string' | 'boolean' | 'json' = 'string',
  ): Promise<void> {
    const existing = await this.repo.findOne({ where: { setting_key: key } });
    if (existing) {
      existing.setting_value = value;
      existing.type = type;
      await this.repo.save(existing);
    } else {
      await this.repo.save(
        this.repo.create({ setting_key: key, setting_value: value, type }),
      );
    }
    this.cache.set(key, { value, ts: Date.now() });
  }

  /** Force l'oubli d'une clé (utile en tests / après un set externe). */
  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}

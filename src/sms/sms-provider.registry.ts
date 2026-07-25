import { Inject, Injectable } from '@nestjs/common';
import { SMS_PROVIDERS } from './sms-providers.token';
import type { ManagedSmsProvider } from './interfaces/managed-sms-provider.interface';
import { SMS_PROVIDER_NAMES, SmsProviderName } from './sms.constants';

/**
 * Annuaire des fournisseurs SMS transactionnels (letexto, smspro). Construit une
 * Map name -> provider à partir des instances injectées, et expose la liste
 * ORDONNÉE (ordre canonique de `SMS_PROVIDER_NAMES`).
 */
@Injectable()
export class SmsProviderRegistry {
  private readonly byName = new Map<string, ManagedSmsProvider>();

  constructor(
    @Inject(SMS_PROVIDERS) providers: ManagedSmsProvider[],
  ) {
    for (const p of providers) this.byName.set(p.name, p);
  }

  get(name: string): ManagedSmsProvider | undefined {
    return this.byName.get(name);
  }

  /** Providers connus, dans l'ordre canonique. */
  list(): ManagedSmsProvider[] {
    return SMS_PROVIDER_NAMES.map((n) => this.byName.get(n)).filter(
      (p): p is ManagedSmsProvider => !!p,
    );
  }

  names(): SmsProviderName[] {
    return SMS_PROVIDER_NAMES;
  }
}

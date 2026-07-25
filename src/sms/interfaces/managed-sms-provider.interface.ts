import type { NotificationProvider } from 'src/journals/interfaces/sms-provider.interface';

/** Solde d'un fournisseur (best-effort, pour l'UI admin). */
export interface ProviderBalance {
  provider: string;
  /** `true` si le solde a pu être lu. */
  available: boolean;
  /** Affichage prêt à l'emploi (ex. « 80 FCFA », « 7335 XOF »), ou null. */
  display: string | null;
  raw?: any;
}

/**
 * Fournisseur SMS piloté par le `SmsDispatcher` : c'est un `NotificationProvider`
 * (transport pur `send()`) enrichi de la capacité à dire s'il peut RÉELLEMENT
 * envoyer (`canSend`) et, optionnellement, à remonter son solde.
 *
 * `send()` effectue l'appel réseau réel sans se soucier des toggles : c'est le
 * DISPATCHER qui décide QUI appeler (provider actif, failover, simulation) — les
 * providers ne s'auto-simulent pas (sinon un « succès simulé » masquerait un échec
 * et défairait le failover).
 */
export interface ManagedSmsProvider extends NotificationProvider {
  /** `true` si credentials présents ET envoi réel autorisé par l'environnement. */
  canSend(): boolean;
  /** Solde best-effort — ne LÈVE JAMAIS (retourne available:false en cas d'erreur). */
  getBalance?(): Promise<ProviderBalance>;
}

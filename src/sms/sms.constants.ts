/**
 * Constantes partagées du sous-système SMS multi-fournisseurs (LeTexto + SMSPro).
 *
 * ⚠️ Les slugs de permission ci-dessous sont référencés à TROIS endroits qui DOIVENT
 * rester strictement identiques, sinon un ADMINISTRATEUR non-superadmin reçoit un 403
 * silencieux : (1) le décorateur `@RequirePermissions` du contrôleur, (2) la migration
 * de seed qui attribue la permission au rôle, (3) le front (menu + `<Protected>`).
 * Un test unitaire vérifie l'égalité décorateur == seed.
 */

/** Noms internes des fournisseurs transactionnels (colonne `provider` des résultats). */
export const SMS_PROVIDER_LETEXTO = 'letexto';
export const SMS_PROVIDER_SMSPRO = 'smspro';

export type SmsProviderName =
  | typeof SMS_PROVIDER_LETEXTO
  | typeof SMS_PROVIDER_SMSPRO;

/** Liste ordonnée des fournisseurs pilotables via la page de paramètres. */
export const SMS_PROVIDER_NAMES: SmsProviderName[] = [
  SMS_PROVIDER_LETEXTO,
  SMS_PROVIDER_SMSPRO,
];

/** Libellés lisibles (UI admin). */
export const SMS_PROVIDER_LABELS: Record<SmsProviderName, string> = {
  [SMS_PROVIDER_LETEXTO]: 'LeTexto',
  [SMS_PROVIDER_SMSPRO]: 'SMSPro Africa',
};

// --- Clés de réglage runtime (table `app_settings`) ------------------------
export const SETTING_SMS_ACTIVE_PROVIDER = 'sms.active_provider';
export const SETTING_SMS_FAILOVER_ENABLED = 'sms.failover.enabled';
/** Toggle « activé » par fournisseur : `sms.provider.<name>.enabled`. */
export const settingProviderEnabledKey = (name: string): string =>
  `sms.provider.${name}.enabled`;

/**
 * Fournisseur actif par défaut **quand rien d'autre ne le dit** : ni `.env`
 * (`SMS_ACTIVE_PROVIDER`), ni la base (`app_settings`).
 *
 * ⚠️ Ce n'est PAS le seul point de décision - il y a trois niveaux, du plus fort
 * au plus faible :
 *   1. `app_settings.sms.active_provider` (bascule à chaud, écrite par l'écran
 *      d'administration) ;
 *   2. `.env` `SMS_ACTIVE_PROVIDER` (défaut de déploiement) ;
 *   3. cette constante.
 * La migration `CreateAppSettings` sème une ligne au niveau 1 : sans la basculer,
 * changer le `.env` n'a aucun effet visible. C'est le rôle de
 * `SetSmsproAsDefaultProvider`.
 */
export const SMS_DEFAULT_ACTIVE_PROVIDER: SmsProviderName = SMS_PROVIDER_SMSPRO;

/** Garde de type : l'entrée est-elle un nom de fournisseur connu ? */
export const isSmsProviderName = (
  value: unknown,
): value is SmsProviderName =>
  typeof value === 'string' &&
  (SMS_PROVIDER_NAMES as readonly string[]).includes(value);

// --- RBAC : slugs de permission (voir avertissement en tête de fichier) -----
/** Lecture de l'état SMS (dont le SOLDE, sensible). */
export const PERM_PARAMETRES_VOIR_SMS = 'parametres_voir_sms';
/** Bascule / activation / test d'envoi. */
export const PERM_PARAMETRES_GERER_SMS = 'parametres_gerer_sms';

// --- Provisioning du module/permissions (migration de seed) -----------------
export const PARAMETRES_MODULE_NAME = 'Paramètres';
export const PARAMETRES_MODULE_SLUG = 'parametres';
export const PERM_VOIR_SMS_NAME = 'Voir les paramètres SMS';
export const PERM_GERER_SMS_NAME = 'Gérer les paramètres SMS';

import * as process from 'process';
import * as dotenv from 'dotenv';

dotenv.config();

export const SMTP_HOST = process.env.MAIL_HOST;
export const SMTP_PORT = process.env.MAIL_PORT ?? '25';
export const SMTP_USER = process.env.MAIL_USERNAME;
export const SMTP_PASSWORD = process.env.MAIL_PASSWORD;
export const FROM = process.env.MAIL_FROM_ADRESSE;
export const MAIL_FROM = process.env.MAIL_FROM_ADRESSE;

export const MIGRATION_URL = process.env.MIGRATION_URL;

// L'application n'a que 3 rôles. Slugs canoniques (cf. scripts/setup-3-roles.js et RoleService.onModuleInit).
export const ROLE_ADMIN_SLUG = 'administrateur';
export const ROLE_RESPONSABLE_SLUG = 'responsable';
export const ROLE_MEMBRE_SLUG = 'membre';

/**
 * Rôles SYSTÈME : ces 3 slugs pilotent la dérivation des droits au login (`auth.service.ts`).
 * Les renommer, les désactiver ou les supprimer casserait l'authentification ⇒ `RoleService`
 * refuse (403) toute modification de nom, tout changement de statut et toute suppression sur eux.
 * Seules leurs permissions restent modifiables.
 */
export const SYSTEM_ROLE_SLUGS: readonly string[] = [
  ROLE_ADMIN_SLUG,
  ROLE_RESPONSABLE_SLUG,
  ROLE_MEMBRE_SLUG,
];
export const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

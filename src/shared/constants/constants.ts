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
export const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

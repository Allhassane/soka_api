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

export const ROLE_MEMBER_SLUG = 'responsable-membre';

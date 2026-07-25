import * as Joi from 'joi';
import { AppEnv } from '../shared/enums/app-env.enum';

export const envValidationSchema = Joi.object({
  APP_ENV: Joi.string()
    .valid(...Object.values(AppEnv))
    .default(AppEnv.DEVELOPMENT),

  APP_PORT: Joi.number().default(3000),
  APP_HOST: Joi.string().default('localhost'),

  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('3600s'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').optional(),
  //DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  // --- SOKA Pay (microservice de paiement HUB2) ---
  // Optionnels : l'API démarre sans ; seuls les endpoints SOKA Pay exigent la config.
  SOKA_PAY_BASE_URL: Joi.string().uri().default('http://localhost:3001'),
  SOKA_PAY_API_KEY: Joi.string().allow('').default(''),
  SOKA_PAY_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  SOKA_PAY_CALLBACK_URL: Joi.string().allow('').default(''),

  // --- SMS transactionnel : LeTexto (auth : 1re connexion + mot de passe oublié) ---
  // ENABLED gardé en STRING ('true'/'false') : les providers le lisent en string.
  LETEXTO_API_KEY: Joi.string().allow('').default(''),
  LETEXTO_BASE_URL: Joi.string().uri().default('https://apis.letexto.com/v1'),
  LETEXTO_SENDER: Joi.string().default('SG-CI'),
  LETEXTO_ENABLED: Joi.string().valid('true', 'false').default('false'),
  LETEXTO_TIMEOUT_MS: Joi.number().default(8000),

  // --- SMS transactionnel : SMSPro Africa (2e fournisseur, failover) ---
  SMSPRO_API_TOKEN: Joi.string().allow('').default(''),
  SMSPRO_BASE_URL: Joi.string().uri().default('https://app.smspro.africa/api/http'),
  SMSPRO_SENDER_ID: Joi.string().default('SG-CI'),
  SMSPRO_ENABLED: Joi.string().valid('true', 'false').default('false'),
  SMSPRO_TIMEOUT_MS: Joi.number().default(8000),
});

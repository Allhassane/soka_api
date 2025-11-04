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
});

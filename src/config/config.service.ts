import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from 'src/shared/enums/app-env.enum';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return this.config.get<number>('APP_PORT') ?? 3000;
  }

  get host(): string {
    return this.config.get<string>('APP_HOST') ?? 'localhost';
  }

  get appUrl(): string {
    return `http://${this.host}:${this.port}/`;
  }

  get jwtSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in the environment');
    }
    return secret;
  }

  get jwtExpiresIn(): string {
    return this.config.get<string>('JWT_EXPIRES_IN') ?? '3600';
  }

  get dbUser(): string {
    return this.config.get<string>('DB_USER') ?? 'root';
  }

  get dbPassword(): string {
    return this.config.get<string>('DB_PASSWORD') ?? '';
  }

  get dbHost(): string {
    return this.config.get<string>('DB_HOST') ?? 'localhost';
  }

  get dbPort(): number {
    return Number(this.config.get<number>('DB_PORT') ?? 3306);
  }

  get dbName(): string {
    return this.config.get<string>('DB_NAME') ?? 'soka_db';
  }

  get nodeEnv(): AppEnv {
    return this.config.get<AppEnv>('APP_ENV', AppEnv.DEVELOPMENT);
  }

  get isProd(): boolean {
    return this.nodeEnv === AppEnv.PRODUCTION;
  }
}

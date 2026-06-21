import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

/**
 * DataSource dédié à la CLI TypeORM (migrations).
 * Indépendant de NestJS : il charge `.env` manuellement (aucune dépendance dotenv requise),
 * pointe sur les entités TS et le dossier `src/migrations`.
 *
 * Usage (cf. scripts package.json) :
 *   npm run migration:generate -- src/migrations/NomDeLaMigration
 *   npm run migration:run
 *   npm run migration:revert
 *
 * IMPORTANT : `synchronize: false`. Les migrations sont le SEUL moyen de faire évoluer le schéma.
 */
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'soka_db',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  // Table de suivi DÉDIÉE : `migrations` existe déjà (héritée de Laravel, schéma incompatible).
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: ['error', 'warn'],
});

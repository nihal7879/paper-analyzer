// Knex config for migrations, seeds and scripts.
// Reads the shared .env at the repo root (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME).
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rootEnv = resolve(here, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error(`Missing database settings in .env: ${missing.join(', ')}`);
}

/** @type {import('knex').Knex.Config} */
export default {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    // Keep dates as strings exactly as stored; JSON columns come back parsed.
    dateStrings: true,
    supportBigNumbers: true,
  },
  pool: { min: 0, max: 10 },
  migrations: {
    directory: resolve(here, 'migrations'),
    loadExtensions: ['.mjs'],
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: resolve(here, 'seeds'),
    loadExtensions: ['.mjs'],
  },
};

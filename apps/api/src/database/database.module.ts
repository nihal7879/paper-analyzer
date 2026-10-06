import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knexFactory, { type Knex } from 'knex';
import type { Env } from '../config/env.js';

export const KNEX = Symbol('KNEX');

/** One shared Knex (MySQL) connection pool for the whole API. */
@Global()
@Module({
  providers: [
    {
      provide: KNEX,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Knex =>
        knexFactory({
          client: 'mysql2',
          connection: {
            host: config.get('DB_HOST', { infer: true }),
            port: config.get('DB_PORT', { infer: true }),
            user: config.get('DB_USER', { infer: true }),
            password: config.get('DB_PASSWORD', { infer: true }),
            database: config.get('DB_NAME', { infer: true }),
            charset: 'utf8mb4',
            dateStrings: true,
            supportBigNumbers: true,
            // DECIMAL comes back as a string by default; confidence is small, so a number is safe.
            decimalNumbers: true,
          },
          pool: { min: 0, max: 10 },
        }),
    },
  ],
  exports: [KNEX],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KNEX) private readonly knex: Knex) {}

  async onApplicationShutdown() {
    await this.knex.destroy();
  }
}

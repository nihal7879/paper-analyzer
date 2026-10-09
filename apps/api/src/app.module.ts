import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { PapersModule } from './papers/papers.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StorageModule } from './storage/storage.module.js';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // apps/api/.env (the API's own settings and secrets).
      envFilePath: [resolve(process.cwd(), '.env')],
      validate: validateEnv,
    }),
    StorageModule,
    DatabaseModule,
    AuthModule,
    PapersModule,
    SettingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { StorageService } from './storage/storage.service.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const storage = app.get(StorageService);
  await storage.init();

  app.setGlobalPrefix('api');
  // gzip JSON/text (the question bank shrinks ~85%); images and PDFs are already compressed and are skipped.
  app.use(compression());
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }) });
  // Phase 0: page images and cropped reference images served straight from local disk.
  app.useStaticAssets(storage.root, { prefix: '/files', maxAge: '7d', dotfiles: 'deny' });

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  console.log(`API on http://localhost:${port}/api  ·  storage: ${storage.root}  ·  AI: ${config.get('AI_PROVIDER', { infer: true })}`);
}
await bootstrap();

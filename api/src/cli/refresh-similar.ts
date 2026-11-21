/**
 * Build vectors (free local model) and similar-question lists for every subject.
 *   node dist/cli/refresh-similar.js
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { SimilarityService } from '../similarity/similarity.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
try {
  const t0 = Date.now();
  const results = await app.get(SimilarityService).refreshAll();
  for (const r of results) console.log(`subject ${r.subjectId}: ${r.questions} questions, ${r.embedded} newly embedded`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} finally {
  await app.close();
}

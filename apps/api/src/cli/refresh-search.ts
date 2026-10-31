/**
 * Rebuild the search words (questions.search_text) of every question, e.g. after topics were renamed or re-tagged.
 *   node dist/cli/refresh-search.js
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { BankSearchService } from '../papers/bank-search.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
try {
  const t0 = Date.now();
  const n = await app.get(BankSearchService).refreshSearchText({});
  console.log(`search text rebuilt for ${n} questions in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} finally {
  await app.close();
}

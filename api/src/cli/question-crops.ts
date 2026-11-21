/**
 * Cut worksheet crops (each question exactly as printed) for papers already in the system.
 *   node dist/cli/question-crops.js --all              every paper
 *   node dist/cli/question-crops.js --all --missing    only parts that have no crop yet
 *   node dist/cli/question-crops.js 8PH0_s22_01 ...    chosen papers
 * Uses the AI set in .env (it only returns box positions, so it costs very few tokens).
 */
import { NestFactory } from '@nestjs/core';
import type { Knex } from 'knex';
import { AppModule } from '../app.module.js';
import { KNEX } from '../database/database.module.js';
import { QuestionCropsService } from '../processing/question-crops.service.js';

const args = process.argv.slice(2);
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
try {
  const db = app.get<Knex>(KNEX);
  const slugs = args.includes('--all') ? (await db('papers').orderBy('year').select('slug')).map((r: { slug: string }) => r.slug) : args.filter((a) => !a.startsWith('--'));
  if (!slugs.length) throw new Error('Give paper ids (e.g. 8PH0_s22_01) or --all');
  const crops = app.get(QuestionCropsService);
  const t0 = Date.now();
  for (const slug of slugs) {
    try {
      const r = await crops.buildForPaper(slug, { onlyMissing: args.includes('--missing') });
      console.log(`${slug}: cut ${r.qp} question + ${r.ms} mark-scheme parts · ${r.parts - r.notFound.length}/${r.parts} parts have a question crop${r.notFound.length ? ` · none: ${r.notFound.join(', ')}` : ''}`);
    } catch (err) {
      console.error(`${slug}: failed: ${(err as Error).message}`);
    }
  }
  console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
} finally {
  await app.close();
}

// Re-cut ONLY the mark-scheme crops of the given papers (dev DB), like buildForPaper's mark-scheme half. Usage: node cut-ms-only.mjs <slug>...
import { NestFactory } from '@nestjs/core';
import { AppModule } from './dist/app.module.js';
import { KNEX } from './dist/database/database.module.js';
import { QuestionCropsService } from './dist/processing/question-crops.service.js';
import fs from 'fs';
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const db = app.get(KNEX);
const svc = app.get(QuestionCropsService);
for (const slug of process.argv.slice(2)) {
  try {
    const paper = await db('papers').where({ slug }).first('id');
    const parts = await db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').orderBy('sort_order').select('id', 'number');
    const f = `D:/paper-analyzer-storage/papers/${slug}/ms.pdf`;
    if (!fs.existsSync(f)) { console.log(`${slug}: no ms.pdf`); continue; }
    const buf = fs.readFileSync(f);
    const plans = await svc.findMarkSchemeBoxes(slug, buf, parts);
    if (plans.size) await svc.saveCrops(slug, 'MS', buf, plans);
    console.log(`${slug}: MS cut ${plans.size} parts`);
  } catch (e) { console.log(`${slug}: failed: ${e.message}`.slice(0, 160)); }
}
await app.close();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './dist/app.module.js';
import { KNEX } from './dist/database/database.module.js';
import { QuestionCropsService } from './dist/processing/question-crops.service.js';
import fs from 'fs';
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const db = app.get(KNEX);
const svc = app.get(QuestionCropsService);
for (const slug of process.argv.slice(2)) {
  const paper = await db('papers').where({ slug }).first('id');
  const parts = await db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').orderBy('sort_order').select('id', 'number');
  const plans = await svc.findQuestionBoxes(slug, fs.readFileSync(`D:/paper-analyzer-storage/papers/${slug}/qp.pdf`), parts);
  let n = 0; for (const p of parts) { const c = plans.get(p.id)?.crops ?? []; n += c.length; if (process.env.SHOW && c.length > 1) console.log('  ', p.number, c.map(x => 'p' + x.page + ' ' + x.box.y0 + '-' + x.box.y1).join(' | ')); }
  const [{ c }] = await db('question_images').whereIn('question_id', parts.map(p => p.id)).where({ kind: 'FULL', source: 'QP' }).count({ c: '*' });
  console.log(slug, 'planned crops now', n, '| in DB (old cut)', c);
}
await app.close();

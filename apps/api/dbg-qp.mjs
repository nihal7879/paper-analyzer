import { NestFactory } from '@nestjs/core';
import { AppModule } from './dist/app.module.js';
import { KNEX } from './dist/database/database.module.js';
import { QuestionCropsService } from './dist/processing/question-crops.service.js';
import fs from 'fs';
const [slug, ...nums] = process.argv.slice(2);
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const db = app.get(KNEX);
const paper = await db('papers').where({ slug }).first('id');
const parts = await db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').orderBy('sort_order').select('id', 'number');
const svc = app.get(QuestionCropsService);
const plans = await svc.findQuestionBoxes(slug, fs.readFileSync(`D:/paper-analyzer-storage/papers/${slug}/qp.pdf`), parts);
for (const p of parts.filter(p => nums.includes(p.number))) { const pl = plans.get(p.id); console.log(p.number, pl ? pl.crops.map(c => `p${c.page} ${c.box.y0}-${c.box.y1}`).join(' | ') : 'none'); }
await app.close();

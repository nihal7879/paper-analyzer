/**
 * Import Claude Code extractions into the database.
 *
 *   node dist/cli/import-extractions.js                 -> every JSON in <STORAGE_ROOT>/claude-extractions
 *   node dist/cli/import-extractions.js 8PH0_s16_01     -> one file
 */
import { NestFactory } from '@nestjs/core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../app.module.js';
import { ImportService } from '../papers/import.service.js';
import { StorageService } from '../storage/storage.service.js';

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
try {
  const importer = app.get(ImportService);
  const dir = join(app.get(StorageService).root, 'claude-extractions');
  const only = process.argv[2];
  const files = only ? [join(dir, only.endsWith('.json') ? only : `${only}.json`)] : existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)) : [];
  if (!files.length) console.log(`No extraction files in ${dir}`);

  let ok = 0;
  for (const file of files.sort()) {
    try {
      const r = await importer.importFile(file);
      ok++;
      console.log(`✓ ${r.slug}: ${r.questions} questions, ${r.withAnswer} with answers, ${r.images} diagrams, ${r.marks}${r.totalMarks ? `/${r.totalMarks}` : ''} marks`);
      for (const w of r.warnings) console.log(`   ! ${w}`);
    } catch (err) {
      console.log(`✗ ${file}: ${(err as Error).message}`);
    }
  }
  console.log(`${ok}/${files.length} imported`);
} finally {
  await app.close();
}

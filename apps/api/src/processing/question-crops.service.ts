import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Knex } from 'knex';
import { EXTRACTION_PROVIDER, type ExtractionProvider } from '../ai/ai.types.js';
import { KNEX } from '../database/database.module.js';
import { paperKeys } from '../papers/paper-keys.js';
import type { Box } from '../papers/paper.types.js';
import { StorageService } from '../storage/storage.service.js';
import { cropForPrint, normaliseBox, renderPdfPagesAt } from './pdf-images.js';

/**
 * Worksheet crops: each question part cut out of the original paper exactly as printed (text, diagrams, tables,
 * answer lines, marks, and the paper's own spacing), so a downloaded worksheet looks like the real paper.
 *
 * The AI only says WHERE each part is on the page (no retyping, so very few tokens); the cut itself is done here
 * from a ~250 DPI render of the original PDF, and saved as question_images rows with kind = 'FULL'.
 */
@Injectable()
export class QuestionCropsService {
  private readonly logger = new Logger(QuestionCropsService.name);

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly storage: StorageService,
    @Inject(EXTRACTION_PROVIDER) private readonly ai: ExtractionProvider,
  ) {}

  /** Find and cut the whole-question crops of one paper. `onlyMissing` skips parts that already have crops. */
  async buildForPaper(slug: string, opts: { onlyMissing?: boolean } = {}): Promise<{ parts: number; crops: number; pages: number; notFound: string[] }> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error(`Paper ${slug} not found`);
    const keys = paperKeys(slug);
    if (!this.storage.exists(keys.qp)) throw new Error(`${slug}: question paper PDF is missing`);

    let questions: { id: number; number: string; page: number; pages: unknown }[] = await this.db('questions')
      .where({ paper_id: paper.id })
      .whereNull('deleted_at')
      .orderBy('sort_order')
      .select('id', 'number', 'page', 'pages');
    if (opts.onlyMissing) {
      const done = new Set((await this.db('question_images').whereIn('question_id', questions.map((q) => q.id)).where('kind', 'FULL').distinct('question_id')).map((r: { question_id: number }) => r.question_id));
      questions = questions.filter((q) => !done.has(q.id));
    }
    if (!questions.length) return { parts: 0, crops: 0, pages: 0, notFound: [] };

    // Which parts are on which page (a part can run over two pages)
    const pagesOf = (q: { page: number; pages: unknown }) => {
      const list = (typeof q.pages === 'string' ? JSON.parse(q.pages) : q.pages) as number[] | null;
      return list?.length ? list : [q.page];
    };
    const onPage = new Map<number, typeof questions>();
    for (const q of questions) for (const p of pagesOf(q)) onPage.set(p, [...(onPage.get(p) ?? []), q]);

    const pageNumbers = [...onPage.keys()].sort((a, b) => a - b);
    const hiRes = await renderPdfPagesAt(await this.storage.read(keys.qp), pageNumbers);
    const found = new Map<number, { page: number; box: Box }[]>();

    for (const page of pageNumbers) {
      const parts = onPage.get(page)!;
      const pageKey = keys.page('qp', page);
      if (!this.storage.exists(pageKey) || !hiRes.has(page)) continue;
      let boxes: { number: string; x0: number; y0: number; x1: number; y1: number }[] = [];
      try {
        boxes = (await this.ai.findQuestionBoxes(await this.storage.read(pageKey), page, parts.map((q) => q.number))).boxes;
      } catch (err) {
        this.logger.warn(`${slug}: page ${page} boxes skipped: ${(err as Error).message}`);
        continue;
      }
      for (const b of boxes) {
        const q = matchPart(b.number, parts);
        const box = normaliseBox(b);
        if (!q || !box) continue;
        const list = found.get(q.id) ?? [];
        const same = list.find((c) => c.page === page);
        // the same part listed twice on one page: one box around both
        if (same) same.box = { x0: Math.min(same.box.x0, box.x0), y0: Math.min(same.box.y0, box.y0), x1: Math.max(same.box.x1, box.x1), y1: Math.max(same.box.y1, box.y1) };
        else list.push({ page, box });
        found.set(q.id, list);
      }
    }

    // Cut and save (replacing older crops of the same parts)
    const stamp = Date.now().toString(36);
    let crops = 0;
    const rows: { question_id: number; kind: 'FULL'; source: 'QP'; page: number; box: string; file_path: string; sort_order: number }[] = [];
    for (const [questionId, list] of found) {
      list.sort((a, b) => a.page - b.page);
      for (const [k, c] of list.entries()) {
        const path = `${keys.dir}/questions/q${questionId}-full-p${c.page}-${stamp}.jpg`;
        await this.storage.write(path, await cropForPrint(hiRes.get(c.page)!, c.box));
        rows.push({ question_id: questionId, kind: 'FULL', source: 'QP', page: c.page, box: JSON.stringify(c.box), file_path: path, sort_order: k });
        crops++;
      }
    }
    await this.db.transaction(async (trx) => {
      if (found.size) await trx('question_images').whereIn('question_id', [...found.keys()]).where({ kind: 'FULL', source: 'QP' }).delete();
      if (rows.length) await trx('question_images').insert(rows);
    });
    const notFound = questions.filter((q) => !found.has(q.id)).map((q) => q.number);
    this.logger.log(`${slug}: ${crops} worksheet crops for ${found.size}/${questions.length} parts${notFound.length ? ` (no box: ${notFound.join(', ')})` : ''}`);
    return { parts: questions.length, crops, pages: pageNumbers.length, notFound };
  }
}

/** "11 (a)(i)" / "(a)(i)" from the AI -> the listed part "11(a)(i)". */
function matchPart<T extends { number: string }>(raw: string, parts: T[]): T | undefined {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const n = norm(raw);
  const exact = parts.find((p) => norm(p.number) === n);
  if (exact) return exact;
  const ends = parts.filter((p) => norm(p.number).endsWith(n));
  return ends.length === 1 ? ends[0] : undefined;
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { EXTRACTION_PROVIDER, type ExtractionProvider, type MarkSchemePage, type PageContext } from '../ai/ai.types.js';
import { StorageService } from '../storage/storage.service.js';
import type { ExtractedQuestion, PaperStatus } from '../papers/paper.types.js';
import { PapersRepository } from '../papers/papers.repository.js';
import { paperKeys } from '../papers/paper-keys.js';
import { collectAnswers, mergePages, questionId, type PageResult } from './merge.js';
import { cropToWebp, isBlankPage, normaliseBox, pageTexts, renderPdfPages } from './pdf-images.js';
import { QuestionCropsService } from './question-crops.service.js';

const MS_PAGES_PER_CALL = 2;

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);
  private readonly concurrency: number;

  constructor(
    private readonly storage: StorageService,
    @Inject(EXTRACTION_PROVIDER) private readonly ai: ExtractionProvider,
    private readonly repo: PapersRepository,
    config: ConfigService<Env, true>,
    private readonly crops: QuestionCropsService,
  ) {
    this.concurrency = config.get('AI_PAGE_CONCURRENCY', { infer: true });
  }

  /** Render, read with AI, crop, match answers, save to the database. Progress goes to processing_jobs. */
  /**
   * Read a paper with AI. draft = a re-process of a paper that already has questions: the new reading is saved as a
   * DRAFT to compare and accept part by part; the live paper (and its published state) is not touched.
   */
  async process(paperId: string, jobId: number, opts: { draft?: boolean } = {}): Promise<void> {
    const draftDir = opts.draft ? `versions/${paperId}/draft-${Date.now().toString(36)}` : null;
    const keys = paperKeys(paperId);
    const meta = await this.repo.getMeta(paperId);
    if (!meta) throw new Error(`Paper ${paperId} not found`);

    const status = this.newStatusWriter(jobId);
    try {
      // 1. Render pages
      await status({ state: 'RENDERING', progress: 2, message: 'Rendering question paper pages…' });
      const qpPdf = await this.storage.read(keys.qp);
      const qpPages = await renderPdfPages(qpPdf, async (n, total) => {
        await status({ pagesTotal: total, message: `Rendering page ${n}/${total}…`, progress: 2 + Math.round((n / total) * 8) });
      });
      await Promise.all(qpPages.map((img, i) => this.storage.write(keys.page('qp', i + 1), img)));
      // Pages that only say "BLANK PAGE" are not sent to the AI (saves calls / quota).
      const qpTexts = await pageTexts(qpPdf).catch(() => [] as string[]);
      const blankQp = new Set(qpTexts.flatMap((t, i) => (isBlankPage(t) ? [i] : [])));

      let msPages: Buffer[] = [];
      let blankMs = new Set<number>();
      if (meta.msFileName && this.storage.exists(keys.ms)) {
        await status({ message: 'Rendering mark scheme pages…' });
        const msPdf = await this.storage.read(keys.ms);
        msPages = await renderPdfPages(msPdf);
        await Promise.all(msPages.map((img, i) => this.storage.write(keys.page('ms', i + 1), img)));
        const msTexts = await pageTexts(msPdf).catch(() => [] as string[]);
        blankMs = new Set(msTexts.flatMap((t, i) => (isBlankPage(t) ? [i] : [])));
      }
      // Mark scheme pages are short: read 2 per AI call.
      const msBatches = chunk(
        msPages.map((image, i) => ({ image, index: i })).filter(({ index }) => !blankMs.has(index)),
        MS_PAGES_PER_CALL,
      );

      // 2. AI extraction, page by page
      const subject = await this.repo.findSubject(meta.subjectCode);
      const baseCtx = {
        subjectName: meta.subjectName,
        subjectCode: meta.subjectCode,
        componentName: meta.componentName,
        topics: subject?.topics ?? [],
      };
      const totalAiPages = qpPages.length - blankQp.size + msBatches.length;
      let aiPagesDone = 0;
      const bumpAi = async (extra: Partial<PaperStatus>) => {
        aiPagesDone++;
        await status({ ...extra, pagesDone: aiPagesDone, progress: 10 + Math.round((aiPagesDone / totalAiPages) * 80) });
      };

      await status({ state: 'EXTRACTING', pagesTotal: totalAiPages, pagesDone: 0, message: `Reading pages with AI (${this.ai.name})…` });
      let questionsFound = 0;
      // A page the AI can't read (overloaded, bad output) is skipped and reported, not fatal for the paper.
      const failedQpPages: number[] = [];
      const failedMsPages: number[] = [];
      let lastError = '';
      const pageResults: PageResult[] = await mapLimit(qpPages, this.concurrency, async (image, i) => {
        if (blankQp.has(i)) return { page: i + 1, questions: [] };
        const ctx: PageContext = { ...baseCtx, image, pageNumber: i + 1, pageCount: qpPages.length };
        try {
          const result = await this.ai.extractQuestionPage(ctx);
          questionsFound += result.questions.length;
          await bumpAi({ questionsFound, message: `Read page ${i + 1}/${qpPages.length} · ${questionsFound} questions found` });
          return { page: i + 1, questions: result.questions };
        } catch (err) {
          lastError = (err as Error).message;
          failedQpPages.push(i + 1);
          this.logger.warn(`${paperId}: page ${i + 1} skipped: ${lastError}`);
          await bumpAi({ message: `Page ${i + 1} could not be read, continuing…` });
          return { page: i + 1, questions: [] };
        }
      });
      if (failedQpPages.length > 0 && failedQpPages.length === qpPages.length - blankQp.size) {
        throw new Error(lastError || 'AI could not read any page');
      }

      let msResults: MarkSchemePage[] = [];
      if (msBatches.length) {
        await status({ state: 'MARK_SCHEME', message: 'Reading mark scheme…' });
        msResults = await mapLimit(msBatches, this.concurrency, async (batch) => {
          const first = batch[0].index + 1;
          const pages = batch.map((b) => b.index + 1);
          try {
            const result = await this.ai.extractMarkSchemePage({
              ...baseCtx,
              image: batch[0].image,
              extraImages: batch.slice(1).map((b) => b.image),
              pageNumber: first,
              pageCount: msPages.length,
            });
            await bumpAi({ message: `Read mark scheme page${pages.length > 1 ? 's' : ''} ${pages.join('-')}/${msPages.length}` });
            return result;
          } catch (err) {
            failedMsPages.push(...pages);
            this.logger.warn(`${paperId}: mark scheme pages ${pages.join(',')} skipped: ${(err as Error).message}`);
            await bumpAi({ message: `Mark scheme page ${pages.join('-')} could not be read, continuing…` });
            return { answers: [] };
          }
        });
      }

      // 3. Merge, crop reference images, attach answers
      await status({ message: 'Cropping reference images…', progress: 92 });
      const answers = collectAnswers(msResults);
      const merged = mergePages(pageResults);
      const questions: ExtractedQuestion[] = [];
      for (const q of merged) {
        const id = questionId(q.number);
        const images: ExtractedQuestion['images'] = [];
        for (const { page, box: rawBox } of q.diagramsByPage) {
          const box = normaliseBox(rawBox);
          if (!box) continue;
          const path = draftDir ? `${draftDir}/${id}-img${images.length + 1}.webp` : keys.questionImage(id, images.length + 1);
          await this.storage.write(path, await cropToWebp(qpPages[page - 1], box));
          images.push({ path, page, box });
        }
        const answer = answers.get(q.key);
        const topicCode = q.topic_code && subject?.topics.some((t) => t.code === q.topic_code) ? q.topic_code : null;
        questions.push({
          number: q.number,
          type: q.type,
          marks: q.marks,
          text: q.text,
          options: q.options,
          topicCode,
          topic: topicCode ? subject!.topics.find((t) => t.code === topicCode)!.name : q.topic,
          subtopic: q.subtopic,
          difficulty: q.difficulty,
          keywords: q.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean),
          page: q.pages[0],
          pages: q.pages,
          images,
          answer: answer ? { correctOption: answer.correct_option?.trim().toUpperCase() || null, text: answer.answer_text } : null,
          confidence: Math.min(1, Math.max(0, q.confidence)),
        });
      }

      if (opts.draft) {
        // safe re-process: keep the reading as a draft; the admin compares it with the live paper and takes what is better
        await this.repo.saveDraft(paperId, `AI re-read (${this.ai.name} · ${this.ai.model})`, questions);
        await status({
          state: 'DONE',
          progress: 100,
          questionsFound: questions.length,
          failedPages: { qp: failedQpPages, ms: failedMsPages },
          message: `AI draft ready: ${questions.length} parts. Compare it with the live paper and choose what to take (the live paper is unchanged).`,
        });
        return;
      }
      await status({ message: 'Saving questions…', progress: 96 });
      await this.repo.saveExtraction(paperId, this.ai.name, this.ai.model, questions);
      // Worksheet crops (each question exactly as printed, for downloaded worksheets). Not fatal: worksheets
      // fall back to the text layout for any question without a crop, and the CLI can retry later.
      await status({ message: 'Cutting worksheet crops…', progress: 97 });
      await this.crops.buildForPaper(paperId).catch((err) => this.logger.warn(`${paperId}: worksheet crops skipped: ${(err as Error).message}`));
      const unmatched = msPages.length ? questions.filter((q) => !q.answer).length : 0;
      const pageList = (label: string, pages: number[]) =>
        pages.length ? `${label} page${pages.length > 1 ? 's' : ''} ${[...pages].sort((a, b) => a - b).join(', ')}` : '';
      const skipped = [pageList('question paper', failedQpPages), pageList('mark scheme', failedMsPages)].filter(Boolean);
      await status({
        state: 'DONE',
        progress: 100,
        questionsFound: questions.length,
        failedPages: { qp: failedQpPages, ms: failedMsPages },
        message: [
          `${questions.length} questions extracted`,
          unmatched ? `${unmatched} without a matched answer` : '',
          skipped.length ? `AI could not read ${skipped.join(' and ')}. Re-process to try again` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Processing ${paperId} failed: ${message}`, (err as Error).stack);
      await status({ state: 'FAILED', error: message, message: 'Processing failed' });
      // a failed draft leaves the live paper as it was
      if (!opts.draft) await this.repo.setPaperState(paperId, 'FAILED').catch(() => undefined);
    }
  }

  /** Progress updates for one job, written in order (concurrent page callbacks never interleave). */
  private newStatusWriter(jobId: number) {
    let chain = Promise.resolve();
    return (patch: Partial<PaperStatus>) => {
      chain = chain.then(() => this.repo.updateJob(jobId, patch)).catch((err) => this.logger.warn(`status update failed: ${(err as Error).message}`));
      return chain;
    };
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Run fn over items with at most `limit` in flight, preserving result order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

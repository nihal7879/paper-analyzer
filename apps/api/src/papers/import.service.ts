import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import { SEASONS, type SeasonCode } from '../catalog/catalog.js';
import { cropToWebp, normaliseBox, renderPdfPages } from '../processing/pdf-images.js';
import { questionId } from '../processing/merge.js';
import { StorageService } from '../storage/storage.service.js';
import { paperKeys } from './paper-keys.js';
import type { ExtractedQuestion } from './paper.types.js';
import { PapersRepository } from './papers.repository.js';

const box = z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });

/** Format written by Claude Code (docs/claude-extraction-format.md). */
export const extractionFileSchema = z.object({
  source: z.object({ qpFile: z.string(), msFile: z.string().nullable().optional() }),
  paper: z.object({
    board: z.string().min(1),
    curriculum: z.string().min(1),
    subjectCode: z.string().regex(/^[A-Za-z0-9]{2,12}$/),
    subjectName: z.string().min(1),
    paperCode: z.string().regex(/^[A-Za-z0-9]{1,6}$/),
    componentName: z.string().nullable().optional(),
    year: z.number().int().min(1990).max(2100),
    seasonCode: z.enum(Object.keys(SEASONS) as [SeasonCode, ...SeasonCode[]]),
    totalMarks: z.number().int().nullable().optional(),
  }),
  questions: z
    .array(
      z.object({
        number: z.string().min(1).max(30),
        type: z.enum(['MCQ', 'THEORY', 'STRUCTURED']),
        marks: z.number().int().min(0).max(100).nullable(),
        text: z.string().min(1),
        options: z.array(z.object({ label: z.string().max(2), text: z.string() })).default([]),
        topicCode: z.string().nullable().optional(),
        topic: z.string().optional(),
        subtopic: z.string().default(''),
        difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
        keywords: z.array(z.string()).default([]),
        page: z.number().int().min(1),
        pages: z.array(z.number().int().min(1)).optional(),
        diagrams: z.array(z.object({ page: z.number().int().min(1), box })).default([]),
        answer: z.object({ correctOption: z.string().max(2).nullable(), text: z.string() }).nullable().default(null),
        confidence: z.number().min(0).max(1).default(0.9),
      }),
    )
    .min(1),
});

export type ExtractionFile = z.infer<typeof extractionFileSchema>;

export interface ImportResult {
  slug: string;
  questions: number;
  withAnswer: number;
  images: number;
  marks: number;
  totalMarks: number | null;
  warnings: string[];
}

/** Imports a paper extracted outside the app (Claude Code JSON + the original PDFs). */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly repo: PapersRepository,
    private readonly storage: StorageService,
  ) {}

  async importFile(jsonPath: string): Promise<ImportResult> {
    const parsed = extractionFileSchema.safeParse(JSON.parse(readFileSync(jsonPath, 'utf8')));
    if (!parsed.success) {
      throw new Error(`${basename(jsonPath)}: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    const data = parsed.data;
    const p = data.paper;
    const warnings: string[] = [];
    if (!existsSync(data.source.qpFile)) throw new Error(`Question paper not found: ${data.source.qpFile}`);
    const msFile = data.source.msFile && existsSync(data.source.msFile) ? data.source.msFile : null;
    if (data.source.msFile && !msFile) warnings.push(`mark scheme not found: ${data.source.msFile}`);

    // Paper record (replace if it exists)
    const subjectCode = p.subjectCode.toUpperCase();
    const subject = (await this.repo.findSubject(subjectCode)) ?? (await this.repo.ensureSubject(subjectCode, p.subjectName, p.board, p.curriculum));
    const slug = `${subjectCode}_${p.seasonCode}${String(p.year).slice(-2)}_${p.paperCode}`;
    if (await this.repo.paperExists(slug)) await this.repo.deletePaper(slug);
    const keys = paperKeys(slug);
    await this.storage.removeDir(keys.dir);

    const cambridgeStyle = subject.board.includes('Cambridge') && /^\d{1,2}$/.test(p.paperCode);
    const paperNumber = cambridgeStyle ? Number(p.paperCode[0]) : Number.parseInt(p.paperCode, 10) || null;
    const qpPdf = readFileSync(data.source.qpFile);
    const msPdf = msFile ? readFileSync(msFile) : null;
    await this.storage.write(keys.qp, qpPdf);
    if (msPdf) await this.storage.write(keys.ms, msPdf);
    await this.repo.createPaper({
      slug,
      subjectId: subject.id,
      componentId: await this.repo.componentId(subject.id, paperNumber),
      year: p.year,
      seasonCode: p.seasonCode,
      paperCode: p.paperCode,
      variant: cambridgeStyle && p.paperCode.length === 2 ? Number(p.paperCode[1]) : null,
      componentName: p.componentName ?? null,
      qpFileName: basename(data.source.qpFile),
      msFileName: msFile ? basename(msFile) : null,
      qpPath: keys.qp,
      msPath: msPdf ? keys.ms : null,
    });
    const jobId = await this.repo.createJob(slug);
    await this.repo.updateJob(jobId, { state: 'RENDERING', progress: 5, message: 'Importing Claude extraction…' });

    // Page images (for the editor's original-page view and for cropping)
    const qpPages = await renderPdfPages(qpPdf);
    await Promise.all(qpPages.map((img, i) => this.storage.write(keys.page('qp', i + 1), img)));
    if (msPdf) {
      const msPages = await renderPdfPages(msPdf);
      await Promise.all(msPages.map((img, i) => this.storage.write(keys.page('ms', i + 1), img)));
    }

    // Questions: unique numbers, crop diagrams, map topics
    const seen = new Set<string>();
    const questions: ExtractedQuestion[] = [];
    let images = 0;
    for (const q of data.questions) {
      let number = q.number.replace(/\s+/g, '');
      if (seen.has(number)) {
        warnings.push(`duplicate question number ${number}`);
        let n = 2;
        while (seen.has(`${number}#${n}`)) n++;
        number = `${number}#${n}`;
      }
      seen.add(number);
      if (q.page > qpPages.length) warnings.push(`${number}: page ${q.page} > ${qpPages.length}`);

      const id = questionId(number);
      const crops: ExtractedQuestion['images'] = [];
      for (const d of q.diagrams) {
        const b = normaliseBox(d.box);
        const page = qpPages[d.page - 1];
        if (!b || !page) {
          warnings.push(`${number}: unusable diagram box on page ${d.page}`);
          continue;
        }
        const path = keys.questionImage(id.replace(/#/g, '_'), crops.length + 1);
        await this.storage.write(path, await cropToWebp(page, b));
        crops.push({ path, page: d.page, box: b });
      }
      images += crops.length;

      const topic = q.topicCode ? subject.topics.find((t) => t.code === q.topicCode) : undefined;
      if (q.topicCode && !topic) warnings.push(`${number}: unknown topic code ${q.topicCode}`);
      questions.push({
        number,
        type: q.type,
        marks: q.marks,
        text: q.text,
        options: q.type === 'MCQ' ? q.options : [],
        topicCode: topic?.code ?? null,
        topic: topic?.name ?? q.topic ?? 'General',
        subtopic: q.subtopic,
        difficulty: q.difficulty,
        keywords: q.keywords,
        page: q.page,
        pages: q.pages?.length ? q.pages : [q.page],
        images: crops,
        answer: q.answer ? { correctOption: q.answer.correctOption?.trim().toUpperCase() || null, text: q.answer.text } : null,
        confidence: q.confidence,
      });
    }

    await this.repo.saveExtraction(slug, 'claude', 'claude-code', questions);
    const marks = questions.reduce((s, q) => s + (q.marks ?? 0), 0);
    const withAnswer = questions.filter((q) => q.answer).length;
    if (p.totalMarks && marks !== p.totalMarks) warnings.push(`marks add up to ${marks}, cover says ${p.totalMarks}`);
    await this.repo.updateJob(jobId, {
      state: 'DONE',
      progress: 100,
      pagesTotal: qpPages.length,
      pagesDone: qpPages.length,
      questionsFound: questions.length,
      message: `${questions.length} questions imported (Claude) · ${withAnswer} with answers${warnings.length ? ` · ${warnings.length} warning(s)` : ''}`,
    });
    await this.repo.audit('PAPER_IMPORTED', 'paper', await this.repo.paperDbId(slug), { slug, source: basename(jsonPath), warnings });
    return { slug, questions: questions.length, withAnswer, images, marks, totalMarks: p.totalMarks ?? null, warnings };
  }
}

import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { EXTRACTION_PROVIDER, type ExtractionProvider } from '../ai/ai.types.js';
import { parseCambridgeFilename, SEASONS, type SeasonCode } from '../catalog/catalog.js';
import { JobService } from '../jobs/job.service.js';
import { cropToWebp, normaliseBox, renderFirstPage } from '../processing/pdf-images.js';
import { ProcessingService } from '../processing/processing.service.js';
import { StorageService } from '../storage/storage.service.js';
import { detailsFromAi, detailsFromFilename, type DetectedDetails } from './paper-details.js';
import { paperKeys } from './paper-keys.js';
import type { QuestionEdit, QuestionImage } from './paper.types.js';
import { BankSearchService } from './bank-search.service.js';
import { PapersRepository } from './papers.repository.js';
import { SimilarityService } from '../similarity/similarity.service.js';

export const uploadFieldsSchema = z.object({
  // Any board: 9702 (Cambridge), 8PH0 / WPH11 (Edexcel), ...
  subjectCode: z.string().trim().regex(/^[A-Za-z0-9]{2,12}$/, 'Subject code: letters/digits only, e.g. 9702 or 8PH0'),
  subjectName: z.string().trim().optional(),
  board: z.string().trim().max(80).optional(),
  curriculum: z.string().trim().max(80).optional(),
  componentName: z.string().trim().max(120).optional(),
  year: z.coerce.number().int().min(1990).max(2100),
  seasonCode: z.enum(Object.keys(SEASONS) as [SeasonCode, ...SeasonCode[]]),
  paperCode: z.string().trim().regex(/^[A-Za-z0-9]{1,6}$/, 'Paper code: letters/digits only, e.g. 11 or 01'),
  overwrite: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

const boxSchema = z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });

/** Editor save body. Every field optional: only what is sent is changed. */
export const questionEditSchema = z.object({
  type: z.enum(['MCQ', 'THEORY', 'STRUCTURED']).optional(),
  marks: z.number().int().min(0).max(100).nullable().optional(),
  text: z.string().min(1).max(50_000).optional(),
  options: z.array(z.object({ label: z.string().max(2), text: z.string().max(5_000) })).max(8).optional(),
  topicCode: z.string().max(20).nullable().optional(),
  topic: z.string().max(200).optional(),
  subtopic: z.string().max(200).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  keywords: z.array(z.string().max(80)).max(30).optional(),
  answer: z.object({ correctOption: z.string().max(2).nullable(), text: z.string().max(50_000) }).nullable().optional(),
  images: z.array(z.object({ page: z.number().int().min(1).max(500), box: boxSchema })).max(10).optional(),
  verify: z.boolean().optional(),
});

const PDF_MAGIC = Buffer.from('%PDF-');

@Injectable()
export class PapersService {
  private readonly logger = new Logger(PapersService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly jobs: JobService,
    private readonly processing: ProcessingService,
    private readonly repo: PapersRepository,
    private readonly similarity: SimilarityService,
    @Inject(EXTRACTION_PROVIDER) private readonly ai: ExtractionProvider,
    private readonly bankSearch: BankSearchService,
  ) {}

  /**
   * Fill in paper details automatically: from a Cambridge file name when possible (instant, free),
   * otherwise the AI reads the cover page.
   */
  async detect(file: Express.Multer.File | undefined): Promise<DetectedDetails> {
    if (!file) throw new BadRequestException('PDF file is required');
    if (!file.buffer.subarray(0, 5).equals(PDF_MAGIC)) throw new BadRequestException(`${file.originalname} is not a PDF`);

    const parsed = parseCambridgeFilename(file.originalname);
    if (parsed) return detailsFromFilename(parsed);

    let cover: Buffer;
    try {
      cover = await renderFirstPage(file.buffer);
    } catch {
      throw new BadRequestException('Could not read this PDF. Is it password protected or damaged?');
    }
    try {
      return detailsFromAi(await this.ai.detectPaperDetails(cover, file.originalname));
    } catch (err) {
      this.logger.warn(`Detect failed for ${file.originalname}: ${(err as Error).message}`);
      throw new BadRequestException(`AI could not read the paper details: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ papers

  async create(raw: unknown, qp: Express.Multer.File | undefined, ms: Express.Multer.File | undefined) {
    const parsed = uploadFieldsSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const fields = parsed.data;
    if (!qp) throw new BadRequestException('Question paper PDF is required');
    for (const file of [qp, ms]) {
      if (file && !file.buffer.subarray(0, 5).equals(PDF_MAGIC)) {
        throw new BadRequestException(`${file.originalname} is not a PDF`);
      }
    }

    const subjectCode = fields.subjectCode.toUpperCase();
    const known = await this.repo.findSubject(subjectCode);
    const subject =
      known ??
      (await this.repo.ensureSubject(
        subjectCode,
        fields.subjectName || subjectCode,
        fields.board || 'Other',
        fields.curriculum || fields.board || 'Other',
      ));

    const slug = `${subjectCode}_${fields.seasonCode}${String(fields.year).slice(-2)}_${fields.paperCode}`;
    if (await this.repo.paperExists(slug)) {
      if (!fields.overwrite) throw new ConflictException(`Paper ${slug} already exists`);
      if (this.jobs.isPending(slug)) throw new ConflictException(`Paper ${slug} is still processing`);
      await this.repo.deletePaper(slug);
    }
    const keys = paperKeys(slug);
    await this.storage.removeDir(keys.dir);

    // Cambridge codes are paper+variant ("12" = paper 1, variant 2); other boards print the paper number ("01").
    const cambridgeStyle = subject.board.includes('Cambridge') && /^\d{1,2}$/.test(fields.paperCode);
    const paperNumber = cambridgeStyle ? Number(fields.paperCode[0]) : Number.parseInt(fields.paperCode, 10) || null;
    const componentId = await this.repo.componentId(subject.id, paperNumber);

    await this.storage.write(keys.qp, qp.buffer);
    if (ms) await this.storage.write(keys.ms, ms.buffer);
    await this.repo.createPaper({
      slug,
      subjectId: subject.id,
      componentId,
      year: fields.year,
      seasonCode: fields.seasonCode,
      paperCode: fields.paperCode,
      variant: cambridgeStyle && fields.paperCode.length === 2 ? Number(fields.paperCode[1]) : null,
      componentName: fields.componentName || subject.components.find((c) => c.number === paperNumber)?.name || null,
      qpFileName: qp.originalname,
      msFileName: ms?.originalname ?? null,
      qpPath: keys.qp,
      msPath: ms ? keys.ms : null,
    });
    await this.repo.audit('PAPER_UPLOADED', 'paper', await this.repo.paperDbId(slug), { slug, qp: qp.originalname, ms: ms?.originalname ?? null });
    await this.enqueue(slug);
    return { id: slug };
  }

  async reprocess(slug: string) {
    if (!(await this.repo.paperExists(slug))) throw new NotFoundException(`Paper ${slug} not found`);
    if (this.jobs.isPending(slug)) throw new ConflictException(`Paper ${slug} is already processing`);
    const keys = paperKeys(slug);
    await this.storage.removeDir(`${keys.dir}/pages`);
    await this.storage.removeDir(`${keys.dir}/questions`);
    await this.repo.audit('PAPER_REPROCESSED', 'paper', await this.repo.paperDbId(slug), { slug });
    await this.enqueue(slug);
    this.invalidateBank();
    return { id: slug };
  }

  async list() {
    return this.repo.listPapers();
  }

  async get(slug: string) {
    const paper = await this.repo.getPaper(slug);
    if (!paper) throw new NotFoundException(`Paper ${slug} not found`);
    return paper;
  }

  async remove(slug: string) {
    if (!(await this.repo.paperExists(slug))) throw new NotFoundException(`Paper ${slug} not found`);
    if (this.jobs.isPending(slug)) throw new ConflictException(`Paper ${slug} is still processing`);
    const id = await this.repo.paperDbId(slug);
    await this.repo.deletePaper(slug);
    this.invalidateBank();
    await this.storage.removeDir(paperKeys(slug).dir);
    await this.repo.audit('PAPER_DELETED', 'paper', id, { slug });
  }

  async publish(slug: string) {
    if (!(await this.repo.paperExists(slug))) throw new NotFoundException(`Paper ${slug} not found`);
    const pending = await this.repo.publish(slug);
    if (pending > 0) throw new ConflictException(`${pending} question${pending === 1 ? '' : 's'} still need verifying before publishing`);
    // searchable words for the new paper (the student bank searches them in MySQL)
    const paperId = await this.repo.paperDbId(slug);
    if (paperId) await this.bankSearch.refreshSearchText({ paperId });
    this.invalidateBank();
    await this.repo.audit('PAPER_PUBLISHED', 'paper', await this.repo.paperDbId(slug), { slug });
    // Rebuild vectors + similar-question lists for this subject in the background.
    const meta = await this.repo.getMeta(slug);
    const subject = meta ? await this.repo.findSubject(meta.subjectCode) : null;
    if (subject) {
      this.jobs.enqueue(`similar:${subject.id}`, async () => {
        const r = await this.similarity.refreshSubject(subject.id);
        this.invalidateBank(); // new similar-question lists
        this.logger.log(`Similar questions refreshed for ${meta!.subjectCode}: ${r.questions} questions, ${r.embedded} embedded`);
      });
    }
    return { id: slug, published: true };
  }

  async unpublish(slug: string) {
    if (!(await this.repo.paperExists(slug))) throw new NotFoundException(`Paper ${slug} not found`);
    await this.repo.unpublish(slug);
    this.invalidateBank();
    await this.repo.audit('PAPER_UNPUBLISHED', 'paper', await this.repo.paperDbId(slug), { slug });
    return { id: slug, published: false };
  }

  // ------------------------------------------------------------------ questions (editor)

  async updateQuestion(slug: string, questionId: number, raw: unknown) {
    const parsed = questionEditSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const { verify = false, images, ...edit } = parsed.data;
    const row = await this.requireQuestion(slug, questionId);

    // New crop boxes -> cut real WebP files from the stored page images so students get plain images.
    let newImages: QuestionImage[] | null = null;
    if (images) {
      newImages = [];
      const stamp = Date.now().toString(36);
      for (const [k, img] of images.entries()) {
        const box = normaliseBox(img.box);
        if (!box) continue;
        const keys = paperKeys(slug);
        const pageKey = keys.page('qp', img.page);
        let path: string | null = null;
        if (this.storage.exists(pageKey)) {
          path = `${keys.dir}/questions/q${questionId}-img${k + 1}-${stamp}.webp`;
          await this.storage.write(path, await cropToWebp(await this.storage.read(pageKey), box));
        }
        newImages.push({ path, page: img.page, box });
      }
    }

    await this.repo.updateQuestion(questionId, row.subject_id, edit as QuestionEdit, newImages, verify);
    await this.bankSearch.refreshSearchText({ questionIds: [questionId] });
    this.invalidateBank();
    await this.repo.audit(verify ? 'QUESTION_VERIFIED' : 'QUESTION_EDITED', 'question', questionId, { slug, fields: Object.keys(raw as object) });
    return this.repo.questionById(questionId);
  }

  async setVerified(slug: string, questionId: number, verified: boolean) {
    await this.requireQuestion(slug, questionId);
    await this.repo.setVerified(questionId, verified);
    this.invalidateBank();
    await this.repo.audit(verified ? 'QUESTION_VERIFIED' : 'QUESTION_UNVERIFIED', 'question', questionId, { slug });
    return this.repo.questionById(questionId);
  }

  async verifyAll(slug: string) {
    if (!(await this.repo.paperExists(slug))) throw new NotFoundException(`Paper ${slug} not found`);
    if (this.jobs.isPending(slug)) throw new ConflictException(`Paper ${slug} is processing`);
    const verified = await this.repo.verifyAll(slug);
    this.invalidateBank();
    await this.repo.audit("PAPER_VERIFIED_ALL", "paper", await this.repo.paperDbId(slug), { slug, verified });
    return { id: slug, verified };
  }

  async setDeleted(slug: string, questionId: number, deleted: boolean) {
    await this.requireQuestion(slug, questionId);
    await this.repo.setDeleted(questionId, deleted);
    this.invalidateBank();
    await this.repo.audit(deleted ? 'QUESTION_DELETED' : 'QUESTION_RESTORED', 'question', questionId, { slug });
  }

  /** Re-read one question with the AI (admin hint). Returns a proposal; nothing is saved. */
  async regenerate(slug: string, questionId: number) {
    await this.requireQuestion(slug, questionId);
    throw new BadRequestException('AI regenerate for a single question is not available yet.');
  }

  // ------------------------------------------------------------------ students

  /** Admin changes: the student bank (server-side search) forgets its cached answers straight away. */
  private invalidateBank() {
    this.bankSearch.clearCache();
  }

  // ------------------------------------------------------------------ helpers

  private async requireQuestion(slug: string, questionId: number) {
    if (!Number.isInteger(questionId) || questionId <= 0) throw new BadRequestException('Invalid question id');
    const row = await this.repo.questionRow(slug, questionId);
    if (!row) throw new NotFoundException(`Question ${questionId} not found in ${slug}`);
    if (this.jobs.isPending(slug)) throw new ConflictException(`Paper ${slug} is processing; try again when it has finished`);
    return row;
  }

  private async enqueue(slug: string) {
    const jobId = await this.repo.createJob(slug);
    this.jobs.enqueue(slug, () => this.processing.process(slug, jobId));
  }
}

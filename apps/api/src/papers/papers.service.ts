import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { readdir } from 'node:fs/promises';
import { z } from 'zod';
import { EXTRACTION_PROVIDER, type ExtractionProvider } from '../ai/ai.types.js';
import { parseCambridgeFilename, SEASONS, type SeasonCode } from '../catalog/catalog.js';
import { JobService } from '../jobs/job.service.js';
import { cropToWebp, normaliseBox, renderFirstPage } from '../processing/pdf-images.js';
import { ProcessingService } from '../processing/processing.service.js';
import { collectAnswers, mergePages, normaliseQuestionNumber, questionId as questionIdOf, type PageResult } from '../processing/merge.js';
import { QuestionCropsService } from '../processing/question-crops.service.js';
import { StorageService } from '../storage/storage.service.js';
import { detailsFromAi, detailsFromFilename, type DetectedDetails } from './paper-details.js';
import { paperKeys } from './paper-keys.js';
import type { QuestionEdit, QuestionImage } from './paper.types.js';
import { BankSearchService } from './bank-search.service.js';
import { checkPaper } from './paper-checks.js';
import { VersionsService } from './versions.service.js';
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
  number: z.string().trim().min(1).max(30).regex(/^\d{1,3}\s*(\([a-z]{1,4}\)\s*)*$/i, 'Part number like 14, 14(a) or 14(a)(ii)').optional(),
  pages: z.array(z.number().int().min(1).max(500)).min(1).max(6).optional(),
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

/** A hand-drawn worksheet crop: which PDF, and the box on each page (fractions of the page). */
const cropEditSchema = z.object({
  source: z.enum(["QP", "MS"]),
  regions: z.array(z.object({ page: z.number().int().min(1).max(500), box: z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() }) })).min(1).max(4),
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
    private readonly crops: QuestionCropsService,
    private readonly versions: VersionsService,
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
    const live = (await this.repo.getPaper(slug))?.extraction?.questions.length ?? 0;
    if (live) {
      // Safe re-process: back up, then read into a DRAFT; the live paper (and its published state) stays as it is
      await this.versions.snapshot(slug, 'Before re-process with AI');
      await this.repo.audit('PAPER_REPROCESSED', 'paper', await this.repo.paperDbId(slug), { slug, draft: true });
      await this.enqueue(slug, { draft: true });
      return { id: slug, draft: true };
    }
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
    const errors = (await this.checks(slug)).filter((i) => i.severity === 'error');
    if (errors.length)
      throw new ConflictException(`Fix ${errors.length} problem${errors.length === 1 ? '' : 's'} first: ${errors.slice(0, 3).map((e) => e.message).join(' · ')}${errors.length > 3 ? ' …' : ''}`);
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
    if (edit.number) edit.number = edit.number.replace(/\s+/g, ''); // "14 (a)" -> "14(a)"
    const row = await this.requireQuestion(slug, questionId);
    if (Object.keys(edit).length || images) await this.versions.snapshot(slug, `Before editing Q${await this.numberOf(questionId)}`, questionId);

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
    if (deleted) await this.versions.snapshot(slug, `Before deleting Q${await this.numberOf(questionId)}`, questionId);
    await this.repo.setDeleted(questionId, deleted);
    this.invalidateBank();
    await this.repo.audit(deleted ? 'QUESTION_DELETED' : 'QUESTION_RESTORED', 'question', questionId, { slug });
  }

  /** Re-read one question with the AI (admin hint). Returns a proposal; nothing is saved. */
  /** Re-cut the paper's worksheet crops (question paper + mark scheme) from the original PDFs. */
  async rebuildCrops(slug: string) {
    if (!(await this.repo.getPaper(slug))) throw new NotFoundException('Paper not found');
    await this.versions.snapshot(slug, 'Before re-cutting worksheet crops');
    const r = await this.crops.buildForPaper(slug);
    this.invalidateBank();
    await this.repo.audit('CROPS_REBUILT', 'paper', null, { slug, qp: r.qp, ms: r.ms });
    return r;
  }

  /** The admin drew a part's crop box(es) by hand (question paper or mark scheme): cut exactly those. */
  async setCrops(slug: string, questionId: number, raw: unknown) {
    const parsed = cropEditSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    await this.requireQuestion(slug, questionId);
    await this.versions.snapshot(slug, `Before changing the crop of Q${await this.numberOf(questionId)}`, questionId);
    try {
      await this.crops.setManual(questionId, parsed.data.source, parsed.data.regions);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    this.invalidateBank();
    await this.repo.audit('CROP_EDITED', 'question', questionId, { slug, source: parsed.data.source });
    return this.repo.questionById(questionId);
  }

  /**
   * Regenerate one question with AI: read its page(s) again (and its mark-scheme page, when known), guided by the
   * admin's note, using the AI chosen in Settings. Returns the new fields only; nothing is saved — the editor
   * fills its form with them for the admin to check and Save.
   */
  // ------------------------------------------------------------------ versions (backups) and restore

  versionsList(slug: string) {
    return this.versions.list(slug);
  }

  versionParts(slug: string, versionId: number) {
    return this.versions.parts(slug, versionId);
  }

  async backupNow(slug: string, raw: unknown) {
    const label = z.object({ label: z.string().trim().max(150).optional() }).safeParse(raw ?? {});
    if (!(await this.repo.paperExists(slug))) throw new NotFoundException('Paper not found');
    const id = await this.versions.snapshot(slug, label.success && label.data.label ? label.data.label : 'Backup (saved by admin)');
    return { id };
  }

  /** Restore an earlier version of the whole paper, or one question from it (the current state is backed up first). */
  async restoreVersion(slug: string, versionId: number, raw: unknown) {
    const body = z.object({ questionId: z.number().int().positive().optional() }).safeParse(raw ?? {});
    if (!body.success) throw new BadRequestException('Invalid question');
    if (this.jobs.isPending(slug)) throw new ConflictException('The paper is processing; try again when it has finished');
    const r = await this.versions.restore(slug, versionId, body.data.questionId);
    const paperId = await this.repo.paperDbId(slug);
    if (paperId) await this.bankSearch.refreshSearchText({ paperId });
    this.invalidateBank();
    await this.repo.audit('VERSION_RESTORED', 'paper', paperId, { slug, versionId, questionId: body.data.questionId ?? null });
    return r;
  }

  // ------------------------------------------------------------------ checks

  /** Problems an AI reading typically leaves (missing question numbers, merged parts, gaps…), worst first. */
  async checks(slug: string) {
    const paper = await this.repo.getPaper(slug);
    if (!paper) throw new NotFoundException('Paper not found');
    const issues = checkPaper(paper.extraction?.questions ?? []);
    return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  }

  // ------------------------------------------------------------------ AI draft (safe re-process): compare and apply

  /** The latest AI re-read next to the live paper, matched part by part. */
  async draft(slug: string) {
    const draft = await this.repo.latestDraft(slug);
    if (!draft) return null;
    const live = (await this.repo.getPaper(slug))?.extraction?.questions ?? [];
    const byKey = new Map(live.map((q) => [normaliseQuestionNumber(q.number), q]));
    const keys = [...new Set([...live.map((q) => normaliseQuestionNumber(q.number)), ...draft.questions.map((q) => normaliseQuestionNumber(q.number))])];
    const draftByKey = new Map(draft.questions.map((q) => [normaliseQuestionNumber(q.number), q]));
    const answerText = (a: { correctOption: string | null; text: string } | null | undefined) => (a ? a.correctOption || a.text : '');
    const rows = keys.map((key) => {
      const c = byKey.get(key);
      const d = draftByKey.get(key);
      return {
        key,
        current: c ? { id: c.id, number: c.number, text: c.text, marks: c.marks, type: c.type, pages: c.pages, answer: answerText(c.answer), options: c.options.length } : null,
        draft: d ? { number: d.number, text: d.text, marks: d.marks, type: d.type, pages: d.pages, answer: answerText(d.answer), options: d.options.length, images: d.images.length } : null,
        same: !!c && !!d && c.text.trim() === d.text.trim() && c.marks === d.marks && answerText(c.answer).trim() === answerText(d.answer).trim(),
      };
    });
    return { id: draft.id, label: draft.label, createdAt: draft.createdAt, rows };
  }

  /** Take the chosen parts from the AI draft (others stay as they are); the live paper is backed up first. */
  async applyDraft(slug: string, draftId: number, raw: unknown) {
    const body = z.object({ take: z.array(z.string().max(40)).max(300) }).safeParse(raw ?? {});
    if (!body.success) throw new BadRequestException('Choose which parts to take');
    const draft = await this.repo.latestDraft(slug);
    if (!draft || draft.id !== draftId) throw new NotFoundException('This draft is no longer available');
    await this.versions.snapshot(slug, 'Before applying the AI draft');
    const live = (await this.repo.getPaper(slug))?.extraction?.questions ?? [];
    const byKey = new Map(live.map((q) => [normaliseQuestionNumber(q.number), q]));
    const keys = paperKeys(slug);
    let taken = 0;
    for (const key of body.data.take) {
      const d = draft.questions.find((q) => normaliseQuestionNumber(q.number) === key);
      if (!d) continue;
      // the draft's diagram files move into the paper's own folder
      const images = [];
      for (const [k, img] of d.images.entries()) {
        const to = `${keys.dir}/questions/${questionIdOf(d.number)}-d${draftId}-img${k + 1}.webp`;
        if (this.storage.exists(img.path)) await this.storage.write(to, await this.storage.read(img.path));
        images.push({ ...img, path: to });
      }
      const current = byKey.get(key);
      await this.repo.applyDraftPart(slug, current ? Number(current.id) : null, { ...d, images });
      taken++;
    }
    const paperId = await this.repo.paperDbId(slug);
    if (paperId) {
      await this.repo.renumberInPaperOrder(paperId);
      await this.bankSearch.refreshSearchText({ paperId });
    }
    await this.repo.closeDraft(slug, draftId, true);
    this.invalidateBank();
    await this.repo.audit('DRAFT_APPLIED', 'paper', paperId, { slug, draftId, taken });
    // worksheet crops for the changed parts, in the background
    if (taken) this.jobs.enqueue(`crops:${slug}`, () => this.crops.buildForPaper(slug).then(() => this.invalidateBank()));
    return { taken };
  }

  async discardDraft(slug: string, draftId: number) {
    await this.repo.closeDraft(slug, draftId, false);
    await this.repo.audit('DRAFT_DISCARDED', 'paper', await this.repo.paperDbId(slug), { slug, draftId });
    return { discarded: true };
  }

  // ------------------------------------------------------------------ part tools

  /** Merge the next part into this one (for two parts the AI split wrongly). */
  async mergeNext(slug: string, questionId: number) {
    await this.requireQuestion(slug, questionId);
    const next = await this.repo.neighbour(questionId, 'down');
    if (!next) throw new BadRequestException('There is no next part to merge');
    await this.versions.snapshot(slug, `Before merging Q${await this.numberOf(questionId)} with Q${next.number}`);
    await this.repo.mergeInto(questionId, next.id);
    const paperId = await this.repo.paperDbId(slug);
    if (paperId) await this.bankSearch.refreshSearchText({ paperId });
    this.invalidateBank();
    await this.repo.audit('QUESTIONS_MERGED', 'question', questionId, { slug, merged: next.id });
    return this.repo.questionById(questionId);
  }

  /** Split a part in two at a paragraph (for two parts the AI merged). */
  async split(slug: string, questionId: number, raw: unknown) {
    const pages = z.array(z.number().int().min(1).max(500)).min(1).max(6);
    const body = z
      .object({ at: z.number().int().min(1), number: questionEditSchema.shape.number.unwrap(), firstPages: pages, secondPages: pages, secondMarks: z.number().int().min(0).max(100).nullable().optional() })
      .safeParse(raw);
    if (!body.success) throw new BadRequestException(body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    await this.requireQuestion(slug, questionId);
    const q = await this.repo.questionById(questionId);
    const paras = (q?.text ?? '').split(/\n{2,}/);
    if (body.data.at >= paras.length) throw new BadRequestException('Choose a place inside the text to split');
    await this.versions.snapshot(slug, `Before splitting Q${q!.number}`);
    const sorted = (p: number[]) => [...new Set(p)].sort((a, b) => a - b);
    const id = await this.repo.splitPart(questionId, body.data.at, body.data.number.replace(/\s+/g, ''), sorted(body.data.firstPages), sorted(body.data.secondPages), body.data.secondMarks ?? null);
    const paperId = await this.repo.paperDbId(slug);
    if (paperId) await this.bankSearch.refreshSearchText({ paperId });
    this.invalidateBank();
    await this.repo.audit('QUESTION_SPLIT', 'question', questionId, { slug, newId: id });
    return this.repo.questionById(id);
  }

  /** Move a part up or down in the paper's order. */
  async move(slug: string, questionId: number, raw: unknown) {
    const body = z.object({ direction: z.enum(['up', 'down']) }).safeParse(raw);
    if (!body.success) throw new BadRequestException('direction must be up or down');
    await this.requireQuestion(slug, questionId);
    const other = await this.repo.neighbour(questionId, body.data.direction);
    if (!other) return { moved: false };
    await this.repo.swapOrder(questionId, other.id);
    this.invalidateBank();
    return { moved: true };
  }

  // ------------------------------------------------------------------ cost estimate

  /** Rough AI cost of re-reading this paper with the AI chosen in Settings (pages × typical cost per page). */
  async reprocessEstimate(slug: string) {
    const keys = paperKeys(slug);
    const files = await readdir(this.storage.absolute(`${keys.dir}/pages`)).catch(() => [] as string[]);
    const qp = files.filter((f) => f.startsWith('qp-p')).length;
    const ms = files.filter((f) => f.startsWith('ms-p')).length;
    const model = `${this.ai.name} ${this.ai.model}`.toLowerCase();
    // US$ per page read (page picture + instructions in, questions + thinking out), from our measured papers
    const perPage =
      this.ai.name === 'mock' ? 0
      : /haiku-5/.test(model) ? 0.001
      : /haiku/.test(model) ? 0.0045
      : /sonnet/.test(model) ? 0.013
      : /opus|fable/.test(model) ? 0.0255
      : /gpt-5\.5|gpt-5-5/.test(model) ? 0.034
      : /mini|nano|lite/.test(model) ? 0.003
      : /gpt/.test(model) ? 0.016
      : /pro/.test(model) ? 0.013
      : 0.01;
    // mark scheme pages are read two at a time
    const pages = qp + Math.ceil(ms / 2);
    const usd = pages * perPage;
    return { provider: this.ai.name, model: this.ai.model, pages: qp + ms, usdLow: +(usd * 0.85).toFixed(2), usdHigh: +(usd * 1.2).toFixed(2) };
  }


  /** Add an empty part after another one (to split a part the AI merged); fill it with Regenerate or by typing. */
  async addPart(slug: string, afterId: number, raw: unknown) {
    const parsed = z
      .object({ number: questionEditSchema.shape.number.unwrap(), pages: z.array(z.number().int().min(1).max(500)).min(1).max(6) })
      .safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    await this.requireQuestion(slug, afterId);
    await this.versions.snapshot(slug, `Before adding part ${parsed.data.number}`);
    const id = await this.repo.addPart(afterId, parsed.data.number.replace(/\s+/g, ''), parsed.data.pages);
    this.invalidateBank();
    await this.repo.audit('QUESTION_ADDED', 'question', id, { slug, number: parsed.data.number });
    return this.repo.questionById(id);
  }

  async regenerate(slug: string, questionId: number, raw: unknown) {
    const hint = z.object({ hint: z.string().max(2000).optional() }).safeParse(raw ?? {});
    if (!hint.success) throw new BadRequestException('The note is too long (2,000 characters at most)');
    await this.requireQuestion(slug, questionId);
    const paper = await this.repo.getPaper(slug);
    const q = paper?.extraction?.questions.find((x) => x.id === String(questionId));
    if (!paper || !q) throw new NotFoundException('Question not found');
    const keys = paperKeys(slug);
    const subject = await this.repo.findSubject(paper.meta.subjectCode);
    const focus = { number: q.number, note: hint.data.hint };
    const baseCtx = { subjectName: paper.meta.subjectName, subjectCode: paper.meta.subjectCode, componentName: paper.meta.componentName, topics: subject?.topics ?? [], focus };
    const want = normaliseQuestionNumber(q.number);

    // 1. the question paper page(s) this part is on
    const pages = [...new Set(q.pages?.length ? q.pages : [q.page])].sort((a, b) => a - b).slice(0, 3);
    const pageCount = (await readdir(this.storage.absolute(`${keys.dir}/pages`)).catch(() => [] as string[])).filter((f) => f.startsWith('qp-p')).length || Math.max(...pages);
    const results: PageResult[] = [];
    for (const page of pages) {
      const key = keys.page('qp', page);
      if (!this.storage.exists(key)) continue;
      try {
        const r = await this.ai.extractQuestionPage({ ...baseCtx, image: await this.storage.read(key), pageNumber: page, pageCount });
        results.push({ page, questions: r.questions });
      } catch (err) {
        throw new BadRequestException(`The AI (${this.ai.name}) could not read page ${page}: ${(err as Error).message}`);
      }
    }
    const found = mergePages(results).find((m) => m.key === want);
    if (!found) throw new BadRequestException(`The AI did not find question ${q.number} on page ${pages.join(', ')}. Try again, or add a note (e.g. "it is at the bottom of the page").`);

    // 2. its mark scheme page(s), when the worksheet crops know where its answer is
    let answer: { correctOption: string | null; text: string } | undefined;
    const msPages = [...new Set((q.msCrops ?? []).map((c) => c.page))].sort((a, b) => a - b).slice(0, 2);
    const msImages = await Promise.all(msPages.filter((p) => this.storage.exists(keys.page('ms', p))).map((p) => this.storage.read(keys.page('ms', p))));
    if (msImages.length) {
      try {
        const ms = await this.ai.extractMarkSchemePage({ ...baseCtx, image: msImages[0], extraImages: msImages.slice(1), pageNumber: msPages[0], pageCount: Math.max(...msPages) });
        const a = collectAnswers([ms]).get(want);
        if (a) answer = { correctOption: a.correct_option?.trim().toUpperCase() || null, text: a.answer_text };
      } catch (err) {
        this.logger.warn(`${slug} ${q.number}: mark scheme re-read failed: ${(err as Error).message}`);
      }
    }

    const topicCode = found.topic_code && subject?.topics.some((t) => t.code === found.topic_code) ? found.topic_code : null;
    await this.repo.audit('QUESTION_REGENERATED', 'question', questionId, { slug, provider: this.ai.name, model: this.ai.model, hint: !!hint.data.hint });
    return {
      type: found.type,
      marks: found.marks,
      text: found.text,
      options: found.options,
      topicCode,
      topic: topicCode ? subject!.topics.find((t) => t.code === topicCode)!.name : found.topic,
      subtopic: found.subtopic,
      difficulty: found.difficulty,
      keywords: found.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean),
      ...(answer ? { answer } : {}),
    };
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

  private async enqueue(slug: string, opts: { draft?: boolean } = {}) {
    const jobId = await this.repo.createJob(slug, !!opts.draft);
    this.jobs.enqueue(slug, () => this.processing.process(slug, jobId, opts));
  }

  private async numberOf(questionId: number): Promise<string> {
    return (await this.repo.questionById(questionId))?.number ?? String(questionId);
  }
}

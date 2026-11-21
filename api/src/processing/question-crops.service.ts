import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Knex } from 'knex';
import { rm } from 'node:fs/promises';
import sharp from 'sharp';
import { EXTRACTION_PROVIDER, type ExtractionProvider } from '../ai/ai.types.js';
import { KNEX } from '../database/database.module.js';
import { paperKeys } from '../papers/paper-keys.js';
import type { Box } from '../papers/paper.types.js';
import { StorageService } from '../storage/storage.service.js';
import { normaliseBox, openPdf, renderPdfPagesAt } from './pdf-images.js';

/**
 * Worksheet crops: every question part cut out of the original paper exactly as printed (text, diagrams, answer
 * lines, marks, spacing), and its rows cut out of the mark scheme, so a downloaded worksheet looks like the paper.
 *
 * Where each part is comes first from the PDF's own text positions (free and exact: question numbers in the margin,
 * (a)/(i) labels, "(Total for Question …)" lines; in the mark scheme, the numbers in the table's first column and
 * the table's ruled lines). Only for papers without usable text does the AI say where each part is.
 * The cut is made from a ~250 DPI render; the paper's own question number is whited out (and its position kept so
 * the worksheet can print its own number there), empty page bottoms are trimmed and page-border bits removed.
 * Saved as question_images rows: kind 'FULL', source 'QP' (question) or 'MS' (mark scheme). File names:
 *   q<part id>-full-p<page>-<stamp>.jpg, q<id>-ms-p<page>-<stamp>.jpg, q<id>-mshead-<stamp>.jpg
 * (<stamp> = time of the cut in base 36, so a re-cut never shows a browser's cached old picture).
 */

type Source = 'QP' | 'MS';
/** t = the printed text that was whited out ("3" or "3(a)"): our number replaces exactly that */
type Rect = Box & { page: number; t?: string; /** other printed labels of the same question inside the box ("5(ii)") */ more?: Rect[] };
/** A crop box (page fractions) plus extras kept in the DB row's box JSON. */
/** A number-like label of the mark scheme's first column, cleared from the image and rewritten by the worksheet. */
type MsLabel = { x: number; base: number; t: string; q: boolean };
/** Where the ruled writing lines of a question-paper crop start and how far apart they are (fractions of the crop's height). */
type Rules = { from: number; pitch: number };
/** The paper's "Question 6 continued" heading of a continued page, cleared from the image and rewritten with our number. */
type Continued = { x: number; base: number; em: number };
type CropBox = Box & { qmark?: Continued; cont?: Continued; rules?: Rules; labels?: MsLabel[]; num?: { x: number; y: number; h: number; w?: number; t?: string; more?: { x: number; y: number; h: number; t: string }[] }; pw?: number; ph?: number; head?: string; headH?: number };
interface Plan {
  crops: { page: number; box: CropBox }[];
  /** the paper's own printed number (whited out; its ink position becomes box.num) */
  erase: Rect | null;
  /** the same number again on later rows/pages ("17 (b)* (continued)"): whited out too */
  eraseMore?: Rect[];
  /** hand-drawn mark scheme: the printed number of each box (a part's Notes rows repeat it), by box index */
  eraseCrops?: (Rect | null)[];
  /** mark scheme: the table's grey header row */
  head?: { page: number; box: Box } | null;
}
interface Part {
  id: number;
  number: string;
}
interface Item {
  str: string;
  x: number;
  w: number;
  base: number;
  top: number;
}

// question paper page regions (fractions of the page, raw PDF coordinates)
const TOP = 0.03; // above: watermark / header
const BOTTOM = 0.915; // below: page number, barcode, "Turn over"
const RIGHT = 0.93; // right of this: hatched "DO NOT WRITE IN THIS AREA" strip
const X0 = 0.11;
const X1 = 0.93;
const PAD = 0.006;
/** Below this share of parts found from the text, the PDF's text is treated as unusable (scanned / scrambled). */
const MIN_TEXT_COVERAGE = 0.5;
/** Starts missing from a PDF's text layer (checked by eye on the page image). */
const OVERRIDES: Record<string, { number: string; page: number; y: number }[]> = { '8PH0_s16_01': [{ number: '16(b)', page: 22, y: 0.096 }] };

/** Mark scheme part numbers: "11(a)(i)", "11 (a)(i)", "13a", "*14", "17 (b)*". */
const MS_NUM = /^\*?\s*(\d{1,2})\s*(?:\(?\s*([a-h])\s*\)?)?\s*(?:\(\s*(i|ii|iii|iv|v|vi|vii|viii)\s*\))?\s*\*?\s*$/i;
const partKey = (q: string, l: string | null, r: string | null) => `${q}|${l ?? ''}|${r ?? ''}`;
function parseNumber(s0: string): { q: string; l: string | null; r: string | null } | null {
  const s = s0.replace(/^\*\s*/, '').replace(/^(\d{1,2})[.:]$/, '$1'); // "2." / "2:" is question 2
  // IAL maths "7(i)(a)" / "7.(ii)(b)": the roman numeral first (same key shape: q, letter, roman)
  const rf = /^(\d{1,2})\.?\((i|ii|iii|iv|v|vi)\)\(([a-h])\)$/i.exec(s.replace(/\s+/g, ''));
  if (rf) return { q: String(+rf[1]), l: rf[3].toLowerCase(), r: rf[2].toLowerCase() };
  const m = MS_NUM.exec(s.replace(/\s+/g, '')) ?? MS_NUM.exec(s);
  return m ? { q: String(+m[1]), l: m[2]?.toLowerCase() ?? null, r: m[3]?.toLowerCase() ?? null } : null;
}

@Injectable()
export class QuestionCropsService {
  private readonly logger = new Logger(QuestionCropsService.name);

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly storage: StorageService,
    @Inject(EXTRACTION_PROVIDER) private readonly ai: ExtractionProvider,
  ) {}

  /** New local uploads: use validated offline crop coordinates, including scanned pages. No AI, no replacement. */
  async buildLocalRegions(slug: string, regions: { number: string; qp: { page: number; box: Box }[]; ms: { page: number; box: Box }[] }[]): Promise<{ parts: number; qp: number; ms: number; notFound: string[] }> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error('Paper not found');
    const parts: Part[] = await this.db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').select('id', 'number');
    const byNumber = new Map(parts.map(p => [p.number.replace(/\s+/g, ''), p.id]));
    if (parts.length !== regions.length) throw new Error('Local crop count does not match saved parts');
    // Refuse existing crops before writing a single image.
    const existing = await this.db('question_images').whereIn('question_id', parts.map(p => p.id)).where({ kind: 'FULL' }).first('id');
    if (existing) throw new Error('Local crops cannot replace existing images');
    const keys = paperKeys(slug);
    for (const source of ['QP', 'MS'] as const) {
      const plans = new Map<number, Plan>();
      for (const r of regions) {
        const id = byNumber.get(r.number.replace(/\s+/g, ''));
        if (!id) throw new Error(`Unknown local part ${r.number}`);
        plans.set(id, { crops: (source === 'QP' ? r.qp : r.ms).map(c => ({ page: c.page, box: { ...c.box } })), erase: null });
      }
      await this.saveCrops(slug, source, await this.storage.read(source === 'QP' ? keys.qp : keys.ms), plans, { createOnly: true });
    }
    return { parts: parts.length, qp: parts.length, ms: parts.length, notFound: [] };
  }

  /** Read-only preflight: no files/rows written and no AI fallback. */
  async assertLocalCoverage(slug: string, qp: Buffer, ms: Buffer, questions: { number: string }[]): Promise<void> {
    const parts = questions.map((q, i) => ({ id: i + 1, number: q.number.replace(/\s+/g, '') }));
    const qpPlans = await this.findQuestionBoxes(slug, qp, parts);
    const msPlans = await this.findMarkSchemeBoxes(slug, ms, parts);
    const missing = parts.filter(p => !qpPlans.has(p.id) || !msPlans.has(p.id));
    if (missing.length) throw new Error(`${slug}: text-based QP/MS crops missing for ${missing.map(p => p.number).join(', ')}; AI fallback disabled`);
  }

  /**
   * Cut (or re-cut) the question-paper and mark-scheme crops of one paper. A part's existing crop is only replaced
   * when the part is found reliably again, so good crops (e.g. drawn by hand) are never lost.
   * `onlyMissing` only fills in parts that have no crop yet.
   */
  async buildForPaper(slug: string, opts: { onlyMissing?: boolean; allowAi?: boolean } = {}): Promise<{ parts: number; qp: number; ms: number; notFound: string[] }> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error(`Paper ${slug} not found`);
    const parts: Part[] = await this.db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').orderBy('sort_order').select('id', 'number');
    if (!parts.length) return { parts: 0, qp: 0, ms: 0, notFound: [] };
    const has = async (source: Source) =>
      new Set(
        (await this.db('question_images').whereIn('question_id', parts.map((p) => p.id)).where({ kind: 'FULL', source }).distinct('question_id')).map(
          (r: { question_id: number }) => r.question_id,
        ),
      );
    const keys = paperKeys(slug);

    // question paper
    const hasQp = await has('QP');
    let qpPlans = new Map<number, Plan>();
    if (this.storage.exists(keys.qp)) {
      const pdfBuf = await this.storage.read(keys.qp);
      const found = await this.findQuestionBoxes(slug, pdfBuf, parts).catch((err) => {
        this.logger.warn(`${slug}: question positions from text failed: ${(err as Error).message}`);
        return new Map<number, Plan>();
      });
      qpPlans = found.size >= parts.length * MIN_TEXT_COVERAGE ? found : new Map();
      // parts still without any crop: ask the AI where they are
      const needAi = parts.filter((p) => !qpPlans.has(p.id) && !hasQp.has(p.id));
      if (needAi.length && opts.allowAi === false) throw new Error(`${slug}: local crops unavailable for ${needAi.map(p => p.number).join(', ')}; AI fallback disabled`);
      if (needAi.length) for (const [id, plan] of await this.aiQuestionBoxes(slug, needAi)) qpPlans.set(id, plan);
      if (opts.onlyMissing) for (const id of [...qpPlans.keys()]) if (hasQp.has(id)) qpPlans.delete(id);
      if (qpPlans.size) await this.saveCrops(slug, 'QP', pdfBuf, qpPlans);
    }

    // mark scheme
    const hasMs = await has('MS');
    let msPlans = new Map<number, Plan>();
    if (this.storage.exists(keys.ms)) {
      const pdfBuf = await this.storage.read(keys.ms);
      msPlans = await this.findMarkSchemeBoxes(slug, pdfBuf, parts).catch((err) => {
        this.logger.warn(`${slug}: mark scheme positions failed: ${(err as Error).message}`);
        return new Map<number, Plan>();
      });
      if (opts.onlyMissing) for (const id of [...msPlans.keys()]) if (hasMs.has(id)) msPlans.delete(id);
      if (msPlans.size) await this.saveCrops(slug, 'MS', pdfBuf, msPlans);
    }

    const qpNow = await has('QP');
    const notFound = parts.filter((p) => !qpNow.has(p.id)).map((p) => p.number);
    this.logger.log(`${slug}: crops cut for ${qpPlans.size} question parts and ${msPlans.size} mark-scheme parts${notFound.length ? ` (no question crop: ${notFound.join(', ')})` : ''}`);
    return { parts: parts.length, qp: qpPlans.size, ms: msPlans.size, notFound };
  }

  /**
   * Give every question-paper part back the writing space after it. Crops used to be trimmed to 4 mm below the last
   * printed line; here each part's last box is extended down to where the next part (or the "Total" line) starts,
   * found again from the PDF text. A box is only ever made longer, never moved or shortened.
   */
  async restoreQuestionSpace(slug: string): Promise<number> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error(`Paper ${slug} not found`);
    const keys = paperKeys(slug);
    if (!this.storage.exists(keys.qp)) return 0;
    const parts: Part[] = await this.db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').orderBy('sort_order').select('id', 'number');
    const pdfBuf = await this.storage.read(keys.qp);
    const auto = await this.findQuestionBoxes(slug, pdfBuf, parts);
    const rows: { question_id: number; page: number; box: unknown; sort_order: number }[] = await this.db('question_images')
      .whereIn('question_id', parts.map((p) => p.id))
      .where({ kind: 'FULL', source: 'QP' })
      .orderBy(['question_id', 'sort_order'])
      .select('question_id', 'page', 'box', 'sort_order');
    let changed = 0;
    for (const part of parts) {
      const mine = rows.filter((r) => r.question_id === part.id).map((r) => ({ page: r.page, box: (typeof r.box === 'string' ? JSON.parse(r.box) : r.box) as Box }));
      const found = auto.get(part.id);
      if (!mine.length || !found) continue;
      const last = mine[mine.length - 1];
      const same = found.crops.filter((c) => c.page === last.page);
      if (!same.length) continue;
      // the automatic crop that sits on the same page, nearest to this one's top
      const a = same.sort((x, y) => Math.abs(x.box.y0 - last.box.y0) - Math.abs(y.box.y0 - last.box.y0))[0];
      if (Math.abs(a.box.y0 - last.box.y0) > 0.06 || a.box.y1 - last.box.y1 < 0.01) continue;
      // never past the top of the next part's own crop (text between two parts belongs to the next one)
      const nextRows = rows.filter((r) => r.question_id === parts[parts.indexOf(part) + 1]?.id);
      const nb = nextRows[0] && nextRows[0].page === last.page ? ((typeof nextRows[0].box === 'string' ? JSON.parse(nextRows[0].box) : nextRows[0].box) as Box) : null;
      const cap = nb && nb.y0 > last.box.y0 + 0.02 ? nb.y0 - 0.001 : a.box.y1;
      const y1 = Math.min(a.box.y1, cap);
      if (y1 - last.box.y1 < 0.01) continue;
      mine[mine.length - 1] = { page: last.page, box: { x0: last.box.x0, y0: last.box.y0, x1: last.box.x1, y1: round(y1) } };
      await this.setManual(part.id, 'QP', mine);
      changed++;
    }
    return changed + (await this.trimOverlaps(slug));
  }

  /**
   * A question can run over several pages of the paper (the answer space continues on "Question 2 continued" pages).
   * Add every page of a part that the automatic cut finds but the saved crop is missing, so the worksheet gives all of
   * those pages. Existing boxes are kept as they are.
   */
  async addContinuationPages(slug: string): Promise<number> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error(`Paper ${slug} not found`);
    const keys = paperKeys(slug);
    if (!this.storage.exists(keys.qp)) return 0;
    const parts: Part[] = await this.db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').orderBy('sort_order').select('id', 'number');
    const auto = await this.findQuestionBoxes(slug, await this.storage.read(keys.qp), parts);
    const rows: { question_id: number; page: number; box: unknown }[] = await this.db('question_images')
      .whereIn('question_id', parts.map((p) => p.id))
      .where({ kind: 'FULL', source: 'QP' })
      .orderBy(['question_id', 'sort_order'])
      .select('question_id', 'page', 'box');
    let changed = 0;
    for (const part of parts) {
      const found = auto.get(part.id);
      const mine = rows.filter((r) => r.question_id === part.id).map((r) => ({ page: r.page, box: (typeof r.box === 'string' ? JSON.parse(r.box) : r.box) as Box }));
      if (!found || !mine.length) continue;
      const have = new Set(mine.map((m) => m.page));
      const extra = found.crops.filter((c) => !have.has(c.page)).map((c) => ({ page: c.page, box: { x0: c.box.x0, y0: c.box.y0, x1: c.box.x1, y1: c.box.y1 } }));
      if (!extra.length) continue;
      const all = [...mine, ...extra].sort((a, b) => a.page - b.page || a.box.y0 - b.box.y0);
      await this.setManual(part.id, 'QP', all);
      changed++;
    }
    return changed;
  }

  /**
   * Two parts of one question must never print the same page region: the continued pages ("Question 4 continued")
   * belong to the last part that has them. Drops the repeated crops from the earlier part.
   */
  async dedupeContinuedPages(slug: string): Promise<number> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error(`Paper ${slug} not found`);
    const parts: (Part & { base_number: string })[] = await this.db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').orderBy('sort_order').select('id', 'number', 'base_number');
    const rows: { question_id: number; page: number; box: unknown }[] = await this.db('question_images')
      .whereIn('question_id', parts.map((p) => p.id))
      .where({ kind: 'FULL', source: 'QP' })
      .orderBy(['question_id', 'sort_order'])
      .select('question_id', 'page', 'box');
    const regions = new Map<number, { page: number; box: Box }[]>();
    for (const r of rows) {
      const l = regions.get(r.question_id) ?? [];
      l.push({ page: r.page, box: (typeof r.box === 'string' ? JSON.parse(r.box) : r.box) as Box });
      regions.set(r.question_id, l);
    }
    const byQuestion = new Map<string, number[]>();
    for (const p of parts) byQuestion.set(p.base_number, [...(byQuestion.get(p.base_number) ?? []), p.id]);
    let changed = 0;
    for (const ids of byQuestion.values()) {
      const drop = new Map<number, Set<number>>(); // part id -> indexes of its crops to drop
      for (let a = 0; a < ids.length; a++) {
        const ra = regions.get(ids[a]) ?? [];
        ra.forEach((x, xi) => {
          for (let b = a + 1; b < ids.length; b++)
            for (const y of regions.get(ids[b]) ?? []) {
              if (y.page !== x.page) continue;
              const ov = Math.min(x.box.y1, y.box.y1) - Math.max(x.box.y0, y.box.y0);
              if (ov > 0.5 * Math.min(x.box.y1 - x.box.y0, y.box.y1 - y.box.y0)) drop.set(ids[a], (drop.get(ids[a]) ?? new Set()).add(xi));
            }
        });
      }
      for (const [id, idx] of drop) {
        const keep = (regions.get(id) ?? []).filter((_, i) => !idx.has(i));
        if (!keep.length) continue;
        await this.setManual(id, 'QP', keep);
        changed++;
      }
    }
    // A crop must never print a region that belongs to a different question either: when two questions share one, the
    // part with far more crops (a runaway cut over many pages) loses it.
    const questionOf = new Map(parts.map((p) => [p.id, p.base_number]));
    const all = [...regions.entries()];
    const lose = new Map<number, Set<number>>();
    for (const [ida, ra] of all)
      ra.forEach((x, xi) => {
        for (const [idb, rb] of all) {
          if (questionOf.get(ida) === questionOf.get(idb)) continue;
          for (const y of rb) {
            if (y.page !== x.page) continue;
            const ov = Math.min(x.box.y1, y.box.y1) - Math.max(x.box.y0, y.box.y0);
            if (ov > 0.05 && ra.length > rb.length * 2) lose.set(ida, (lose.get(ida) ?? new Set()).add(xi));
          }
        }
      });
    for (const [id, idx] of lose) {
      const keep = (regions.get(id) ?? []).filter((_, i) => !idx.has(i));
      if (!keep.length) continue;
      await this.setManual(id, 'QP', keep);
      changed++;
    }
    return changed;
  }

  /**
   * The crops of a question are printed part by part, so they must run in paper order. Continued pages that were
   * attached to an early part ("(a)") but come after the start of a later part ("(b)", "(c)") belong to the LAST part:
   * move them there, so (a) (b) (c) print first and the continued pages follow.
   */
  async reorderContinuations(slug: string): Promise<number> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error(`Paper ${slug} not found`);
    const parts: (Part & { base_number: string })[] = await this.db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').orderBy('sort_order').select('id', 'number', 'base_number');
    const rows: { question_id: number; page: number; box: unknown }[] = await this.db('question_images')
      .whereIn('question_id', parts.map((p) => p.id))
      .where({ kind: 'FULL', source: 'QP' })
      .orderBy(['question_id', 'sort_order'])
      .select('question_id', 'page', 'box');
    const regions = new Map<number, { page: number; box: Box }[]>();
    for (const r of rows) {
      const l = regions.get(r.question_id) ?? [];
      l.push({ page: r.page, box: (typeof r.box === 'string' ? JSON.parse(r.box) : r.box) as Box });
      regions.set(r.question_id, l);
    }
    const before = (a: { page: number; box: Box }, b: { page: number; box: Box }) => a.page < b.page || (a.page === b.page && a.box.y0 < b.box.y0 - 0.01);
    const byQuestion = new Map<string, number[]>();
    for (const p of parts) byQuestion.set(p.base_number, [...(byQuestion.get(p.base_number) ?? []), p.id]);
    let changed = 0;
    for (const ids of byQuestion.values()) {
      if (ids.length < 2) continue;
      const lastId = ids[ids.length - 1];
      const moved: { page: number; box: Box }[] = [];
      const edits = new Map<number, { page: number; box: Box }[]>();
      for (let i = 0; i < ids.length - 1; i++) {
        const mine = regions.get(ids[i]) ?? [];
        // where the later parts begin
        const laterStarts = ids.slice(i + 1).map((id) => regions.get(id)?.[0]).filter((x): x is { page: number; box: Box } => !!x);
        if (!laterStarts.length) continue;
        const keep: { page: number; box: Box }[] = [];
        mine.forEach((c, ci) => {
          if (ci > 0 && laterStarts.some((st) => before(st, c))) moved.push(c);
          else keep.push(c);
        });
        if (keep.length !== mine.length) edits.set(ids[i], keep);
      }
      if (!moved.length) continue;
      const last = regions.get(lastId) ?? [];
      const have = new Set(last.map((c) => `${c.page}:${c.box.y0}`));
      const merged = [...last, ...moved.filter((c) => !have.has(`${c.page}:${c.box.y0}`))].sort((a, b) => a.page - b.page || a.box.y0 - b.box.y0);
      for (const [id, keep] of edits) if (keep.length) await this.setManual(id, 'QP', keep);
      await this.setManual(lastId, 'QP', merged);
      changed++;
    }
    return changed;
  }

  /** Find the writing lines of every question-paper crop that is already saved and keep them in the crop's box. */
  async annotateRules(slug: string): Promise<number> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error(`Paper ${slug} not found`);
    const rows: { id: number; file_path: string; box: unknown }[] = await this.db('question_images as i')
      .join('questions as q', 'q.id', 'i.question_id')
      .where({ 'q.paper_id': paper.id, 'i.kind': 'FULL', 'i.source': 'QP' })
      .whereNull('q.deleted_at')
      .select('i.id', 'i.file_path', 'i.box');
    let n = 0;
    for (const r of rows) {
      if (!this.storage.exists(r.file_path)) continue;
      const { data, info } = await sharp(await this.storage.read(r.file_path)).greyscale().raw().toBuffer({ resolveWithObject: true });
      const rules = findRules(data, info.width, info.height);
      const box = (typeof r.box === 'string' ? JSON.parse(r.box) : r.box) as CropBox;
      if (rules) box.rules = rules;
      else delete box.rules;
      await this.db('question_images').where({ id: r.id }).update({ box: JSON.stringify(box) });
      if (rules) n++;
    }
    return n;
  }

  /**
   * A part's crop must stop where the next part's crop starts: text between two parts ("Given that …" before part (c))
   * belongs to the next part and must not be printed twice. Shortens any crop that runs into the next one.
   */
  async trimOverlaps(slug: string): Promise<number> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error(`Paper ${slug} not found`);
    const parts: Part[] = await this.db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').orderBy('sort_order').select('id', 'number');
    const rows: { question_id: number; page: number; box: unknown }[] = await this.db('question_images')
      .whereIn('question_id', parts.map((p) => p.id))
      .where({ kind: 'FULL', source: 'QP' })
      .orderBy(['question_id', 'sort_order'])
      .select('question_id', 'page', 'box');
    const regionsOf = (id: number) => rows.filter((r) => r.question_id === id).map((r) => ({ page: r.page, box: (typeof r.box === 'string' ? JSON.parse(r.box) : r.box) as Box }));
    let changed = 0;
    for (let i = 0; i + 1 < parts.length; i++) {
      const cur = regionsOf(parts[i].id);
      const nxt = regionsOf(parts[i + 1].id);
      if (!cur.length || !nxt.length) continue;
      const last = cur[cur.length - 1];
      const first = nxt[0];
      if (last.page !== first.page) continue;
      if (first.box.y0 <= last.box.y0 + 0.02 || last.box.y1 <= first.box.y0 + 0.004) continue;
      cur[cur.length - 1] = { page: last.page, box: { ...last.box, y1: round(first.box.y0 - 0.001) } };
      await this.setManual(parts[i].id, 'QP', cur);
      for (const r of rows) if (r.question_id === parts[i].id && r.page === last.page) r.box = cur[cur.length - 1].box;
      changed++;
    }
    return changed;
  }

  /**
   * A crop edge must not run through a line of printed text (half a line of "(Total 11 marks)" at the bottom, the tops
   * of the header words at the top): move the edge to just outside any line it would cut.
   */
  private async snapEdgesToText(pdfBuf: Buffer, plans: Map<number, Plan>): Promise<void> {
    const { doc, close } = await openPdf(pdfBuf);
    try {
      const cache = new Map<number, Item[]>();
      for (const plan of plans.values()) {
        for (const c of plan.crops) {
          if (!cache.has(c.page)) cache.set(c.page, await viewportItems(doc, c.page));
          const items = cache.get(c.page)!.filter((i) => i.x + i.w > c.box.x0 && i.x < c.box.x1 && i.base - i.top < 0.03);
          let { y0, y1 } = c.box;
          // a continued page starts with "Question 6 continued": the crop must include that line, not start under it
          const near = cache.get(c.page)!.filter((i) => i.top >= y0 - 0.04 && i.top < y0 + 0.03 && i.x < c.box.x0 + 0.3);
          const rowsNear: Item[][] = [];
          for (const it of [...near].sort((a2, b2) => a2.base - b2.base || a2.x - b2.x)) {
            const l = rowsNear[rowsNear.length - 1];
            if (l && Math.abs(it.base - l[0].base) < 0.006) l.push(it);
            else rowsNear.push([it]);
          }
          const heading = rowsNear.find((l) => /^Question\s*\d+\s*(\(.*\))?\s*continued$/i.test(l.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim()));
          if (heading) y0 = Math.min(y0, Math.min(...heading.map((i) => i.top)) - 0.005);
          // A cut line goes to the side most of it is on: a part's own first / last line is kept (the box started a
          // touch inside it), a header or the next part's label just touching the edge is left out.
          for (let pass = 0; pass < 3; pass++) {
            for (const i of items) {
              const mid = (i.top + i.base) / 2;
              if (i.top < y1 - 0.002 && i.base > y1 + 0.002) y1 = mid <= y1 ? Math.max(y1, i.base + 0.003) : Math.min(y1, i.top - 0.003);
              if (i.top < y0 - 0.002 && i.base > y0 + 0.002) y0 = mid >= y0 ? Math.min(y0, i.top - 0.003) : Math.max(y0, i.base + 0.003);
            }
          }
          if (y1 - y0 > 0.05) c.box = { ...c.box, y0: round(y0), y1: round(y1) };
        }
      }
    } finally {
      await close();
    }
  }

  /**
   * Question paper: a continued page starts with the paper's own "Question 6 continued". It is whited out and its place
   * kept, so the worksheet writes "Question <our number> continued" there instead.
   */
  private async clearContinuedHeadings(pdfBuf: Buffer, plans: Map<number, Plan>, hiRes: Map<number, Buffer>, out: Map<string, Continued>, qmarks: Map<string, Continued>): Promise<void> {
    const { doc, close } = await openPdf(pdfBuf);
    try {
      const cache = new Map<number, Item[]>();
      for (const [id, plan] of plans) {
        for (const [k, c] of plan.crops.entries()) {
          if (!hiRes.has(c.page)) continue;
          if (!cache.has(c.page)) cache.set(c.page, await viewportItems(doc, c.page));
          const band = cache.get(c.page)!.filter((i) => i.top >= c.box.y0 - 0.004 && i.top < c.box.y0 + 0.07 && i.x >= c.box.x0 - 0.01 && i.x < c.box.x0 + 0.3);
          // the pieces of one line, left to right
          const lines: Item[][] = [];
          for (const it of [...band].sort((a, b) => a.base - b.base || a.x - b.x)) {
            const l = lines[lines.length - 1];
            if (l && Math.abs(it.base - l[0].base) < 0.006) l.push(it);
            else lines.push([it]);
          }
          // old papers: the marks box at the foot of the page is labelled "Q6" (the paper's own question number)
          const qm = cache.get(c.page)!.find((i) => /^Q\d{1,2}$/.test(i.str.trim()) && i.x > c.box.x0 + (c.box.x1 - c.box.x0) * 0.8 && i.top >= c.box.y0 && i.base <= c.box.y1 + 0.004);
          if (qm) {
            const qr: Rect = { page: c.page, x0: qm.x - 0.004, y0: qm.top - 0.004, x1: qm.x + qm.w + 0.004, y1: qm.base + 0.006 };
            const qi = await inkInside(hiRes.get(c.page)!, qr);
            if (qi) {
              hiRes.set(c.page, await whiteOut(hiRes.get(c.page)!, qi.px));
              qmarks.set(`${id}:${k}`, { x: round(qm.x), base: round(qm.base), em: round(qm.base - qm.top) });
            }
          }
          const line = lines.find((l) => /^Question\s*\d+\s*(\(.*\))?\s*continued$/i.test(l.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim()));
          if (!line) continue;
          const x0 = Math.min(...line.map((i) => i.x));
          const x1 = Math.max(...line.map((i) => i.x + i.w));
          const top = Math.min(...line.map((i) => i.top));
          const base = Math.max(...line.map((i) => i.base));
          const rect: Rect = { page: c.page, x0: x0 - 0.004, y0: top - 0.004, x1: x1 + 0.004, y1: base + 0.006 };
          const ink = await inkInside(hiRes.get(c.page)!, rect);
          if (!ink) continue;
          hiRes.set(c.page, await whiteOut(hiRes.get(c.page)!, ink.px));
          out.set(`${id}:${k}`, { x: round(x0), base: round(base), em: round(base - top) });
        }
      }
    } finally {
      await close();
    }
  }

  /** Move each box's top and bottom edge onto the nearest ruled line of the table (within ~1% of the page), if there is one. */
  private async snapToRules(pdfBuf: Buffer, boxes: { page: number; box: Box }[]): Promise<{ page: number; box: Box }[]> {
    const images = await renderPdfPagesAt(pdfBuf, [...new Set(boxes.map((b) => b.page))], 2);
    const rulers = new Map<number, Awaited<ReturnType<typeof ruler>>>();
    const out: { page: number; box: Box }[] = [];
    for (const b of boxes) {
      const img = images.get(b.page);
      if (!img) {
        out.push(b);
        continue;
      }
      if (!rulers.has(b.page)) rulers.set(b.page, await ruler(img));
      const R = rulers.get(b.page)!;
      const reach = Math.round(0.012 * R.H);
      const near = (yFrac: number) => {
        const y = Math.round(yFrac * R.H);
        for (let d = 0; d <= reach; d++) for (const yy of d === 0 ? [y] : [y - d, y + d]) if (R.rule(yy, b.box.x0, b.box.x1)) return yy / R.H;
        return null;
      };
      const y0 = near(b.box.y0);
      const y1 = near(b.box.y1);
      // the crop above ends on this rule and already shows it: starting just below it keeps the line single, not doubled
      const top = y0 != null ? y0 + 0.0014 : b.box.y0;
      const bottom = y1 != null ? y1 + 0.0012 : b.box.y1;
      out.push({ page: b.page, box: bottom - top >= 0.02 ? { ...b.box, y0: round(top), y1: round(bottom) } : b.box });
    }
    return out;
  }

  /**
   * Re-cut only the grey header row ("Question Number | Scheme | Marks") of a paper's mark-scheme crops, leaving
   * every crop box (hand-drawn or not) as it is.
   */
  async refreshHeads(slug: string): Promise<number> {
    const paper = await this.db('papers').where({ slug }).first('id');
    if (!paper) throw new Error(`Paper ${slug} not found`);
    const keys = paperKeys(slug);
    if (!this.storage.exists(keys.ms)) return 0;
    const parts: Part[] = await this.db('questions').where({ paper_id: paper.id }).whereNull('deleted_at').orderBy('sort_order').select('id', 'number');
    const pdfBuf = await this.storage.read(keys.ms);
    const plans = await this.findMarkSchemeBoxes(slug, pdfBuf, parts);
    const withHead = [...plans].filter(([, p]) => p.head);
    if (!withHead.length) return 0;
    const pages = [...new Set(withHead.map(([, p]) => p.head!.page))];
    const hiRes = await renderPdfPagesAt(pdfBuf, pages);
    const stamp = Date.now().toString(36);
    let n = 0;
    for (const [id, plan] of withHead) {
      const img = hiRes.get(plan.head!.page);
      const row = await this.db('question_images').where({ question_id: id, kind: 'FULL', source: 'MS', sort_order: 0 }).first('id', 'box');
      if (!img || !row) continue;
      const box = (typeof row.box === 'string' ? JSON.parse(row.box) : row.box) as CropBox;
      const file = `${paperKeys(slug).dir}/questions/q${id}-mshead-${stamp}.jpg`;
      // cut over the same width as the part's own crop, so the header and the rows join edge to edge
      await this.storage.write(file, await cutJpeg(img, { ...plan.head!.box, x0: box.x0, x1: box.x1 }));
      await this.db('question_images').where({ id: row.id }).update({ box: JSON.stringify({ ...box, head: file, headH: round(plan.head!.box.y1 - plan.head!.box.y0) }) });
      if (box.head && box.head !== file) await rm(this.storage.absolute(box.head), { force: true }).catch(() => undefined);
      n++;
    }
    return n;
  }

  /** The admin drew a part's crop box(es) by hand: cut exactly those (question paper or mark scheme). */
  async setManual(questionId: number, source: Source, regions: { page: number; box: Box }[]): Promise<void> {
    const q = await this.db('questions as q').join('papers as p', 'p.id', 'q.paper_id').where('q.id', questionId).first('q.id', 'q.number', 'p.slug');
    if (!q) throw new Error('Question not found');
    const keys = paperKeys(q.slug);
    const file = source === 'QP' ? keys.qp : keys.ms;
    if (!this.storage.exists(file)) throw new Error(source === 'QP' ? 'The question paper PDF is missing' : 'This paper has no mark scheme');
    let boxes = regions.map((r) => ({ page: r.page, box: normaliseBox(r.box) })).filter((r): r is { page: number; box: Box } => !!r.box);
    if (!boxes.length) throw new Error('Draw at least one box');
    const pdfBuf = await this.storage.read(file);
    // a mark-scheme box is cut along the table's ruled lines, so every crop is a closed box like the paper's own
    if (source === 'MS') boxes = await this.snapToRules(pdfBuf, boxes).catch(() => boxes);
    // find the printed number inside the first box, so it is whited out and our own number goes there
    const erase = await this.numberInside(pdfBuf, boxes[0], q.number, source).catch(() => null);
    const plan: Plan = { crops: boxes.map((b) => ({ page: b.page, box: { ...b.box } })), erase };
    if (source === 'MS') {
      // the part's number is printed again in its other boxes (the Notes rows): white those out too, and put ours there
      plan.eraseCrops = [erase];
      for (const b of boxes.slice(1)) plan.eraseCrops.push(await this.numberInside(pdfBuf, b, q.number, source, true).catch(() => null));
    }
    if (source === 'MS') {
      // keep the table's header row from the automatic cut, if there was one
      const old = await this.db('question_images').where({ question_id: questionId, kind: 'FULL', source: 'MS' }).orderBy('sort_order').first('box');
      const ob = (typeof old?.box === 'string' ? JSON.parse(old.box) : old?.box) as CropBox | undefined;
      if (ob?.head) plan.crops[0].box = { ...plan.crops[0].box, head: ob.head, headH: ob.headH };
    }
    await this.saveCrops(q.slug, source, pdfBuf, new Map([[questionId, plan]]), { keepHead: source === 'MS' });
  }

  // ------------------------------------------------------------------ question paper: positions from the text

  private async findQuestionBoxes(slug: string, pdfBuf: Buffer, parts: Part[]): Promise<Map<number, Plan>> {
    // (IAL maths "4(i)(a)": the roman numeral comes FIRST; kept under the same key shape (q, letter, roman))
    const romanFirstQ = new Set<string>();
    const firstOfRoman = new Map<string, Part>();
    const parsePart = (n: string) => {
      const c = n.replace(/\s+/g, '');
      const rf = /^(\d+)\(([ivx]+)\)\(([a-h])\)/i.exec(c);
      if (rf) return { q: rf[1], letter: rf[3].toLowerCase(), roman: rf[2].toLowerCase(), rf: true };
      const m = /^(\d+)\s*(?:\(([a-z])\))?\s*(?:\(([ivx]+)\))?/i.exec(c);
      return m ? { q: m[1], letter: m[2]?.toLowerCase() ?? null, roman: m[3]?.toLowerCase() ?? null, rf: false } : null;
    };
    const partByKey = new Map<string, Part>();
    const firstOfQ = new Map<string, Part>();
    for (const p of parts) {
      const k = parsePart(p.number);
      if (!k?.rf) continue;
      romanFirstQ.add(k.q);
      if (!firstOfRoman.has(`${k.q}|${k.roman}`)) firstOfRoman.set(`${k.q}|${k.roman}`, p);
    }
    // first part of each lettered part ("5(b)(i)" for "5|b"): a "(b) …" stem line with no 5(b) part of its own
    // starts that part, so the stem is cut with (b)(i) instead of being left at the end of the part before
    const firstOfLetter = new Map<string, Part>();
    for (const p of parts) {
      const k = parsePart(p.number);
      if (!k) continue;
      partByKey.set(partKey(k.q, k.letter, k.roman), p);
      if (!firstOfQ.has(k.q)) firstOfQ.set(k.q, p);
      if (k.letter && !firstOfLetter.has(`${k.q}|${k.letter}`)) firstOfLetter.set(`${k.q}|${k.letter}`, p);
    }

    const { doc, close } = await openPdf(pdfBuf);
    try {
      type Ev = { page: number; y: number; kind: 'start' | 'total'; q?: string | null; part?: Part; numberItem?: (Item & { page: number }) | null };
      const events: Ev[] = [];
      let state: { q: string | null; letter: string | null; roman: string | null } = { q: null, letter: null, roman: null };
      // where this paper prints its question numbers: "(a)" / "(i)" labels are looked for just right of that column
      // (papers differ: numbers at x 0.07 with "(a)" at 0.10, or numbers at 0.12 with "(a)" at 0.15)
      let numX: number | null = null;
      const pageTops: Record<number, number> = {};
      // pages with no text at all (a full-page graph grid / figure): part of the part that spans them
      const graphicPages = new Set<number>();
      const offsets: Record<number, { dx: number; dy: number }> = {};
      const lefts: Record<number, number[]> = { 0: [], 1: [] };
      const rights: Record<number, number[]> = { 0: [], 1: [] };
      const dots: number[] = [];
      // older IAL papers: a "Leave blank" column at the right edge (with the "Q1" mark box): the crop stops left of it
      const leaveX: Record<number, number> = {};

      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        // "A" papers: the question paper is followed by an Answer Book with its own cover page ("Please check the
        // examination details…") and then only blank answer space. Nothing after that second cover holds question text.
        if (n > 1 && /Please check the examination details/i.test((tc.items as { str?: string }[]).map((i) => i.str ?? '').join(' '))) break;
        // raw PDF positions recognise the labels; the page image can be offset from them (crop box) — that offset
        // is applied only to the final boxes
        const items: Item[] = [];
        for (const it of tc.items as { str?: string; transform: number[]; width: number; height: number }[]) {
          if (!it.str?.trim()) continue;
          // the sideways "DO NOT WRITE IN THIS AREA" margin text can share a line with a question number: ignore it
          // (it is printed sideways, sometimes split into "DO" + "NOT WRITE IN THIS AREA"): skip all rotated text
          if (/DO\s*NOT\s*WRITE/i.test(it.str) || Math.abs(it.transform[1]) > Math.abs(it.transform[0])) continue;
          const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
          const x = it.transform[4] / vp.width;
          const base = 1 - it.transform[5] / vp.height;
          if (/^Leave$/i.test(it.str.trim()) && base < 0.08 && x > 0.8) leaveX[n] = x;
          offsets[n] ={ dx: vx / vp.width - x, dy: vy / vp.height - base };
          const top = base - it.height / vp.height;
          // "1." (maths papers print the question number with a dot) counts as "1"
          // "(f )" (some papers print a space inside the brackets) counts as "(f)"
          // (a line printed right at the top of the page, e.g. a question number at y 0.038, has its top edge a hair above TOP:
          // the baseline decides then)
          if ((top > TOP || base > TOP + 0.006) && (base < BOTTOM || (base < 0.95 && /Total for Question|^\s*\(Total\s+\d+\s+marks?\)\s*$/i.test(it.str))) && x < RIGHT) items.push({ str: it.str.trim().replace(/^\*\s*(?=[(\d])/, '').replace(/^(\d{1,2})[.:]$/, '$1').replace(/^\(\s*([a-h]|[ivx]+)\s*\)/i, '($1)'), x, w: it.width / vp.width, base, top });
        }
        if (!items.length) {
          graphicPages.add(n);
          continue;
        }
        // "BLANK PAGE": nothing to crop on it (a part running over it continues on the next page)
        if (items.length < 8 && items.some((i) => /^BLANK\s+PAGE$/i.test(i.str))) continue;
        items.sort((a, b) => a.top - b.top || a.x - b.x);
        pageTops[n] = Math.max(TOP, Math.min(...items.map((i) => i.top)) - PAD);
        const lines: { base: number; items: Item[] }[] = [];
        for (const it of items) {
          const line = lines.find((l) => Math.abs(l.base - it.base) < 0.004);
          if (line) line.items.push(it);
          else lines.push({ base: it.base, items: [it] });
        }
        for (const line of lines) {
          line.items.sort((a, b) => a.x - b.x);
          // a label printed in pieces ("(" then "a)", or "(" then "b )") is one label
          const joined: Item[] = [];
          for (const i of line.items) {
            const p = joined[joined.length - 1];
            if (p && /\($/.test(p.str) && i.x - (p.x + p.w) < 0.012) {
              joined[joined.length - 1] = { ...p, str: (p.str + i.str).replace(/^\(\s*([a-h]|[ivx]+)\s*\)/i, '($1)'), w: Math.max(p.w, i.x + i.w - p.x) };
            } else joined.push(i);
          }
          line.items = joined;
          for (const i of line.items) if (/^\.{20,}$/.test(i.str)) dots.push(i.x + i.w);
          const text = line.items.map((i) => i.str).join(' ');
          const top = Math.min(...line.items.map((i) => i.top));
          // (some papers print it in pieces: "(T" + "otal for Question 3 = 2 marks)", so spaces are ignored)
          // (older IAL papers end a question with "(Total 8 marks)")
          if (/\(?Total\s*for\s*Question/i.test(text.replace(/\s+/g, '')) || line.items.some((i) => /^\(Total\s*\d+\s*marks?\)$/i.test(i.str))) {
            rights[n % 2].push(Math.max(...line.items.map((i) => i.x + i.w)));
            events.push({ page: n, y: top - PAD, kind: 'total', q: state.q });
            continue;
          }
          let numberItem: Item | null = null;
          let changed = false;
          for (const it of line.items.filter((i) => i.str !== '*').slice(0, 3)) {
            // a question number only counts if it is the next one in order (graph-axis digits are not)
            if (/^\d{1,2}$/.test(it.str) && it.x < 0.14 && Number(it.str) === (state.q ? Number(state.q) + 1 : Number(it.str))) {
              state = { q: it.str, letter: null, roman: null };
              numX = it.x;
              numberItem = it;
              lefts[n % 2].push(it.x);
              changed = true;
              continue;
            }
            const labelX0 = numX != null ? numX + 0.015 : 0.13;
            // (a roman label can sit further in: "(a) Find (i) ..." then "(ii)" under the (i) at x 0.26)
            if (it.x < labelX0 || it.x >= labelX0 + (/^\((i|ii|iii|iv|v|vi)\)/.test(it.str) ? 0.12 : 0.1) || !state.q) break;
            let rest = it.str;
            let any = false;
            for (;;) {
              const lm = /^\(([a-h])\)(?:\s+|$)/.exec(rest);
              // (roman-first "4(i)(a)": the letter sits under its roman numeral, further in, and keeps that numeral)
              const rfq = romanFirstQ.has(state.q!) && !!state.roman;
              if (lm && it.x < labelX0 + (rfq ? 0.12 : 0.07)) {
                state = { ...state, letter: lm[1], roman: rfq ? state.roman : null };
                rest = rest.slice(lm[0].length);
                any = true;
                continue;
              }
              const rm = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)(?:\s+|$)/.exec(rest);
              if (rm) {
                // (roman-first: a new numeral starts a new block, its letters start again)
                state = romanFirstQ.has(state.q!) ? { ...state, roman: rm[1], letter: null } : { ...state, roman: rm[1] };
                rest = rest.slice(rm[0].length);
                any = true;
                continue;
              }
              break;
            }
            if (!any) break;
            changed = true;
            if (rest) break;
          }
          if (!changed || !state.q) continue;
          const part =
            partByKey.get(partKey(state.q, state.letter, state.roman)) ??
            (state.roman ? undefined : partByKey.get(partKey(state.q, state.letter, null))) ??
            (state.letter && !state.roman ? firstOfLetter.get(`${state.q}|${state.letter}`) : undefined) ??
            (state.roman && !state.letter && romanFirstQ.has(state.q) ? firstOfRoman.get(`${state.q}|${state.roman}`) : undefined) ??
            (!state.letter && !(state.roman && romanFirstQ.has(state.q)) ? firstOfQ.get(state.q) : undefined);
          if (!part) continue;
          const last = [...events].reverse().find((e) => e.kind === 'start');
          if (last && last.part!.id === part.id) {
            if (numberItem) last.numberItem ??= { ...numberItem, page: n };
            continue;
          }
          // a tall formula on the start line ("3.   f(x) = (4 + 3√x)² / x": the numerator sits higher than the number's line):
          // its upper pieces are separate "lines" just above (their baseline within 0.008 of this line's top; the bottom of a fraction on the line ABOVE sits 0.013+ higher); take them in when they lie within the formula's own width (text
          // of the line above starts at the left margin, a "(Total ...)" line runs further right: both stay out)
          let startTop = top;
          const body = line.items.filter((i) => i !== numberItem && !/^\(([a-h]|[ivx]+)\)$/i.test(i.str));
          if (body.length) {
            const minX = Math.min(...body.map((i) => i.x));
            const maxX = Math.max(...body.map((i) => i.x + i.w));
            const above = items.filter((i) => i.base < line.base - 0.002 && i.base > top - 0.008 && i.x >= minX - 0.01 && i.x + i.w <= maxX + 0.01 && !/Total|marks?\)?$/i.test(i.str));
            if (above.length) startTop = Math.min(top, ...above.map((i) => i.top));
          }
          events.push({ page: n, y: startTop - PAD, kind: 'start', part, numberItem: numberItem ? { ...numberItem, page: n } : null });
        }
      }
      for (const o of OVERRIDES[slug] ?? []) {
        const part = parts.find((p) => p.number === o.number);
        if (!part || events.some((e) => e.kind === 'start' && e.part!.id === part.id)) continue;
        const at = events.findIndex((e) => e.page > o.page || (e.page === o.page && e.y > o.y));
        events.splice(at < 0 ? events.length : at, 0, { page: o.page, y: o.y, kind: 'start', part, numberItem: null });
      }

      // column edges per page parity (odd/even pages can have mirrored margins)
      const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
      const allL = [...lefts[0], ...lefts[1]];
      const allR = [...rights[0], ...rights[1]];
      const edge = (p: number) => ({
        x0: (lefts[p % 2].length ? med(lefts[p % 2]) : allL.length ? med(allL) : X0 + 0.009) - 0.009,
        // (no dotted answer lines on the page, e.g. the "A" booklets: the standard right edge 0.9305 AFTER the page's sideways shift,
        // not the median of the "(Total ...)" line ends, which is too far left and clips wide tables)
        x1: Math.min(dots.length ? Math.max(...dots) + 0.006 : 0.9305 - (offsets[p]?.dx ?? 0), leaveX[p] != null ? leaveX[p] - 0.008 : 1),
      });

      // where this paper's pages normally start their text (a page whose first line is far lower has something above it)
      const topVals = Object.values(pageTops).sort((a, b) => a - b);
      const medTop = topVals.length ? topVals[Math.floor(topVals.length / 2)] : TOP;
      const plans = new Map<number, Plan>();
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (e.kind !== 'start') continue;
        const q = parsePart(e.part!.number)?.q;
        const realEnd = events.slice(i + 1).find((x) => x.kind === 'start' || (x.kind === 'total' && x.q === q));
        const end = realEnd ?? { page: doc.numPages, y: BOTTOM };
        const crops: Plan['crops'] = [];
        for (let p = e.page; p <= end.page; p++) {
          // (a text-less page counts only BETWEEN this part and the next real start / total line: after the last part of the
          // paper the empty pages that follow are not part of it)
          if (!(p in pageTops) && !(graphicPages.has(p) && realEnd) && p !== e.page) continue;
          // a later page of the part starts at the top margin, not at its first line of TEXT: a graph grid / figure at the
          // top of the page has no text and would be lost
          // (only when there is a real gap above that first line, 0.04+: otherwise the part ending at the very top of the page
          // would get a useless sliver of margin)
          const y0 = p === e.page ? e.y : pageTops[p] === undefined || pageTops[p] - medTop > 0.05 ? TOP : pageTops[p];
          const y1 = p === end.page ? end.y : BOTTOM;
          const o = offsets[p] ?? { dx: 0, dy: 0 };
          if (y1 - y0 > 0.02) crops.push({ page: p, box: { x0: round(edge(p).x0 + o.dx), y0: round(y0 + o.dy), x1: round(edge(p).x1 + o.dx), y1: round(y1 + o.dy) } });
        }
        if (!crops.length) continue;
        const ni = e.numberItem;
        const o = ni ? (offsets[ni.page] ?? { dx: 0, dy: 0 }) : null;
        plans.set(e.part!.id, {
          crops,
          erase: ni && o ? { page: ni.page, x0: ni.x - 0.004 + o.dx, y0: ni.top - 0.004 + o.dy, x1: ni.x + ni.w + 0.004 + o.dx, y1: ni.base + 0.004 + o.dy, t: ni.str } : null,
        });
      }
      return plans;
    } finally {
      await close();
    }
  }

  /** Papers without usable text: the AI says where each part is on its page(s). */
  private async aiQuestionBoxes(slug: string, parts: Part[]): Promise<Map<number, Plan>> {
    const keys = paperKeys(slug);
    const rows: { id: number; number: string; page: number; pages: unknown }[] = await this.db('questions').whereIn('id', parts.map((p) => p.id)).select('id', 'number', 'page', 'pages');
    const pagesOf = (q: { page: number; pages: unknown }) => {
      const list = (typeof q.pages === 'string' ? JSON.parse(q.pages) : q.pages) as number[] | null;
      return list?.length ? list : [q.page];
    };
    const onPage = new Map<number, typeof rows>();
    for (const q of rows) for (const p of pagesOf(q)) onPage.set(p, [...(onPage.get(p) ?? []), q]);
    const plans = new Map<number, Plan>();
    for (const page of [...onPage.keys()].sort((a, b) => a - b)) {
      const pageKey = keys.page('qp', page);
      if (!this.storage.exists(pageKey)) continue;
      const onThis = onPage.get(page)!;
      let boxes: { number: string; x0: number; y0: number; x1: number; y1: number }[] = [];
      try {
        boxes = (await this.ai.findQuestionBoxes(await this.storage.read(pageKey), page, onThis.map((q) => q.number))).boxes;
      } catch (err) {
        this.logger.warn(`${slug}: page ${page} AI boxes skipped: ${(err as Error).message}`);
        continue;
      }
      for (const b of boxes) {
        const q = matchPart(b.number, onThis);
        const box = normaliseBox(b);
        if (!q || !box) continue;
        const plan = plans.get(q.id) ?? { crops: [], erase: null };
        const same = plan.crops.find((c) => c.page === page);
        if (same) same.box = { x0: Math.min(same.box.x0, box.x0), y0: Math.min(same.box.y0, box.y0), x1: Math.max(same.box.x1, box.x1), y1: Math.max(same.box.y1, box.y1) };
        else plan.crops.push({ page, box });
        plans.set(q.id, plan);
      }
    }
    for (const p of plans.values()) p.crops.sort((a, b) => a.page - b.page);
    return plans;
  }

  // ------------------------------------------------------------------ mark scheme: table rows

  private async findMarkSchemeBoxes(slug: string, pdfBuf: Buffer, parts: Part[]): Promise<Map<number, Plan>> {
    const partByKey = new Map<string, Part>();
    const firstOfQ = new Map<string, Part>();
    for (const p of parts) {
      const k = parseNumber(p.number);
      if (!k) continue;
      partByKey.set(partKey(k.q, k.l, k.r), p);
      if (!firstOfQ.has(k.q)) firstOfQ.set(k.q, p);
    }
    const findPart = (k: { q: string; l: string | null; r: string | null }) =>
      partByKey.get(partKey(k.q, k.l, k.r)) ?? (k.r ? undefined : partByKey.get(partKey(k.q, k.l, null))) ?? (!k.l ? firstOfQ.get(k.q) : undefined);

    const { doc, close } = await openPdf(pdfBuf);
    // page images for the ruled lines (scale 2 ≈ 150 dpi is plenty to find lines)
    const images = await renderPdfPagesAt(pdfBuf, Array.from({ length: doc.numPages }, (_, i) => i + 1), 2);
    try {
      // heads: the top of every header row on the page (a new table can start mid-page, e.g. after the MCQ block)
      // pre: rows printed ABOVE the page's header (a row continued from the previous page), if any
      type Table = { x0: number; x1: number; head: { y0: number; y1: number } | null; pre: { y0: number; y1: number } | null; heads: number[]; top: number; bottom: number; snapUp: (y: number, limit?: number) => number | null; snapStart: (y: number) => number | null; gapAbove: (y: number, floor: number) => number };
      type Ev = { page: number; kind: 'start' | 'total'; top: number; part?: Part; numberBox?: Rect };
      const events: Ev[] = [];
      const tables: Record<number, Table> = {};
      let last: { tx0: number; tx1: number; colX: number; colMin: number; quHead: boolean } | null = null;
      let cur: { q: string; l: string | null; r?: string | null } | null = null; // the last part number seen in the number column
      // maths mark schemes repeat the part labels ("(a)", "1a") in the notes under each table: there a label only counts
      // when it comes after the last part found (notes only ever repeat earlier parts)
      let maths = false;
      let lastIdx = -1;
      let stats = false; // a statistics mark scheme ("Qu" headers): its own rules below
      const order = new Map(parts.map((p, i) => [p.id, i]));

      for (let n = 1; n <= doc.numPages; n++) {
        const img = images.get(n);
        if (!img) continue;
        const raw = await viewportItems(doc, n);
        // some mark schemes split the header word into pieces ("Qu" + "estion", "Questio" + "n"): join them
        const items: Item[] = [];
        // statistics mark schemes print the question number IN the header row: "Qu 1 | Scheme | Marks | AO"
        let headQ: string | null = null;
        let quHead = false; // the header says "Qu" (statistics): its scheme text starts close to the part labels
        for (let i = 0; i < raw.length; i++) {
          const a = raw[i], b = raw.slice(i + 1).find((x) => x.str.trim());
          // ("Qu 1" can also be one text item; some print "Que.")
          const qu = /^Que?\.?(?:\s+(\d{1,2}))?$/.exec(a.str.trim());
          if (qu && raw.some((x) => /^Scheme$/.test(x.str.trim()) && Math.abs(x.base - a.base) < 0.01)) {
            items.push({ ...a, str: 'Question' });
            quHead = true;
            if (qu[1]) headQ = String(+qu[1]);
            else if (b && /^\d{1,2}$/.test(b.str.trim()) && Math.abs(a.base - b.base) < 0.006) {
              headQ = String(+b.str.trim());
              i = raw.indexOf(b);
            }
            continue;
          }
          if (b && /^Q[a-z]{0,7}$/.test(a.str.trim()) && a.str.trim() + b.str.trim() === 'Question' && Math.abs(a.base - b.base) < 0.006) {
            items.push({ ...a, str: 'Question', w: b.x + b.w - a.x });
            i = raw.indexOf(b);
          } else items.push(a);
        }
        const lines = linesOf(items);
        const R = await ruler(img);
        // header row: "Question" over "Number" (or "Question Number" on one line); some papers' "Question" word is not
        // in the text layer, so "Number" with "Answer" and "Mark" on the same row also counts
        const isQ = (i: Item) => /^Question(\s+Number)?$/i.test(i.str);
        const sameRow = (l: { base: number }, re: RegExp) => items.some((i) => re.test(i.str) && Math.abs(i.base - l.base) < 0.03);
        const numberOnly = (l: { items: Item[]; base: number }) => l.items.some((i) => /^Number$/i.test(i.str)) && sameRow(l, /^Marks?$/i) && sameRow(l, /Answer|^Scheme$/i);
        // some papers print only "Question" (no "Number") over "Answer" and "Mark" (maths: "Question | Scheme | Marks | AOs")
        const questionOnly = (l: { items: Item[]; base: number }) => l.items.some((i) => /^Question$/i.test(i.str)) && sameRow(l, /^Marks?$/i) && sameRow(l, /Answer|^Scheme$/i);
        // ...or only "Acceptable Answers | Additional Guidance | Mark" (no "Question Number" words at all)
        const guidanceOnly = (l: { items: Item[]; base: number }) => l.items.some((i) => /^(Acceptable\s+)?Answers?$/i.test(i.str)) && sameRow(l, /Guidance/i) && sameRow(l, /^Marks?$/i);
        const isHeadLine = (l: { items: Item[]; base: number }) =>
          (l.items.some(isQ) && (l.items.some((i) => /Number/i.test(i.str)) || lines.some((o) => o.base > l.base && o.base - l.base < 0.04 && o.items.some((i) => /^Number$/i.test(i.str))))) || numberOnly(l) || questionOnly(l) || guidanceOnly(l);
        let qLine = lines.find((l) => l.items.some(isQ));
        let qItem = qLine?.items.find(isQ);
        let numLine = qLine && (/Number/i.test(qItem!.str) ? qLine : lines.find((l) => l.base > qLine!.base && l.base - qLine!.base < 0.04 && l.items.some((i) => /^Number$/i.test(i.str))));
        if (!qLine || !numLine) {
          const nl = lines.find(numberOnly) ?? lines.find(questionOnly) ?? lines.find(guidanceOnly);
          if (nl) {
            qLine = nl;
            numLine = nl;
            qItem = nl.items.find((i) => /^Number$/i.test(i.str)) ?? nl.items.find((i) => /^Question$/i.test(i.str)) ?? nl.items.find((i) => /^(Acceptable\s+)?Answers?$/i.test(i.str));
          }
        }
        // "Mark" is centred in the header row, often between the "Question" and "Number" lines
        const markItem = numLine && qLine ? items.filter((i) => /^Marks?$/i.test(i.str) && i.base > qLine.top - 0.01 && i.top < numLine.base + 0.01).sort((a, b) => b.x - a.x)[0] : undefined;
        let tx0: number, tx1: number, colX: number;
        // maths mark schemes ("Question | Scheme | Marks | AOs") print notes under each table that start LEFT of the part
        // numbers and hold "(a)" labels and stray digits: there the number column is only the narrow strip right of "Question"
        let colMin = 0;
        let head: Table['head'] = null;
        let bodyTop: number | null;
        if (numLine && markItem && qLine && qItem) {
          // table edges: the grey header fill, walking out from the header words along its middle
          const yMid = Math.round(((qLine.top + numLine.base) / 2) * R.H);
          let xl = Math.round(qItem.x * R.W);
          while (xl > 2 && R.ink(xl - 1, yMid)) xl--;
          let xr = Math.round((markItem.x + markItem.w) * R.W);
          while (xr < R.W - 2 && R.ink(xr + 1, yMid)) xr++;
          tx0 = xl / R.W;
          tx1 = (xr + 1) / R.W;
          // (a header that prints only "Acceptable Answers": that word already starts the answer column, so the number
          // column ends just left of it)
          colX = /^(Acceptable\s+)?Answers?$/i.test(qItem.str) ? qItem.x - 0.004 : qItem.x + 0.06;
          if (/^Question$/i.test(qItem.str) && sameRow(qLine, /^Scheme$/i)) {
            maths = true;
          }
          // statistics ("Qu | Scheme | Marks | AO"): no header fill, so the walk stops at the words: the table edges are
          // the vertical borders left of "Qu" and right of the row's last word ("AO")
          if (maths && quHead) {
            stats = true;
            const vline = (x: number) => [-4, -2, 0, 2, 4].every((d) => R.ink(x, yMid + d));
            for (let x = xl - 1; x > Math.max(2, xl - 0.06 * R.W); x--) if (vline(x)) { xl = x; break; }
            const lastWord = qLine.items.reduce((a, b) => (b.x + b.w > a.x + a.w ? b : a));
            const xe = Math.max(xr, Math.round((lastWord.x + lastWord.w) * R.W) + 1);
            for (let x = xe; x < Math.min(R.W - 2, xe + 0.06 * R.W); x++) if (vline(x)) { xr = x; break; }
            tx0 = xl / R.W;
            tx1 = (xr + 1) / R.W;
          }
        } else if (last) {
          ({ tx0, tx1, colX, colMin } = last);
          quHead = last.quHead;
        } else continue;
        const snapUp = (yFrac: number, limit = 0.03) => {
          for (let y = Math.round(yFrac * R.H); y > Math.round((yFrac - limit) * R.H); y--) if (R.rule(y, tx0, tx1)) return y / R.H;
          return null;
        };
        const snapDown = (yFrac: number, limit = 0.03) => {
          for (let y = Math.round(yFrac * R.H); y < Math.round((yFrac + limit) * R.H); y++) if (R.rule(y, tx0, tx1)) return y / R.H;
          return null;
        };
        if (numLine && markItem && qLine) {
          const hTop = Math.min(qLine.top, ...items.filter((i) => Math.abs(i.base - qLine!.base) < 0.03 && /Question|Number|Answer|Guidance|Marks?$/i.test(i.str)).map((i) => i.top));
          const headTop = snapUp(hTop + 0.008, 0.04);
          const headBottom = snapDown(numLine.base);
          // maths: a header row without a ruled line where expected: use its text position
          if ((headTop == null || headBottom == null) && maths && sameRow(qLine, /^Scheme$/i)) {
            head = { y0: round(hTop - 0.008), y1: round(numLine.base + 0.006) };
            bodyTop = head.y1;
          } else {
          if (headTop == null || headBottom == null) continue;
          // a hair above the rule: some papers' header text sits right on it and was cut off
          head = { y0: round(headTop - 0.005), y1: round(headBottom) };
          bodyTop = headBottom;
          }
        } else {
          bodyTop = snapDown(0.03, 0.5); // no header: the table (if any) starts at the first rule on the page
          if (bodyTop == null) continue;
        }
        last = { tx0, tx1, colX, colMin, quHead };
        let bottom = bodyTop;
        for (let y = Math.round(bodyTop * R.H) + 2; y < R.H * 0.97; y++) if (R.rule(y, tx0, tx1)) bottom = y / R.H;
        const heads: number[] = [];
        for (const ql of lines) {
          if (ql.base <= bodyTop + 0.002 || !isHeadLine(ql)) continue;
          // a "Number" line just below an already counted "Question" line is the same header
          if (heads.length && Math.abs(heads[heads.length - 1] - ql.top) < 0.05) continue;
          // the header's highest word ("Acceptable Answers" / "Mark" can sit above "Number")
          const hTop = Math.min(ql.top, ...items.filter((i) => Math.abs(i.base - ql.base) < 0.03 && /Question|Number|Answer|Guidance|Marks?$/i.test(i.str)).map((i) => i.top));
          heads.push(round((snapUp(hTop + 0.004, 0.03) ?? hTop - 0.008) - 0.005));
        }
        // maths (older IAL layout): the marking notes are plain text printed UNDER the table's last rule: the page's last
        // part takes them in (not when another table starts further down; not the page number / footer)
        if (maths && !heads.some((h) => h > bottom)) {
          const below = items.filter((i) => i.top > bottom + 0.003 && i.base < 0.94 && !/^\d{1,3}$/.test(i.str.trim()) && !/Pearson|Turn over|^PMT$|^P\d{4,}/i.test(i.str.trim()));
          if (below.length) bottom = Math.max(...below.map((i) => i.base)) + 0.008;
        }
        // a continued row printed above the header: from the first rule on the page down to the header
        let pre: Table['pre'] = null;
        if (head) {
          const first = snapDown(0.03, Math.max(0.01, head.y0 - 0.035));
          // ...stopping above a "(Total for Question …)" line printed under the continued row
          const total = lines.find((l) => first != null && l.top > first && l.base < head!.y0 && /Total for Question/i.test(l.text));
          const preEnd = total ? total.top - 0.004 : head.y0 - 0.002;
          if (first != null && preEnd - first > 0.02 && items.some((i) => i.top > first && i.base < preEnd && i.x > tx0 && i.x < tx1)) pre = { y0: round(first), y1: round(preEnd) };
        }
        // maths: a part label is centred in a tall merged cell, so the part's border is the nearest rule that crosses the
        // NUMBER column (rules between the rows of the scheme column stop at it)
        const numX0 = tx0 + 0.004, numX1 = Math.max(numX0 + 0.02, colX - 0.025);
        const snapStart = (yFrac: number) => {
          if (!maths) return snapUp(yFrac);
          for (let y = Math.round(yFrac * R.H); y > Math.round(Math.max(bodyTop! - 0.004, yFrac - 0.25) * R.H); y--) if (R.rule(y, numX0, numX1)) return y / R.H;
          return snapUp(yFrac);
        };
        // maths: the nearest blank pixel row above y (only the table's column borders crossing it): where two labels share
        // one ruled cell, the cut goes there, never through a fraction that sticks up above its label
        const gapAbove = (yFrac: number, floor: number) => {
          const xa = Math.round((tx0 + 0.01) * R.W), xb = Math.round((tx1 - 0.01) * R.W);
          for (let y = Math.round(yFrac * R.H); y > Math.round(floor * R.H); y--) {
            let c = 0;
            for (let x = xa; x < xb && c < 14; x++) if (R.ink(x, y)) c++;
            if (c < 14) return y / R.H;
          }
          return yFrac;
        };
        // maths: the 2026 mark-scheme design prints the notes and the Marks column wider than the header fill the edges were
        // walked from: the crop takes in every text line between the header and the table's last rule (the rule finders
        // above keep the walked edges)
        let cx0 = tx0, cx1 = tx1;
        if (maths) {
          const body = items.filter((i) => i.base > bodyTop + 0.002 && i.top < bottom && i.x > 0.02 && i.x + i.w < 0.98);
          if (body.length) {
            cx0 = Math.min(tx0, Math.min(...body.map((i) => i.x)) - 0.006);
            cx1 = Math.max(tx1, Math.max(...body.map((i) => i.x + i.w)) + 0.006);
          }
        }
        tables[n] = { x0: round(cx0), x1: round(cx1), head, pre, heads, top: round(bodyTop), bottom: round(bottom), snapUp, snapStart, gapAbove };

        // maths: the notes under a table start with a line printed LEFT of the "Question" heading (or "Notes:"); labels
        // in the notes ("(a)", "1a", stray digits of formulae) are not part starts. A new header row ends the notes.
        let inNotes = false;
        const qx = colX - 0.06;
        // (statistics: "(a)(i)" printed left of the "Question" word is a part label too, under a "5." line)
        const statsLabel = /^(\d{1,2}\s*\.?\s*(\(|$)|\([a-h]\)(\([ivx]+\))?$)/;
        if (maths && headQ) {
          const whole = partByKey.get(partKey(headQ, null, null));
          if (whole && (order.get(whole.id) ?? 0) > lastIdx) {
            events.push({ page: n, kind: 'start', top: bodyTop + 0.003, part: whole });
            lastIdx = order.get(whole.id) ?? lastIdx;
          }
          if (Number(headQ) >= Number(cur?.q ?? 0)) cur = { q: headQ, l: null };
        }
        for (const l of lines) {
          if (maths) {
            if (isHeadLine(l)) inNotes = false;
            else if (!inNotes && l.base > bodyTop + 0.002 && (/^(\(\w\)\s*)?Notes?\s*(:|$)/i.test(l.text.trim()) || (Math.min(...l.items.map((i) => i.x)) < qx - 0.002 && !(stats ? statsLabel : /^\d{1,2}\s*\.?\s*(\(|$)/).test([...l.items].sort((p, q) => p.x - q.x)[0].str.trim())))) inNotes = true;
            if (inNotes) continue;
          }
          // rows printed above the page's header (a continued row, or a NEW part's row when the header sits further down
          // the page, e.g. above Q7) can start a part too
          const inPre = !!pre && l.top >= pre.y0 - 0.002 && l.base <= pre.y1 + 0.002;
          if (l.base <= bodyTop + 0.002 && !inPre) continue;
          if (/^\(?Total\s*for\s*Question/i.test(l.text.replace(/\s+/g, ''))) {
            events.push({ page: n, kind: 'total', top: l.top });
            continue;
          }
          // statistics ("Qu" header): the scheme text can start inside the strip right of "Qu": only label-like items count
          // (a BARE number counts only when it starts near the "Qu" word: the scheme column begins inside the strip, so formula
          // digits such as the "2" of "2×15×0.4" at x 0.146 would read as question 2 when the labels sit at x 0.09)
          let cell = l.items.filter((i) => i.x >= Math.max(tx0 - 0.005, colMin) && i.x < colX && (!(maths && stats) || (/^[\d.\s()a-hivx]{1,12}$/.test(i.str.trim()) && !(/^\d{1,2}\.?$/.test(i.str.trim()) && i.x >= colX - 0.06 + 0.035))));
          // (statistics: the label is the leftmost piece and the pieces touching it: "(f)" then "0.827" of the scheme 0.035
          // further right is not part of it)
          if (maths && stats && cell.length > 1) {
            const s = [...cell].sort((a, b) => a.x - b.x);
            let k = 1;
            while (k < s.length && s[k].x - (s[k - 1].x + s[k - 1].w) < 0.01) k++;
            cell = s.slice(0, k);
          }
          if (!cell.length) continue;
          // "4a" / a bare "b" (no brackets) as printed in some maths mark schemes
          const joined = cell.map((i) => i.str).join('').replace(/\s+/g, '');
          // (statistics: "5." alone on a line names the question for the "(a)(i)" under it)
          const cellText = maths ? joined.replace(/,.*$/, '').replace(stats ? /^(\d{1,2})\.$/ : /(?!)/, '$1').replace(/^(\d{1,2})\.\(/, '$1(').replace(/^(\d{1,2})([a-h])$/, '$1($2)').replace(/^([a-h])$/, '($1)') : joined;
          let k = parseNumber(cellText);
          // maths mark schemes print the first part as "3(a)" and later parts only as "(b)", "(ii)" or "(b)(i)":
          // they belong to the question (and letter) above
          if (!k && cur && maths) {
            const lr = /^\(([a-z])\)(?:\(([ivx]+)\))?$/i.exec(cellText);
            const ro = /^\(([ivx]+)\)$/i.exec(cellText);
            // roman-first ("7(i)(a)"): "(ii)(a)" in one cell, or a bare "(b)" under the current numeral
            const rl = /^\(([ivx]+)\)\(([a-h])\)$/i.exec(cellText);
            if (rl) k = { q: cur.q, l: rl[2].toLowerCase(), r: rl[1].toLowerCase() };
            else if (lr && !lr[2] && cur.r && !partByKey.has(partKey(cur.q, lr[1].toLowerCase(), null)) && partByKey.has(partKey(cur.q, lr[1].toLowerCase(), cur.r))) k = { q: cur.q, l: lr[1].toLowerCase(), r: cur.r };
            else if (ro && partByKey.has(partKey(cur.q, cur.l, ro[1].toLowerCase()))) k = { q: cur.q, l: cur.l, r: ro[1].toLowerCase() };
            // "2(i)" then "(ii)": a question whose parts are numbered (i), (ii) with no letter
            else if (ro && partByKey.has(partKey(cur.q, ro[1].toLowerCase(), null))) k = { q: cur.q, l: ro[1].toLowerCase(), r: null };
            else if (lr) k = { q: cur.q, l: lr[1].toLowerCase(), r: lr[2]?.toLowerCase() ?? null };
          }
          // maths: a bare number ("9") is a stray formula digit when question 9 has lettered parts (its label is "9(a)")
          // (it still names the question for an "(a)" printed on the next line: "1" over "(a)")
          if (maths && k && !k.l && !k.r && !partByKey.has(partKey(k.q, null, null)) && parts.some((p) => parseNumber(p.number)?.q === k!.q && (parseNumber(p.number)?.l || parseNumber(p.number)?.r))) {
            if (Number(k.q) > Number(cur?.q ?? 0)) cur = { q: k.q, l: null };
            k = null;
          }
          // maths: "(c)" when the paper splits (c)(i)/(c)(ii) but the mark scheme does not: the first of them (the rest share it)
          const part = k && (findPart(k) ?? (maths && k.l && !k.r ? parts.find((p) => { const x = parseNumber(p.number); return x?.q === k!.q && x.l === k!.l; }) : undefined));
          if (!part) continue;
          if (maths && (order.get(part.id) ?? 0) <= lastIdx) continue;
          lastIdx = Math.max(lastIdx, order.get(part.id) ?? 0);
          cur = { q: k!.q, l: k!.l, r: k!.r };
          const cx0 = Math.min(...cell.map((i) => i.x));
          const cx1 = Math.max(...cell.map((i) => i.x + i.w));
          events.push({ page: n, kind: 'start', top: l.top, part, numberBox: { page: n, x0: cx0 - 0.003, y0: l.top - 0.003, x1: cx1 + 0.003, y1: l.base + 0.004 } });
        }
      }

      // each part: from the rule above its number to the rule above the next part (or the table's end), over pages
      const plans = new Map<number, Plan>();
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (e.kind !== 'start') continue;
        const prev = events.slice(0, i).reverse().find((x) => x.kind === 'start');
        if (prev && prev.part!.id === e.part!.id) continue;
        let j = i + 1;
        while (j < events.length && events[j].kind === 'start' && events[j].part!.id === e.part!.id) j++;
        const end = events[j] ?? null;
        const crops: Plan['crops'] = [];
        // the paper's last part: its rows (maths: and the notes under them) run on over the following table pages
        let lastPage = e.page;
        if (!end && maths) while (tables[lastPage + 1]) lastPage++;
        for (let p = e.page; p <= (end ? end.page : lastPage); p++) {
          const t = tables[p];
          if (!t) continue;
          let y0 = p === e.page ? (t.snapStart(e.top + 0.004) ?? e.top - 0.006) : t.top;
          // ...and the second label of a shared cell starts at its own text, not at the cell's top rule
          if (maths && p === e.page && prev && prev.page === e.page && prev.top < e.top && y0 <= prev.top + 0.002) y0 = t.gapAbove(e.top - 0.002, prev.top + 0.004);
          let y1 = end && p === end.page ? (end.kind === 'total' ? (t.snapUp(end.top) ?? end.top - 0.004) : (t.snapStart(end.top + 0.004) ?? end.top - 0.006)) : t.bottom;
          // two labels in one ruled cell (maths "10(a)(i)" over "(ii)", no rule between): cut just above the next label's text
          if (maths && end && p === end.page && p === e.page && end.kind === 'start' && y1 - y0 <= 0.01 && end.top - y0 > 0.012) y1 = t.gapAbove(end.top - 0.002, y0 + 0.004);
          // never run into the next table's header row
          for (const h of t.heads) if (h > y0 + 0.01 && h < y1) y1 = h;
          // ...including the page's own header when it sits below this part's rows (rows above the header come first)
          if (t.head && t.head.y0 > y0 + 0.01 && t.head.y0 < y1) y1 = round(t.head.y0 - 0.002);
          // on a later page, the rows of this part printed above that page's header come first
          // (but where the NEXT part starts inside that area, those rows are the next part's: stop at its start, or skip them)
          let pre = t.pre;
          if (pre && end && p === end.page) {
            const cut = t.snapStart(end.top + 0.004) ?? end.top - 0.006;
            if (cut < pre.y1) pre = cut - pre.y0 > 0.02 ? { y0: pre.y0, y1: round(cut) } : null;
          }
          if (p > e.page && pre) crops.push({ page: p, box: { x0: t.x0, y0: pre.y0, x1: t.x1, y1: pre.y1 } });
          if (y1 - y0 > 0.01) crops.push({ page: p, box: { x0: t.x0, y0: round(y0), x1: t.x1, y1: round(y1 + 0.0012) } });
        }
        if (!crops.length) continue;
        let hp = crops[0].page;
        while (hp > 0 && !tables[hp]?.head) hp--;
        const t = tables[hp];
        plans.set(e.part!.id, {
          crops,
          head: t?.head ? { page: hp, box: { x0: t.x0, y0: t.head.y0, x1: t.x1, y1: round(t.head.y1 + 0.0012) } } : null,
          erase: e.numberBox ?? null,
          eraseMore: events.slice(i + 1, j).flatMap((x) => (x.kind === 'start' && x.numberBox ? [x.numberBox] : [])),
        });
      }
      // maths: parts the mark scheme does not split ((c)(i), (c)(ii) under one "(c)") share that part's crop
      if (maths)
        for (const p of parts) {
          if (plans.has(p.id)) continue;
          const x = parseNumber(p.number);
          const sib = x?.l ? parts.find((o) => o.id !== p.id && plans.has(o.id) && parseNumber(o.number)?.q === x.q && parseNumber(o.number)?.l === x.l) : undefined;
          if (sib) plans.set(p.id, { ...plans.get(sib.id)!, erase: null, eraseMore: [] });
        }
      return plans;
    } finally {
      await close();
    }
  }

  /** The printed number inside a hand-drawn box (to white it out): question number in the margin / MS first column. */
  private async numberInside(pdfBuf: Buffer, r: { page: number; box: Box }, number: string, source: Source, exact = false): Promise<Rect | null> {
    const { doc, close } = await openPdf(pdfBuf);
    try {
      const items = await viewportItems(doc, r.page);
      const want = parseNumber(number);
      const base = number.replace(/\s*\(.*$/, '').trim();
      const inBox = items.filter((i) => i.x >= r.box.x0 - 0.01 && i.x < r.box.x0 + 0.09 && i.top >= r.box.y0 - 0.01 && i.top < r.box.y0 + 0.06);
      // the item right after `i` on the same line (the number is often printed as "7" then "(a)", or "2" then ".")
      const nextOf = (i: Item) =>
        items.filter((o) => o !== i && Math.abs(o.base - i.base) < 0.008 && o.x >= i.x + i.w * 0.5 && o.x < i.x + i.w + 0.03).sort((a, b) => a.x - b.x)[0];
      const rectOf = (i: Item, withNext?: Item) => {
        // stop before the neighbouring item: the item's width can run into the "(" of "(a)"
        const n = withNext ? null : nextOf(i);
        const x1 = withNext ? withNext.x + withNext.w + 0.002 : n ? Math.min(i.x + i.w, n.x - 0.0005) : i.x + i.w + 0.003;
        return { page: r.page, x0: i.x - 0.004, y0: i.top - 0.004, x1, y1: i.base + 0.004 };
      };
      if (source === 'QP') {
        const hit = inBox.find((i) => i.str.replace(/^\*/, '').replace(/\.$/, '') === base); // "1." as maths papers print it
        return hit ? { ...rectOf(hit), t: hit.str.trim() } : null;
      }
      for (const i of inBox) {
        const k = parseNumber(i.str);
        if (!k || !want || k.q !== want.q) continue;
        const n = nextOf(i);
        const dot = n && /^\.$/.test(n.str.trim());
        const letter = n ? parseNumber(i.str + n.str.replace(/\s+/g, '')) : null; // "7" + "(a)"
        const whole = k.l === want.l && (k.r === want.r || !want.r);
        const split = !!letter && letter.l === want.l && (letter.r === want.r || !want.r);
        if (exact && !whole && !split && !dot) continue;
        if (!exact && !whole && !split && !dot && k.l !== null) continue;
        // digits and a dot are one printed number ("2" "."); a letter after the digits ("(a)") is kept
        const main: Rect = dot ? { ...rectOf(i, n), t: `${i.str.trim()}.` } : { ...rectOf(i), t: i.str.trim() };
        // the same question's other labels further down this box ("5(ii)", "5" + "(b)"): relabelled too
        const more: Rect[] = [];
        for (const o of items) {
          if (o === i || o.x < r.box.x0 - 0.01 || o.x >= r.box.x0 + 0.09 || o.top < i.top + 0.012 || o.top >= r.box.y1) continue;
          const ko = parseNumber(o.str);
          if (!ko || ko.q !== want.q) continue;
          more.push({ ...rectOf(o), t: o.str.trim() });
          if (more.length >= 8) break;
        }
        return more.length ? { ...main, more } : main;
      }
      return null;
    } finally {
      await close();
    }
  }

  /**
   * Mark scheme: every number-like label in the first column of each box ("7", "7(a)", "2.", "(b)", "(ii)") is
   * whited out, whatever form this paper prints it in, and kept as {x, base, text}. The worksheet writes them back at
   * one fixed size, with our question number, so no paper's layout can leave a doubled or oversized number.
   * Mark labels ("M1", "A1") and the scheme text are left alone.
   */
  private async clearMsLabels(pdfBuf: Buffer, plans: Map<number, Plan>, hiRes: Map<number, Buffer>, out: Map<string, MsLabel[]>): Promise<void> {
    const numbers = new Map<number, string>(
      (await this.db('questions').whereIn('id', [...plans.keys()]).select('id', 'number')).map((r: { id: number; number: string }) => [r.id, r.number]),
    );
    const { doc, close } = await openPdf(pdfBuf);
    try {
      const cache = new Map<number, Item[]>();
      for (const [id, plan] of plans) {
        const want = parseNumber(numbers.get(id) ?? '');
        if (!want) continue;
        for (const [k, c] of plan.crops.entries()) {
          if (!hiRes.has(c.page)) continue;
          if (!cache.has(c.page)) cache.set(c.page, await viewportItems(doc, c.page));
          const isLabel = (str: string) => {
            if (str.trim() === '.') return true; // the dot of "2." (kept only next to a number: see below)
            const pn = parseNumber(str);
            if (pn) return pn.q === want.q;
            // "(a)", "(ii)" or a bare lower-case "a" / "ii": a bare capital A-D is an MCQ answer letter ("A is incorrect because"), kept
            const t = str.trim();
            return /^\([a-h]\)$/i.test(t) || /^[a-h]\)?$/.test(t) || /^\((i{1,3}|iv|v|vi{1,3}|ix|x)\)$/i.test(t) || /^(i{1,3}|iv|v|vi{1,3}|ix|x)\)?$/.test(t);
          };
          const cand = cache
            .get(c.page)!
            .filter((i) => i.x >= c.box.x0 - 0.005 && i.x < c.box.x0 + 0.09 && i.top >= c.box.y0 - 0.003 && i.base <= c.box.y1 + 0.003 && isLabel(i.str))
            .sort((a, b) => a.base - b.base || a.x - b.x);
          // pieces of one label on one line ("7" + "(a)") are one label
          const groups: Item[][] = [];
          for (const it of cand) {
            const g = groups[groups.length - 1];
            const last = g?.[g.length - 1];
            if (g && last && Math.abs(it.base - last.base) < 0.008 && it.x - (last.x + last.w) < 0.012) g.push(it);
            else groups.push([it]);
          }
          const labels: MsLabel[] = [];
          for (const g of groups) {
            if (g.every((i) => i.str.trim() === '.')) continue;
            const x0 = Math.min(...g.map((i) => i.x));
            const x1 = Math.max(...g.map((i) => i.x + i.w));
            const top = Math.min(...g.map((i) => i.top));
            const base = Math.max(...g.map((i) => i.base));
            const rect: Rect = { page: c.page, x0: x0 - 0.003, y0: top - 0.003, x1: x1 + 0.002, y1: base + 0.004 };
            const ink = await inkInside(hiRes.get(c.page)!, rect);
            if (!ink) continue;
            hiRes.set(c.page, await whiteOut(hiRes.get(c.page)!, ink.px));
            labels.push({ x: round(ink.num.x), base: round(base), t: g.map((i) => i.str.trim()).join('').replace(/\s+/g, ''), q: g.some((i) => parseNumber(i.str)?.q === want.q) });
          }
          if (labels.length) out.set(`${id}:${k}`, labels);
        }
      }
    } finally {
      await close();
    }
  }

  // ------------------------------------------------------------------ cut and save

  private async saveCrops(slug: string, source: Source, pdfBuf: Buffer, plans: Map<number, Plan>, opts: { keepHead?: boolean; createOnly?: boolean } = {}): Promise<void> {
    const pages = [...new Set([...plans.values()].flatMap((p) => [...p.crops.map((c) => c.page), ...(p.head ? [p.head.page] : [])]))].sort((a, b) => a - b);
    const hiRes = await renderPdfPagesAt(pdfBuf, pages);
    if (!hiRes.size) return;
    const first = await sharp(hiRes.values().next().value!).metadata();
    const landscape = (first.width ?? 0) > (first.height ?? 0);
    const pageMm = landscape ? { pw: 297, ph: 210 } : { pw: 210, ph: 297 };

    // 1. where each part's own number is (its ink, never the table/border lines), then white out every number
    const nums = new Map<string, NonNullable<CropBox['num']>>(); // `${part id}:${crop index}`
    const msLabels = new Map<string, MsLabel[]>(); // `${part id}:${crop index}`
    if (source === 'MS') await this.clearMsLabels(pdfBuf, plans, hiRes, msLabels);
    const conts = new Map<string, Continued>(); // `${part id}:${crop index}`
    if (source === 'QP') await this.snapEdgesToText(pdfBuf, plans);
    const qmarks = new Map<string, Continued>(); // the paper's "Q6" box at the bottom of a page
    if (source === 'QP') await this.clearContinuedHeadings(pdfBuf, plans, hiRes, conts, qmarks);
    for (const [id, plan] of plans) {
      if (source === 'MS') continue; // the mark scheme's labels were all cleared above (fixed size, written by the worksheet)
      const erases: { e: Rect | null; crop: number | null }[] = plan.eraseCrops
        ? [...plan.eraseCrops.map((e, crop) => ({ e, crop })), ...(plan.eraseMore ?? []).map((e) => ({ e, crop: null }))]
        : [plan.erase, ...(plan.eraseMore ?? [])].map((e, k) => ({ e, crop: k === 0 ? 0 : null }));
      for (const { e, crop } of erases) {
        if (!e || !hiRes.has(e.page)) continue;
        const img = hiRes.get(e.page)!;
        const ink = await inkInside(img, e);
        if (!ink) continue;
        let after = await whiteOut(img, ink.px);
        const more: NonNullable<NonNullable<CropBox['num']>['more']> = [];
        for (const m of e.more ?? []) {
          const mi = await inkInside(after, m);
          if (!mi) continue;
          more.push({ x: mi.num.x, y: mi.num.y, h: mi.num.h, t: m.t ?? '' });
          after = await whiteOut(after, mi.px);
        }
        if (crop != null) nums.set(`${id}:${crop}`, { ...ink.num, ...(e.t ? { t: e.t } : {}), ...(more.length ? { more } : {}) });
        hiRes.set(e.page, after);
      }
    }

    // 2. cut each crop (and the mark scheme's header row)
    const stamp = Date.now().toString(36);
    const dir = paperKeys(slug).dir;
    const rows: { question_id: number; kind: 'FULL'; source: Source; page: number; box: string; file_path: string; sort_order: number }[] = [];
    for (const [id, plan] of plans) {
      let headPath: string | undefined;
      if (source === 'MS' && plan.head && hiRes.has(plan.head.page)) {
        headPath = `${dir}/questions/q${id}-mshead-${stamp}.jpg`;
        await this.storage.write(headPath, await cutJpeg(hiRes.get(plan.head.page)!, plan.head.box));
      }
      for (const [k, c] of plan.crops.entries()) {
        const img = hiRes.get(c.page);
        if (!img) continue;
        // the box index is in the name: two boxes of one part on the same page must not overwrite each other
        const key = `${dir}/questions/q${id}-${source === 'QP' ? 'full' : 'ms'}-p${c.page}-${k}-${stamp}.jpg`;
        let box: CropBox = { ...c.box };
        let buf: Buffer;
        if (source === 'QP') {
          const cut = await cutQuestion(img, box);
          buf = cut.buf;
          box = cut.box;
        } else {
          buf = await cutJpeg(img, box);
          box = { ...box, ...pageMm };
          if (k === 0 && headPath) box = { ...box, head: headPath, headH: round(plan.head!.box.y1 - plan.head!.box.y0) };
        }
        if (nums.has(`${id}:${k}`)) box = { ...box, num: nums.get(`${id}:${k}`) };
        if (msLabels.has(`${id}:${k}`)) box = { ...box, labels: msLabels.get(`${id}:${k}`) };
        if (conts.has(`${id}:${k}`)) box = { ...box, cont: conts.get(`${id}:${k}`) };
        if (qmarks.has(`${id}:${k}`)) box = { ...box, qmark: qmarks.get(`${id}:${k}`) };
        await this.storage.write(key, buf);
        rows.push({ question_id: id, kind: 'FULL', source, page: c.page, box: JSON.stringify(box), file_path: key, sort_order: k });
      }
    }
    if (!rows.length) return;

    // Local uploads only insert brand-new crops; never delete or replace files/rows.
    if (opts.createOnly) {
      await this.db.transaction(async (trx) => {
        const existing = await trx('question_images').whereIn('question_id', [...plans.keys()]).where({ kind: 'FULL', source }).first('id');
        if (existing) throw new Error('Local crops cannot replace existing images');
        await trx('question_images').insert(rows);
      });
      return;
    }

    // 3. replace these parts' rows, then remove the old files
    const ids = [...new Set(rows.map((r) => r.question_id))];
    const old: { file_path: string; box: unknown }[] = await this.db('question_images').whereIn('question_id', ids).where({ kind: 'FULL', source }).select('file_path', 'box');
    await this.db.transaction(async (trx) => {
      await trx('question_images').whereIn('question_id', ids).where({ kind: 'FULL', source }).delete();
      await trx('question_images').insert(rows);
    });
    const kept = new Set(rows.flatMap((r) => [r.file_path, (JSON.parse(r.box) as CropBox).head ?? '']));
    for (const o of old) {
      const ob = (typeof o.box === 'string' ? JSON.parse(o.box) : o.box) as CropBox | null;
      for (const f of [o.file_path, opts.keepHead ? undefined : ob?.head]) if (f && !kept.has(f)) await rm(this.storage.absolute(f), { force: true }).catch(() => undefined);
    }
  }
}

// ------------------------------------------------------------------ helpers

const round = (v: number) => +v.toFixed(4);

/** Text items with page-image positions (fractions), for the mark scheme and hand-drawn boxes. */
async function viewportItems(doc: Awaited<ReturnType<typeof openPdf>>['doc'], n: number): Promise<Item[]> {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const out: Item[] = [];
  for (const it of tc.items as { str?: string; transform: number[]; width: number; height: number }[]) {
    if (!it.str?.trim()) continue;
    const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
    const h = it.height / vp.height;
    out.push({ str: it.str.trim(), x: vx / vp.width, w: it.width / vp.width, base: vy / vp.height, top: vy / vp.height - h });
  }
  return out;
}

function linesOf(items: Item[]) {
  const lines: { base: number; top: number; text: string; items: Item[] }[] = [];
  for (const it of [...items].sort((a, b) => a.base - b.base || a.x - b.x)) {
    const l = lines.find((x) => Math.abs(x.base - it.base) < 0.004);
    if (l) l.items.push(it);
    else lines.push({ base: it.base, top: 0, text: '', items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.top = Math.min(...l.items.map((i) => i.top));
    l.text = l.items.map((i) => i.str).join(' ');
  }
  return lines;
}

/** Ruled-line finder on a page image: table rules are thin grey lines (even faint ~245 hairlines). */
async function ruler(img: Buffer) {
  const { data, info } = await sharp(img).greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  return {
    W,
    H,
    ink: (x: number, y: number) => data[y * W + x] < 235,
    /** almost the whole row is non-white AND clearly darker than 2 px above and below (a flat grey fill isn't) */
    rule(y: number, x0: number, x1: number) {
      if (y < 2 || y >= H - 2) return false;
      const a = Math.round(x0 * W) + 3;
      const b = Math.round(x1 * W) - 3;
      if (b <= a) return false;
      const avg = (yy: number) => {
        let s = 0;
        for (let x = a; x < b; x++) s += data[yy * W + x];
        return s / (b - a);
      };
      let n = 0;
      for (let x = a; x < b; x++) if (data[y * W + x] < 252) n++;
      if (n < (b - a) * 0.85) return false;
      return avg(y) < Math.min(avg(y - 2), avg(y + 2)) - 4;
    },
  };
}

/** The printed number's own ink inside a rectangle, ignoring ruled lines that reach into it. */
async function inkInside(img: Buffer, e: Rect) {
  const { width: W = 0, height: H = 0 } = await sharp(img).metadata();
  const region = { left: Math.max(0, Math.floor(e.x0 * W)), top: Math.max(0, Math.floor(e.y0 * H)), width: 0, height: 0 };
  region.width = Math.max(1, Math.min(W - region.left, Math.ceil((e.x1 - e.x0) * W)));
  region.height = Math.max(1, Math.min(H - region.top, Math.ceil((e.y1 - e.y0) * H)));
  const { data, info } = await sharp(img).extract(region).greyscale().raw().toBuffer({ resolveWithObject: true });
  const dk = (x: number, y: number) => data[y * info.width + x] < 160;
  const ruleRow = new Set<number>();
  const ruleCol = new Set<number>();
  for (let y = 0; y < info.height; y++) {
    let d = 0;
    for (let x = 0; x < info.width; x++) if (dk(x, y)) d++;
    if (d > info.width * 0.7) ruleRow.add(y);
  }
  for (let x = 0; x < info.width; x++) {
    let d = 0;
    for (let y = 0; y < info.height; y++) if (dk(x, y)) d++;
    if (d > info.height * 0.7) ruleCol.add(x);
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    if (ruleRow.has(y) || ruleRow.has(y - 1) || ruleRow.has(y + 1)) continue;
    for (let x = 0; x < info.width; x++) {
      if (ruleCol.has(x) || ruleCol.has(x - 1) || ruleCol.has(x + 1)) continue;
      if (data[y * info.width + x] < 128) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 2;
  const left = region.left + Math.max(0, minX - pad);
  const top = region.top + Math.max(0, minY - pad);
  return {
    num: { x: round((region.left + minX) / W), y: round((region.top + minY) / H), h: round((maxY - minY + 1) / H), w: round((maxX - minX + 1) / W) },
    px: { left, top, width: Math.min(W - left, maxX - minX + 1 + 2 * pad), height: Math.min(H - top, maxY - minY + 1 + 2 * pad) },
  };
}

async function whiteOut(img: Buffer, px: { left: number; top: number; width: number; height: number }) {
  const white = await sharp({ create: { width: px.width, height: px.height, channels: 3, background: '#fff' } }).png().toBuffer();
  return sharp(img).composite([{ input: white, left: px.left, top: px.top }]).png().toBuffer();
}

function pxBox(W: number, H: number, box: Box) {
  const left = Math.max(0, Math.floor(box.x0 * W));
  const top = Math.max(0, Math.floor(box.y0 * H));
  return { left, top, width: Math.max(1, Math.min(W, Math.ceil(box.x1 * W)) - left), height: Math.max(1, Math.min(H, Math.ceil(box.y1 * H)) - top) };
}

/** Greyscale JPEG: Chrome puts JPEGs into a PDF as they are (small files). */
async function cutJpeg(img: Buffer, box: Box): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(img).metadata();
  return sharp(img).extract(pxBox(width, height, box)).greyscale().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}

/**
 * A question part's cut: removes the page border line that can fall into the bottom of a part running to the page
 * end, and trims a long empty stretch at the bottom (keeping the part's own answer lines/grids, which are ink).
 */
async function cutQuestion(img: Buffer, box: CropBox): Promise<{ buf: Buffer; box: CropBox }> {
  const { width: W = 0, height: H = 0 } = await sharp(img).metadata();
  const cut = sharp(img).extract(pxBox(W, H, box));
  const { data, info } = await cut.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
  // The paper's own page border is a THICK (about 7 px) grey band across the bottom of a page, with its rounded corners
  // just above it. The writing lines are thin (1-2 px): they must stay, so only a thick band counts.
  const rules: number[] = [];
  for (let y = Math.floor(info.height * 0.85); y < info.height; y++) {
    let dark = 0;
    for (let x = 0; x < info.width; x++) if (data[y * info.width + x] < 235) dark++;
    if (dark > info.width * 0.8) rules.push(y);
  }
  const mmPerPx = 297 / H;
  const edge = Math.round(info.width * 0.02); // the corner of the paper's rounded border can reach into the crop
  const inkRow = (y: number) => {
    if (rules.includes(y)) return false;
    let d = 0;
    for (let x = edge; x < info.width - edge; x++) if (data[y * info.width + x] < 200 && ++d > 2) return true;
    return false;
  };
  const found = findRules(data, info.width, info.height);
  let lastInk = info.height - 1;
  while (lastInk > 0 && !inkRow(lastInk)) lastInk--;
  // The blank space (or ruled lines) after a question is where the student writes: it is kept in full, as printed,
  // down to the next question. (It used to be cut down to 4 mm when more than 12 mm was empty.)
  void lastInk;
  void mmPerPx;
  const keep = info.height;
  const out: CropBox = found ? { ...box, rules: found } : { ...box };
  if (!found) delete out.rules;
  // clear a band only when it is thick (the page border), together with the corner pieces just above it
  const groups: { a: number; b: number }[] = [];
  for (const y of rules) {
    const g = groups[groups.length - 1];
    if (g && y - g.b <= 1) g.b = y;
    else groups.push({ a: y, b: y });
  }
  const white = await Promise.all(
    groups
      // only a band at the foot of the PAGE is the paper's border (it sits at page y ≈ 0.942-0.944): a table's own thick
      // bottom border inside the crop must stay
      .filter((g) => g.b - g.a + 1 >= 4 && box.y0 + (g.a / info.height) * (box.y1 - box.y0) >= 0.93)
      .map(async (g) => {
        const top = Math.max(0, g.a - 14);
        return { input: await sharp({ create: { width: info.width, height: g.b - top + 3, channels: 3, background: '#fff' } }).png().toBuffer(), left: 0, top };
      }),
  );
  // Old papers: a thin header rule sits near the top of a continued page and the foot of the watermark / header words
  // above it is cut off by the crop. Clear the little that lies above that rule.
  const topLimit = Math.floor(info.height * 0.06);
  let headRule = -1;
  for (let y = 2; y < topLimit && headRule < 0; y++) {
    let d = 0;
    for (let x = Math.round(info.width * 0.05); x < info.width * 0.9; x++) if (data[y * info.width + x] < 200) d++;
    if (d > info.width * 0.85 * 0.8) headRule = y;
  }
  // (only a rule that really is near the TOP OF THE PAGE: a table's top border just under a stem line at the top of the
  // crop is not one, and the stem above it must stay)
  if (headRule > 3 && box.y0 + (headRule / info.height) * (box.y1 - box.y0) < 0.085) {
    let ink = false;
    for (let y = 0; y < headRule - 1 && !ink; y++) for (let x = 0; x < info.width; x++) if (data[y * info.width + x] < 200) { ink = true; break; }
    if (ink)
      white.push({
        input: await sharp({ create: { width: info.width, height: headRule - 1, channels: 3, background: '#fff' } }).png().toBuffer(),
        left: 0,
        top: 0,
      });
  }
  const cleaned = await sharp(await cut.png().toBuffer()).composite(white).png().toBuffer();
  const buf = await sharp(cleaned).extract({ left: 0, top: 0, width: info.width, height: keep }).greyscale().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  return { buf, box: out };
}

/**
 * The ruled writing lines of a question: rows that are drawn nearly the whole width of the crop (text rows never are).
 * Returns where the first line is and the distance between lines, as fractions of the crop's height, or null when there
 * are fewer than 3 evenly spaced lines. The worksheet uses it to split a long writing area between two lines.
 */
function findRules(data: Buffer | Uint8Array, width: number, height: number): Rules | null {
  const edge = Math.round(width * 0.04);
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    let d = 0;
    for (let x = edge; x < width - edge; x++) if (data[y * width + x] < 235) d++;
    if (d > (width - 2 * edge) * 0.85) rows.push(y);
  }
  const centres: number[] = [];
  let start = -1;
  let prev = -2;
  for (const y of [...rows, Infinity]) {
    if (y !== prev + 1) {
      if (start >= 0) centres.push((start + prev) / 2);
      start = y;
    }
    prev = y;
  }
  if (centres.length < 3) return null;
  const gaps = centres.slice(1).map((c, i) => c - centres[i]).sort((a, b) => a - b);
  const pitch = gaps[Math.floor(gaps.length / 2)];
  if (pitch < height * 0.008) return null;
  return { from: round(centres[0] / height), pitch: round(pitch / height) };
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

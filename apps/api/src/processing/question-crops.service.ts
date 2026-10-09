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
type Rect = Box & { page: number };
/** A crop box (page fractions) plus extras kept in the DB row's box JSON. */
type CropBox = Box & { num?: { x: number; y: number; h: number; w?: number }; pw?: number; ph?: number; head?: string; headH?: number };
interface Plan {
  crops: { page: number; box: CropBox }[];
  /** the paper's own printed number (whited out; its ink position becomes box.num) */
  erase: Rect | null;
  /** the same number again on later rows/pages ("17 (b)* (continued)"): whited out too */
  eraseMore?: Rect[];
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
  const s = s0.replace(/^\*\s*/, '');
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

  /**
   * Cut (or re-cut) the question-paper and mark-scheme crops of one paper. A part's existing crop is only replaced
   * when the part is found reliably again, so good crops (e.g. drawn by hand) are never lost.
   * `onlyMissing` only fills in parts that have no crop yet.
   */
  async buildForPaper(slug: string, opts: { onlyMissing?: boolean } = {}): Promise<{ parts: number; qp: number; ms: number; notFound: string[] }> {
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

  /** The admin drew a part's crop box(es) by hand: cut exactly those (question paper or mark scheme). */
  async setManual(questionId: number, source: Source, regions: { page: number; box: Box }[]): Promise<void> {
    const q = await this.db('questions as q').join('papers as p', 'p.id', 'q.paper_id').where('q.id', questionId).first('q.id', 'q.number', 'p.slug');
    if (!q) throw new Error('Question not found');
    const keys = paperKeys(q.slug);
    const file = source === 'QP' ? keys.qp : keys.ms;
    if (!this.storage.exists(file)) throw new Error(source === 'QP' ? 'The question paper PDF is missing' : 'This paper has no mark scheme');
    const boxes = regions.map((r) => ({ page: r.page, box: normaliseBox(r.box) })).filter((r): r is { page: number; box: Box } => !!r.box);
    if (!boxes.length) throw new Error('Draw at least one box');
    const pdfBuf = await this.storage.read(file);
    // find the printed number inside the first box, so it is whited out and our own number goes there
    const erase = await this.numberInside(pdfBuf, boxes[0], q.number, source).catch(() => null);
    const plan: Plan = { crops: boxes.map((b) => ({ page: b.page, box: { ...b.box } })), erase };
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
    const parsePart = (n: string) => {
      const m = /^(\d+)\s*(?:\(([a-z])\))?\s*(?:\(([ivx]+)\))?/i.exec(n.replace(/\s+/g, ''));
      return m ? { q: m[1], letter: m[2]?.toLowerCase() ?? null, roman: m[3]?.toLowerCase() ?? null } : null;
    };
    const partByKey = new Map<string, Part>();
    const firstOfQ = new Map<string, Part>();
    for (const p of parts) {
      const k = parsePart(p.number);
      if (!k) continue;
      partByKey.set(partKey(k.q, k.letter, k.roman), p);
      if (!firstOfQ.has(k.q)) firstOfQ.set(k.q, p);
    }

    const { doc, close } = await openPdf(pdfBuf);
    try {
      type Ev = { page: number; y: number; kind: 'start' | 'total'; q?: string | null; part?: Part; numberItem?: (Item & { page: number }) | null };
      const events: Ev[] = [];
      let state: { q: string | null; letter: string | null; roman: string | null } = { q: null, letter: null, roman: null };
      const pageTops: Record<number, number> = {};
      const offsets: Record<number, { dx: number; dy: number }> = {};
      const lefts: Record<number, number[]> = { 0: [], 1: [] };
      const rights: Record<number, number[]> = { 0: [], 1: [] };
      const dots: number[] = [];

      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        // raw PDF positions recognise the labels; the page image can be offset from them (crop box) — that offset
        // is applied only to the final boxes
        const items: Item[] = [];
        for (const it of tc.items as { str?: string; transform: number[]; width: number; height: number }[]) {
          if (!it.str?.trim()) continue;
          const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
          const x = it.transform[4] / vp.width;
          const base = 1 - it.transform[5] / vp.height;
          offsets[n] = { dx: vx / vp.width - x, dy: vy / vp.height - base };
          const top = base - it.height / vp.height;
          if (top > TOP && base < BOTTOM && x < RIGHT) items.push({ str: it.str.trim().replace(/^\*\s*(?=[(\d])/, ''), x, w: it.width / vp.width, base, top });
        }
        if (!items.length) continue;
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
          for (const i of line.items) if (/^\.{20,}$/.test(i.str)) dots.push(i.x + i.w);
          const text = line.items.map((i) => i.str).join(' ');
          const top = Math.min(...line.items.map((i) => i.top));
          if (/^\(Total for Question/i.test(text)) {
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
              numberItem = it;
              lefts[n % 2].push(it.x);
              changed = true;
              continue;
            }
            if (it.x < 0.13 || it.x >= 0.23 || !state.q) break;
            let rest = it.str;
            let any = false;
            for (;;) {
              const lm = /^\(([a-h])\)(?:\s+|$)/.exec(rest);
              if (lm && it.x < 0.2) {
                state = { ...state, letter: lm[1], roman: null };
                rest = rest.slice(lm[0].length);
                any = true;
                continue;
              }
              const rm = /^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)(?:\s+|$)/.exec(rest);
              if (rm) {
                state = { ...state, roman: rm[1] };
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
            (!state.letter ? firstOfQ.get(state.q) : undefined);
          if (!part) continue;
          const last = [...events].reverse().find((e) => e.kind === 'start');
          if (last && last.part!.id === part.id) {
            if (numberItem) last.numberItem ??= { ...numberItem, page: n };
            continue;
          }
          events.push({ page: n, y: top - PAD, kind: 'start', part, numberItem: numberItem ? { ...numberItem, page: n } : null });
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
        x1: dots.length ? Math.max(...dots) + 0.006 : (rights[p % 2].length ? med(rights[p % 2]) : allR.length ? med(allR) : X1 - 0.025) + 0.025,
      });

      const plans = new Map<number, Plan>();
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (e.kind !== 'start') continue;
        const q = parsePart(e.part!.number)?.q;
        const end = events.slice(i + 1).find((x) => x.kind === 'start' || (x.kind === 'total' && x.q === q)) ?? { page: doc.numPages, y: BOTTOM };
        const crops: Plan['crops'] = [];
        for (let p = e.page; p <= end.page; p++) {
          if (!(p in pageTops) && p !== e.page) continue;
          const y0 = p === e.page ? e.y : pageTops[p];
          const y1 = p === end.page ? end.y : BOTTOM;
          const o = offsets[p] ?? { dx: 0, dy: 0 };
          if (y1 - y0 > 0.02) crops.push({ page: p, box: { x0: round(edge(p).x0 + o.dx), y0: round(y0 + o.dy), x1: round(edge(p).x1 + o.dx), y1: round(y1 + o.dy) } });
        }
        if (!crops.length) continue;
        const ni = e.numberItem;
        const o = ni ? (offsets[ni.page] ?? { dx: 0, dy: 0 }) : null;
        plans.set(e.part!.id, {
          crops,
          erase: ni && o ? { page: ni.page, x0: ni.x - 0.004 + o.dx, y0: ni.top - 0.004 + o.dy, x1: ni.x + ni.w + 0.004 + o.dx, y1: ni.base + 0.004 + o.dy } : null,
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
      type Table = { x0: number; x1: number; head: { y0: number; y1: number } | null; top: number; bottom: number; snapUp: (y: number, limit?: number) => number | null };
      type Ev = { page: number; kind: 'start' | 'total'; top: number; part?: Part; numberBox?: Rect };
      const events: Ev[] = [];
      const tables: Record<number, Table> = {};
      let last: { tx0: number; tx1: number; colX: number } | null = null;

      for (let n = 1; n <= doc.numPages; n++) {
        const img = images.get(n);
        if (!img) continue;
        const items = await viewportItems(doc, n);
        const lines = linesOf(items);
        const R = await ruler(img);
        const qLine = lines.find((l) => l.items.some((i) => /^Question$/i.test(i.str)));
        const qItem = qLine?.items.find((i) => /^Question$/i.test(i.str));
        const numLine = qLine && lines.find((l) => l.base > qLine.base && l.base - qLine.base < 0.04 && l.items.some((i) => /^Number$/i.test(i.str)));
        // "Mark" is centred in the header row, often between the "Question" and "Number" lines
        const markItem = numLine && qLine ? items.filter((i) => /^Marks?$/i.test(i.str) && i.base > qLine.top - 0.01 && i.top < numLine.base + 0.01).sort((a, b) => b.x - a.x)[0] : undefined;
        let tx0: number, tx1: number, colX: number;
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
          colX = qItem.x + 0.06;
        } else if (last) {
          ({ tx0, tx1, colX } = last);
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
          const headTop = snapUp(qLine.top + 0.008, 0.04);
          const headBottom = snapDown(numLine.base);
          if (headTop == null || headBottom == null) continue;
          head = { y0: round(headTop), y1: round(headBottom) };
          bodyTop = headBottom;
        } else {
          bodyTop = snapDown(0.03, 0.5); // no header: the table (if any) starts at the first rule on the page
          if (bodyTop == null) continue;
        }
        last = { tx0, tx1, colX };
        let bottom = bodyTop;
        for (let y = Math.round(bodyTop * R.H) + 2; y < R.H * 0.97; y++) if (R.rule(y, tx0, tx1)) bottom = y / R.H;
        tables[n] = { x0: round(tx0), x1: round(tx1), head, top: round(bodyTop), bottom: round(bottom), snapUp };

        for (const l of lines) {
          if (l.base <= bodyTop + 0.002) continue;
          if (/^\(?Total for Question/i.test(l.text)) {
            events.push({ page: n, kind: 'total', top: l.top });
            continue;
          }
          const cell = l.items.filter((i) => i.x >= tx0 - 0.005 && i.x < colX);
          if (!cell.length) continue;
          const k = parseNumber(cell.map((i) => i.str).join(''));
          const part = k && findPart(k);
          if (!part) continue;
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
        for (let p = e.page; p <= (end ? end.page : e.page); p++) {
          const t = tables[p];
          if (!t) continue;
          const y0 = p === e.page ? (t.snapUp(e.top + 0.004) ?? e.top - 0.006) : t.top;
          const y1 = end && p === end.page ? (end.kind === 'total' ? (t.snapUp(end.top) ?? t.bottom) : (t.snapUp(end.top + 0.004) ?? end.top - 0.006)) : t.bottom;
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
      return plans;
    } finally {
      await close();
    }
  }

  /** The printed number inside a hand-drawn box (to white it out): question number in the margin / MS first column. */
  private async numberInside(pdfBuf: Buffer, r: { page: number; box: Box }, number: string, source: Source): Promise<Rect | null> {
    const { doc, close } = await openPdf(pdfBuf);
    try {
      const items = await viewportItems(doc, r.page);
      const want = parseNumber(number);
      const base = number.replace(/\s*\(.*$/, '').trim();
      const inBox = items.filter((i) => i.x >= r.box.x0 - 0.01 && i.x < r.box.x0 + 0.09 && i.top >= r.box.y0 - 0.01 && i.top < r.box.y0 + 0.06);
      const hit =
        source === 'QP'
          ? inBox.find((i) => i.str.replace(/^\*/, '') === base)
          : inBox.find((i) => {
              const k = parseNumber(i.str);
              return !!k && !!want && k.q === want.q;
            });
      return hit ? { page: r.page, x0: hit.x - 0.004, y0: hit.top - 0.004, x1: hit.x + hit.w + 0.004, y1: hit.base + 0.004 } : null;
    } finally {
      await close();
    }
  }

  // ------------------------------------------------------------------ cut and save

  private async saveCrops(slug: string, source: Source, pdfBuf: Buffer, plans: Map<number, Plan>, opts: { keepHead?: boolean } = {}): Promise<void> {
    const pages = [...new Set([...plans.values()].flatMap((p) => [...p.crops.map((c) => c.page), ...(p.head ? [p.head.page] : [])]))].sort((a, b) => a - b);
    const hiRes = await renderPdfPagesAt(pdfBuf, pages);
    if (!hiRes.size) return;
    const first = await sharp(hiRes.values().next().value!).metadata();
    const landscape = (first.width ?? 0) > (first.height ?? 0);
    const pageMm = landscape ? { pw: 297, ph: 210 } : { pw: 210, ph: 297 };

    // 1. where each part's own number is (its ink, never the table/border lines), then white out every number
    const nums = new Map<number, NonNullable<CropBox['num']>>();
    for (const [id, plan] of plans) {
      for (const [k, e] of [plan.erase, ...(plan.eraseMore ?? [])].entries()) {
        if (!e || !hiRes.has(e.page)) continue;
        const img = hiRes.get(e.page)!;
        const ink = await inkInside(img, e);
        if (!ink) continue;
        if (k === 0) nums.set(id, ink.num);
        hiRes.set(e.page, await whiteOut(img, ink.px));
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
        const key = `${dir}/questions/q${id}-${source === 'QP' ? 'full' : 'ms'}-p${c.page}-${stamp}.jpg`;
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
        if (k === 0 && nums.has(id)) box = { ...box, num: nums.get(id) };
        await this.storage.write(key, buf);
        rows.push({ question_id: id, kind: 'FULL', source, page: c.page, box: JSON.stringify(box), file_path: key, sort_order: k });
      }
    }
    if (!rows.length) return;

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
  const rules: number[] = [];
  for (let y = Math.floor(info.height * 0.9); y < info.height; y++) {
    let dark = 0;
    for (let x = 0; x < info.width; x++) if (data[y * info.width + x] < 200) dark++;
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
  let lastInk = info.height - 1;
  while (lastInk > 0 && !inkRow(lastInk)) lastInk--;
  let keep = info.height;
  let out: CropBox = box;
  if ((info.height - 1 - lastInk) * mmPerPx > 12) {
    keep = Math.min(info.height, lastInk + 1 + Math.round(4 / mmPerPx));
    out = { ...box, y1: round(box.y0 + keep / H) };
  }
  const white = rules.length
    ? [{ input: await sharp({ create: { width: info.width, height: rules[rules.length - 1] - rules[0] + 3, channels: 3, background: '#fff' } }).png().toBuffer(), left: 0, top: Math.max(0, rules[0] - 1) }]
    : [];
  const cleaned = await sharp(await cut.png().toBuffer()).composite(white).png().toBuffer();
  const buf = await sharp(cleaned).extract({ left: 0, top: 0, width: info.width, height: keep }).greyscale().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  return { buf, box: out };
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

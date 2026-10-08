import { BadRequestException, Injectable, InternalServerErrorException, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import puppeteer, { type Browser } from 'puppeteer-core';
import type { Env } from '../config/env.js';

export interface PdfQuery {
  ids?: string;
  paper?: string;
  answers?: string;
  title?: string;
  /** 'paper' = past-paper style worksheet (original crops, border, strip); otherwise the normal typed layout */
  style?: string;
}

// no practical limit (same cap as "Select all"); big selections just take longer
const MAX_QUESTIONS = 5000;
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/**
 * Makes PDFs by opening the web app's /print page in headless Chrome, so the PDF looks exactly like
 * the site (same KaTeX maths, same figures). One browser stays open; each PDF gets its own tab.
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly log = new Logger(PdfService.name);
  private browser: Promise<Browser> | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Finished PDFs waiting to be downloaded (token -> file), kept for a few minutes. */
  private readonly ready = new Map<string, { file: Buffer; name: string; expires: number }>();

  /**
   * Make the PDF and keep it under a one-time token; the browser then downloads it with a plain link.
   * (Reading a big PDF into the page's memory fails in Chrome when the disk is nearly full.)
   */
  async prepare(q: PdfQuery, name: string): Promise<string> {
    const file = await this.render(q);
    const now = Date.now();
    for (const [k, v] of this.ready) if (v.expires < now) this.ready.delete(k);
    const token = randomUUID();
    this.ready.set(token, { file, name, expires: now + 10 * 60_000 });
    return token;
  }

  take(token: string): { file: Buffer; name: string } | null {
    const hit = this.ready.get(token);
    if (!hit || hit.expires < Date.now()) return null;
    return hit;
  }

  async render(q: PdfQuery): Promise<Buffer> {
    const params = new URLSearchParams();
    const answers = ['none', 'end', 'inline', 'only'].includes(q.answers ?? '') ? q.answers! : 'none';
    if (q.paper) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(q.paper)) throw new BadRequestException('Invalid paper');
      params.set('paper', q.paper);
    } else {
      const ids = (q.ids ?? '').split(',').filter(Boolean);
      if (ids.length === 0) throw new BadRequestException('Choose at least one question');
      if (ids.length > MAX_QUESTIONS) throw new BadRequestException(`At most ${MAX_QUESTIONS} questions per PDF`);
      if (!ids.every((id) => /^\d{1,10}$/.test(id))) throw new BadRequestException('Invalid question ids');
      params.set('ids', ids.join(','));
    }
    const paperStyle = !q.paper && q.style === 'paper';
    // every selection is a worksheet in the paper's layout
    const worksheet = !q.paper;
    if (paperStyle) params.set('style', 'paper');
    if (q.title) params.set('title', q.title.slice(0, 150));

    // Answers at the end of a worksheet: the answer pages are made as their own document (like the real mark
    // scheme: no page border or "do not write" strip; landscape in the past-paper style) and joined after the
    // questions. (The border and strip repeat on every page of one document, so they can't skip the answers.)
    if (worksheet && (answers === 'end' || answers === 'inline')) {
      const questions = await this.print(q, params, 'none', { worksheet, paperStyle });
      const answerPages = await this.print(q, params, 'only', { worksheet, paperStyle });
      const out = await PDFDocument.create();
      for (const buf of [questions, answerPages]) {
        const doc = await PDFDocument.load(buf);
        for (const p of await out.copyPages(doc, doc.getPageIndices())) out.addPage(p);
      }
      return Buffer.from(await out.save());
    }
    return this.print(q, params, answers, { worksheet, paperStyle });
  }

  /** One pass of Chrome over the /print page. */
  private async print(q: PdfQuery, base: URLSearchParams, answers: string, o: { worksheet: boolean; paperStyle: boolean }): Promise<Buffer> {
    const params = new URLSearchParams(base);
    params.set('answers', answers);
    // answers on their own: the mark scheme's look (no border/strip); landscape in the past-paper style
    const answersOnly = o.worksheet && answers === 'only';
    const landscape = answersOnly && o.paperStyle;
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(`${this.config.get('WEB_ORIGIN', { infer: true })}/print?${params}`, { waitUntil: 'networkidle0', timeout: 120_000 });
      await page.waitForFunction('window.__printReady === true', { timeout: 120_000 });
      const footer = `<div style="width:100%;font-size:8px;color:#666;padding:0 14mm;display:flex;justify-content:space-between;font-family:sans-serif">
        <span>${escapeHtml(q.title ?? '')}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
      const pdf = await page.pdf({
        format: 'A4',
        landscape,
        printBackground: true,
        // question pages draw the paper's border and right-hand hatched strip inside the page, so they need the room
        margin: landscape
          ? { top: '10mm', bottom: '12mm', left: '10mm', right: '10mm' }
          : o.worksheet && !answersOnly
            ? { top: '7mm', bottom: '14mm', left: '10mm', right: '2mm' }
            : { top: '12mm', bottom: '16mm', left: '10mm', right: '10mm' },
        displayHeaderFooter: true,
        // a big worksheet (every question) takes Chrome well over the default 30 s
        timeout: 600_000,
        headerTemplate: '<span></span>',
        footerTemplate: footer,
      });
      return Buffer.from(pdf);
    } catch (e) {
      this.log.error(`PDF failed: ${(e as Error).message}`);
      throw new InternalServerErrorException('Could not create the PDF');
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const executablePath = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
      if (!executablePath) throw new InternalServerErrorException('Chrome not found on the server (set CHROME_PATH)');
      this.browser = puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }).then((b) => {
        b.on('disconnected', () => (this.browser = null));
        return b;
      });
      this.browser.catch(() => (this.browser = null));
    }
    return this.browser;
  }

  async onModuleDestroy() {
    if (this.browser) await (await this.browser).close().catch(() => undefined);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

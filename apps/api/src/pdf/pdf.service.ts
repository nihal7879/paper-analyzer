import { BadRequestException, Injectable, InternalServerErrorException, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import puppeteer, { type Browser } from 'puppeteer-core';
import type { Env } from '../config/env.js';

export interface PdfQuery {
  ids?: string;
  paper?: string;
  answers?: string;
  title?: string;
}

const MAX_QUESTIONS = 400;
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

  async render(q: PdfQuery): Promise<Buffer> {
    const params = new URLSearchParams();
    const answers = ['none', 'end', 'inline'].includes(q.answers ?? '') ? q.answers! : 'none';
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
    params.set('answers', answers);
    if (q.title) params.set('title', q.title.slice(0, 150));

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.goto(`${this.config.get('WEB_ORIGIN', { infer: true })}/print?${params}`, { waitUntil: 'networkidle0', timeout: 45_000 });
      await page.waitForFunction('window.__printReady === true', { timeout: 45_000 });
      const footer = `<div style="width:100%;font-size:8px;color:#666;padding:0 14mm;display:flex;justify-content:space-between;font-family:sans-serif">
        <span>${escapeHtml(q.title ?? '')}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '12mm', bottom: '16mm', left: '10mm', right: '10mm' },
        displayHeaderFooter: true,
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

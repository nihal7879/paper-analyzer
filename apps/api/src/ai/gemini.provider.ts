import { Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  type ExtractionProvider,
  type MarkSchemePage,
  type PageContext,
  type PageExtraction,
  type PaperDetails,
  markSchemeSchema,
  pageExtractionSchema,
  paperDetailsSchema,
} from './ai.types.js';
import { coverPagePrompt, markSchemePagePrompt, questionPagePrompt } from './prompts.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { code: number; message: string; status: string };
}

/** Google Gemini via the REST API (no SDK needed). Same contract as the OpenAI provider. */
export class GeminiExtractionProvider implements ExtractionProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiExtractionProvider.name);
  private nextSlot = 0;
  /** Models whose daily quota is used up (until the API restarts / next day). */
  private readonly exhausted = new Set<string>();

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    /** 0 = no limit. Free keys allow about 5 per minute. */
    private readonly requestsPerMinute = 0,
    /** Tried in order when the main model is overloaded (503) or its daily quota is used up (429). */
    private readonly fallbackModels: string[] = [],
  ) {}

  extractQuestionPage(ctx: PageContext): Promise<PageExtraction> {
    return this.call([ctx.image], `page ${ctx.pageNumber}`, questionPagePrompt(ctx), pageExtractionSchema);
  }

  extractMarkSchemePage(ctx: PageContext): Promise<MarkSchemePage> {
    const images = [ctx.image, ...(ctx.extraImages ?? [])];
    const label = images.length > 1 ? `mark scheme pages ${ctx.pageNumber}-${ctx.pageNumber + images.length - 1}` : `mark scheme page ${ctx.pageNumber}`;
    return this.call(images, label, markSchemePagePrompt(ctx), markSchemeSchema);
  }

  detectPaperDetails(image: Buffer, fileName: string): Promise<PaperDetails> {
    return this.call([image], 'cover page', coverPagePrompt(fileName), paperDetailsSchema);
  }

  private async call<S extends z.ZodType>(images: Buffer[], label: string, prompt: string, schema: S): Promise<z.infer<S>> {
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, ...images.map((img) => ({ inline_data: { mime_type: 'image/png', data: img.toString('base64') } }))],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        // Constrains the reply to our JSON shape; we still validate below.
        responseJsonSchema: z.toJSONSchema(schema, { target: 'draft-7' }),
        temperature: 0.1,
      },
    };

    const json = await this.post(body);
    const candidate = json.candidates?.[0];
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) throw new Error(`Gemini returned no output for ${label} (${candidate?.finishReason ?? 'no candidate'})`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Gemini returned invalid JSON for ${label}`);
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Gemini output for ${label} did not match the expected format: ${result.error.issues[0]?.message}`);
    }
    this.logger.debug(`${label}: ${json.usageMetadata?.promptTokenCount ?? '?'} in / ${json.usageMetadata?.candidatesTokenCount ?? '?'} out tokens`);
    return result.data;
  }

  /** First model (main, then fallbacks) whose daily quota isn't used up. */
  private currentModel(): string | undefined {
    return [this.model, ...this.fallbackModels].find((m) => !this.exhausted.has(m));
  }

  /**
   * POST with retries. 429 waits as long as Google asks ("retry in 48s"); 5xx / "high demand" backs off
   * 5s, 10s, 20s, 40s, 60s. A model that stays overloaded or runs out of daily quota hands over to the next fallback.
   */
  private async post(body: unknown, attempt = 1, model = this.currentModel()): Promise<GeminiResponse> {
    if (!model) throw new Error('Gemini API error 429: daily quota used up on all configured models. Try again tomorrow or use a paid key.');
    await this.throttle();
    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (err) {
      // Network drop / timeout: treat like a temporary server error.
      res = new Response(JSON.stringify({ error: { code: 503, message: (err as Error).message, status: 'NETWORK' } }), { status: 503 });
    }
    const json = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (res.ok) return json;

    const asked = res.status === 429 ? retryDelayMs(json) : null;
    // Daily quota (Google asks to wait hours): mark this model used up and move to the next one now.
    if (res.status === 429 && asked !== null && asked > MAX_RETRY_WAIT_MS) {
      this.exhausted.add(model);
      const next = this.currentModel();
      this.logger.warn(`Gemini ${model}: daily quota used up${next ? `, switching to ${next}` : ''}`);
      if (next) return this.post(body, 1, next);
      throw new Error(`Gemini API error 429: ${json.error?.message ?? 'daily quota used up'}`);
    }

    if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
      const wait = (asked ?? Math.min(60_000, 5_000 * 2 ** (attempt - 1))) + 1000;
      this.logger.warn(`Gemini ${model} ${res.status}, retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS - 1})`);
      await new Promise((r) => setTimeout(r, wait));
      return this.post(body, attempt + 1, model);
    }

    // Still overloaded after all retries: try the next model once (without marking this one used up).
    const chain = [this.model, ...this.fallbackModels];
    const next = chain.slice(chain.indexOf(model) + 1).find((m) => !this.exhausted.has(m));
    if (res.status >= 500 && next) {
      this.logger.warn(`Gemini ${model} still unavailable (${res.status}); trying ${next}`);
      return this.post(body, MAX_ATTEMPTS - 2, next);
    }
    throw new Error(`Gemini API error ${res.status}: ${json.error?.message ?? res.statusText}`);
  }

  /** Spaces requests out so a requests-per-minute limit (e.g. 5 on free keys) is never hit. */
  private async throttle(): Promise<void> {
    if (!this.requestsPerMinute) return;
    const gap = 60_000 / this.requestsPerMinute;
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + gap;
    if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  }
}

const MAX_ATTEMPTS = 6;
const MAX_RETRY_WAIT_MS = 90_000;

/** Google says how long to wait in error.details[].retryDelay ("48s") and in the message ("retry in 48.06s"). */
function retryDelayMs(json: GeminiResponse): number | null {
  const details = (json.error as { details?: { retryDelay?: string }[] } | undefined)?.details ?? [];
  const fromDetails = details.map((d) => d.retryDelay).find(Boolean);
  const match = /([\d.]+)s/.exec(fromDetails ?? '') ?? /retry in ([\d.]+)s/i.exec(json.error?.message ?? '');
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

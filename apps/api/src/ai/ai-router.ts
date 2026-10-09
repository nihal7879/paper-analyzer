import { Logger } from '@nestjs/common';
import type { ExtractionProvider, MarkSchemePage, PageContext, PageExtraction, PaperDetails, QuestionBoxes } from './ai.types.js';
import { ClaudeExtractionProvider } from './claude.provider.js';
import { GeminiExtractionProvider } from './gemini.provider.js';
import { MockExtractionProvider } from './mock.provider.js';
import { OpenAiExtractionProvider } from './openai.provider.js';

export type AiProviderId = 'mock' | 'openai' | 'gemini' | 'claude';

export interface ProviderUsage {
  requests: number;
  failures: number;
  lastUsedAt: string | null;
  lastError: string | null;
}

/**
 * The one AI the app uses for every request (upload reading, re-process, regenerate, worksheet-crop fallback):
 * whichever AI_PROVIDER is set to right now, with that provider's key and model. Settings can change these at
 * runtime (written to .env and process.env); the next request uses the new choice — no restart.
 * Also counts requests per provider since the server started, so the admin can see which AI is being hit.
 */
export class AiRouter implements ExtractionProvider {
  private readonly logger = new Logger(AiRouter.name);
  private cached: { signature: string; provider: ExtractionProvider } | null = null;
  readonly usage: Record<AiProviderId, ProviderUsage> = {
    mock: emptyUsage(),
    openai: emptyUsage(),
    gemini: emptyUsage(),
    claude: emptyUsage(),
  };

  get name(): string {
    return this.current().name;
  }

  get model(): string {
    return this.current().model;
  }

  /** The provider for the current settings (rebuilt only when the provider, key or model changes). */
  current(): ExtractionProvider {
    const env = process.env;
    const id = (env.AI_PROVIDER ?? 'mock') as AiProviderId;
    const signature = [id, env.GEMINI_API_KEY, env.GEMINI_MODEL, env.GEMINI_RPM, env.GEMINI_FALLBACK_MODELS, env.OPENAI_API_KEY, env.OPENAI_MODEL, env.ANTHROPIC_API_KEY, env.CLAUDE_MODEL].join('\u0000');
    if (this.cached?.signature === signature) return this.cached.provider;
    let provider: ExtractionProvider;
    if (id === 'gemini' && env.GEMINI_API_KEY) {
      const fallbacks = (env.GEMINI_FALLBACK_MODELS ?? '').split(',').map((m) => m.trim()).filter(Boolean);
      provider = new GeminiExtractionProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || 'gemini-flash-latest', Number(env.GEMINI_RPM ?? 0) || 0, fallbacks);
    } else if (id === 'openai' && env.OPENAI_API_KEY && env.OPENAI_MODEL) {
      provider = new OpenAiExtractionProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
    } else if (id === 'claude' && env.ANTHROPIC_API_KEY) {
      provider = new ClaudeExtractionProvider(env.ANTHROPIC_API_KEY, env.CLAUDE_MODEL || 'claude-opus-5-5');
    } else {
      if (id !== 'mock') this.logger.warn(`AI provider "${id}" has no key/model set: using sample data (mock)`);
      provider = new MockExtractionProvider();
    }
    this.cached = { signature, provider };
    return provider;
  }

  extractQuestionPage(ctx: PageContext): Promise<PageExtraction> {
    return this.track((p) => p.extractQuestionPage(ctx));
  }

  extractMarkSchemePage(ctx: PageContext): Promise<MarkSchemePage> {
    return this.track((p) => p.extractMarkSchemePage(ctx));
  }

  findQuestionBoxes(image: Buffer, pageNumber: number, parts: string[]): Promise<QuestionBoxes> {
    return this.track((p) => p.findQuestionBoxes(image, pageNumber, parts));
  }

  detectPaperDetails(image: Buffer, fileName: string): Promise<PaperDetails> {
    return this.track((p) => p.detectPaperDetails(image, fileName));
  }

  private async track<T>(run: (p: ExtractionProvider) => Promise<T>): Promise<T> {
    const provider = this.current();
    const u = this.usage[(provider.name as AiProviderId) in this.usage ? (provider.name as AiProviderId) : 'mock'];
    u.requests++;
    u.lastUsedAt = new Date().toISOString();
    try {
      return await run(provider);
    } catch (err) {
      u.failures++;
      u.lastError = (err as Error).message.slice(0, 300);
      throw err;
    }
  }
}

function emptyUsage(): ProviderUsage {
  return { requests: 0, failures: 0, lastUsedAt: null, lastError: null };
}

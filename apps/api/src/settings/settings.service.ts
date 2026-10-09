import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AiRouter, type AiProviderId } from '../ai/ai-router.js';

/** Which .env variables hold each provider's key and model. */
const PROVIDERS: Record<Exclude<AiProviderId, 'mock'>, { label: string; keyVar: string; modelVar: string; defaultModel: string }> = {
  claude: { label: 'Claude (Anthropic)', keyVar: 'ANTHROPIC_API_KEY', modelVar: 'CLAUDE_MODEL', defaultModel: 'claude-opus-5-5' },
  openai: { label: 'ChatGPT (OpenAI)', keyVar: 'OPENAI_API_KEY', modelVar: 'OPENAI_MODEL', defaultModel: 'gpt-5.5' },
  gemini: { label: 'Gemini (Google)', keyVar: 'GEMINI_API_KEY', modelVar: 'GEMINI_MODEL', defaultModel: 'gemini-flash-latest' },
};

const updateSchema = z.object({
  provider: z.enum(['mock', 'openai', 'gemini', 'claude']).optional(),
  // each provider is optional: saving just one key (or model) is the normal case
  keys: z.object({ claude: z.string().trim().max(400), openai: z.string().trim().max(400), gemini: z.string().trim().max(400) }).partial().optional(),
  models: z.object({ claude: z.string().trim().max(120), openai: z.string().trim().max(120), gemini: z.string().trim().max(120) }).partial().optional(),
});

/**
 * Admin "AI settings": which AI the app uses and each provider's key and model.
 * Keys are written only to the server's .env file (never the database) and are never sent back in full.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly envFile = resolve(process.cwd(), '.env');

  constructor(private readonly router: AiRouter) {}

  status() {
    const env = process.env;
    const active = (env.AI_PROVIDER ?? 'mock') as AiProviderId;
    return {
      active,
      // the provider actually answering requests (falls back to sample data when the selected one has no key)
      inUse: { name: this.router.name, model: this.router.model },
      providers: Object.entries(PROVIDERS).map(([id, p]) => ({
        id,
        label: p.label,
        keySet: !!env[p.keyVar],
        keyMasked: mask(env[p.keyVar]),
        model: env[p.modelVar] || p.defaultModel,
        usage: this.router.usage[id as AiProviderId],
      })),
      mockUsage: this.router.usage.mock,
    };
  }

  async update(raw: unknown) {
    const parsed = updateSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    const { provider, keys = {}, models = {} } = parsed.data;
    const changes: Record<string, string> = {};
    for (const [id, key] of Object.entries(keys) as [keyof typeof PROVIDERS, string | undefined][]) {
      if (!key) continue;
      const problem = keyProblem(id, key);
      if (problem) throw new BadRequestException(problem);
      changes[PROVIDERS[id].keyVar] = key;
    }
    for (const [id, model] of Object.entries(models) as [keyof typeof PROVIDERS, string | undefined][]) if (model) changes[PROVIDERS[id].modelVar] = model;
    if (provider) {
      if (provider !== 'mock') {
        const p = PROVIDERS[provider];
        if (!changes[p.keyVar] && !process.env[p.keyVar]) throw new BadRequestException(`Add the ${p.label} API key before choosing it`);
        if (!changes[p.modelVar] && !process.env[p.modelVar]) changes[p.modelVar] = p.defaultModel;
      }
      changes.AI_PROVIDER = provider;
    }
    if (!Object.keys(changes).length) return this.status();

    await this.writeEnv(changes);
    for (const [k, v] of Object.entries(changes)) process.env[k] = v;
    this.logger.log(`AI settings changed: ${Object.keys(changes).map((k) => (k.endsWith('_KEY') ? `${k}=***` : `${k}=${changes[k]}`)).join(', ')}`);
    return this.status();
  }

  /** Check a provider's saved key with a free call (lists models; no tokens used). */
  async testKey(raw: unknown) {
    const parsed = z.object({ provider: z.enum(['claude', 'openai', 'gemini']) }).safeParse(raw);
    if (!parsed.success) throw new BadRequestException('Choose claude, openai or gemini');
    const id = parsed.data.provider;
    const key = process.env[PROVIDERS[id].keyVar];
    if (!key) return { ok: false, message: `No ${PROVIDERS[id].label} key saved yet` };
    const model = process.env[PROVIDERS[id].modelVar] || PROVIDERS[id].defaultModel;
    try {
      let models: string[] = [];
      if (id === 'claude') {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        const page = await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 20_000 }).models.list({ limit: 100 });
        models = page.data.map((m) => m.id);
      } else if (id === 'openai') {
        const { default: OpenAI } = await import('openai');
        const page = await new OpenAI({ apiKey: key, maxRetries: 0, timeout: 20_000 }).models.list();
        models = page.data.map((m) => m.id);
      } else {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`);
        const body = (await r.json()) as { models?: { name: string }[]; error?: { message?: string } };
        if (!r.ok) throw new Error(body.error?.message ?? `HTTP ${r.status}`);
        models = (body.models ?? []).map((m) => m.name.replace(/^models\//, ''));
      }
      const hasModel = models.some((m) => m === model || m.startsWith(model));
      return {
        ok: true,
        message: hasModel ? `Key works · model ${model} is available` : `Key works, but the model "${model}" was not in the list — check the model name`,
        modelAvailable: hasModel,
      };
    } catch (err) {
      return { ok: false, message: `Key not accepted: ${(err as Error).message.slice(0, 300)}` };
    }
  }

  /** Update (or add) lines in apps/api/.env, keeping everything else (comments, order) as it is. */
  private async writeEnv(changes: Record<string, string>) {
    let text = '';
    try {
      text = await readFile(this.envFile, 'utf8');
    } catch {
      /* no .env yet */
    }
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.length ? text.split(/\r?\n/) : [];
    const pending = new Map(Object.entries(changes));
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*([A-Z0-9_]+)\s*=/.exec(lines[i]);
      if (m && pending.has(m[1])) {
        lines[i] = `${m[1]}=${quote(pending.get(m[1])!)}`;
        pending.delete(m[1]);
      }
    }
    if (pending.size) {
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      lines.push('# AI settings (set from the admin Settings page)');
      for (const [k, v] of pending) lines.push(`${k}=${quote(v)}`);
      lines.push('');
    }
    await writeFile(this.envFile, lines.join(eol), 'utf8');
  }
}

/** Catch pasting the wrong thing (an error message, a sentence, a key from another AI) before it is saved. */
function keyProblem(id: 'claude' | 'openai' | 'gemini', key: string): string | null {
  if (/\s/.test(key)) return `That ${PROVIDERS[id].label} key contains spaces: paste only the key itself`;
  if (id === 'claude' && !key.startsWith('sk-ant-')) return 'A Claude API key starts with "sk-ant-" (create one at console.anthropic.com → API keys)';
  if (id === 'openai' && (!key.startsWith('sk-') || key.startsWith('sk-ant-'))) return 'A ChatGPT (OpenAI) API key starts with "sk-" (create one at platform.openai.com → API keys)';
  if (key.length < 20) return `That ${PROVIDERS[id].label} key is too short`;
  return null;
}

function mask(v: string | undefined): string | null {
  if (!v) return null;
  return v.length <= 8 ? '••••' : `${v.slice(0, 4)}…${v.slice(-4)}`;
}

/** .env values with spaces or # need quotes. */
function quote(v: string): string {
  return /[\s#"']/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

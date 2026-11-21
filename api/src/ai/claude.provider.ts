import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { Logger } from '@nestjs/common';
import type { z } from 'zod';
import {
  type ExtractionProvider,
  type MarkSchemePage,
  type PageContext,
  type PageExtraction,
  type PaperDetails,
  type QuestionBoxes,
  markSchemeSchema,
  questionBoxesSchema,
  pageExtractionSchema,
  paperDetailsSchema,
} from './ai.types.js';
import { coverPagePrompt, markSchemePagePrompt, questionBoxesPrompt, questionPagePrompt } from './prompts.js';

/** Claude (Anthropic) reads page images and answers in JSON that matches our zod schemas. */
export class ClaudeExtractionProvider implements ExtractionProvider {
  readonly name = 'claude';
  private readonly client: Anthropic;
  private readonly logger = new Logger(ClaudeExtractionProvider.name);

  constructor(
    apiKey: string,
    readonly model: string = 'claude-opus-5-5',
  ) {
    // The SDK retries 408/409/429/5xx and connection errors with backoff; a page can take a while to read.
    this.client = new Anthropic({ apiKey, maxRetries: 3, timeout: 180_000 });
  }

  extractQuestionPage(ctx: PageContext): Promise<PageExtraction> {
    return this.call(ctx.image, `page ${ctx.pageNumber}`, questionPagePrompt(ctx), pageExtractionSchema);
  }

  extractMarkSchemePage(ctx: PageContext): Promise<MarkSchemePage> {
    return this.call([ctx.image, ...(ctx.extraImages ?? [])], `mark scheme page ${ctx.pageNumber}`, markSchemePagePrompt(ctx), markSchemeSchema);
  }

  detectPaperDetails(image: Buffer, fileName: string): Promise<PaperDetails> {
    return this.call(image, 'cover page', coverPagePrompt(fileName), paperDetailsSchema);
  }

  findQuestionBoxes(image: Buffer, pageNumber: number, parts: string[]): Promise<QuestionBoxes> {
    return this.call(image, `question boxes, page ${pageNumber}`, questionBoxesPrompt(pageNumber, parts), questionBoxesSchema);
  }

  private async call<S extends z.ZodType>(image: Buffer | Buffer[], label: string, prompt: string, schema: S): Promise<z.infer<S>> {
    const images = Array.isArray(image) ? image : [image];
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      // If Claude's safety checks decline a page, Anthropic re-runs it on its recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: zodOutputFormat(schema) },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: img.toString('base64') } })),
            { type: 'text' as const, text: prompt },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') throw new Error(`Claude declined ${label}${response.stop_details?.category ? ` (${response.stop_details.category})` : ''}`);
    if (response.stop_reason === 'max_tokens') throw new Error(`Claude's answer for ${label} was cut off (too long)`);
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new Error(`Claude returned no valid output for ${label}`);
    this.logger.debug(`${label}: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out tokens (${response.model})`);
    return parsed.data as z.infer<S>;
  }
}

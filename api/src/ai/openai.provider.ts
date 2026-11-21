import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
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

export class OpenAiExtractionProvider implements ExtractionProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly logger = new Logger(OpenAiExtractionProvider.name);

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    // The SDK retries rate limits / 5xx with backoff.
    this.client = new OpenAI({ apiKey, maxRetries: 3, timeout: 180_000 });
  }

  extractQuestionPage(ctx: PageContext): Promise<PageExtraction> {
    return this.call(ctx.image, `page ${ctx.pageNumber}`, questionPagePrompt(ctx), pageExtractionSchema, 'page_extraction');
  }

  extractMarkSchemePage(ctx: PageContext): Promise<MarkSchemePage> {
    return this.call([ctx.image, ...(ctx.extraImages ?? [])], `mark scheme page ${ctx.pageNumber}`, markSchemePagePrompt(ctx), markSchemeSchema, 'mark_scheme_page');
  }

  detectPaperDetails(image: Buffer, fileName: string): Promise<PaperDetails> {
    return this.call(image, 'cover page', coverPagePrompt(fileName), paperDetailsSchema, 'paper_details');
  }

  findQuestionBoxes(image: Buffer, pageNumber: number, parts: string[]): Promise<QuestionBoxes> {
    return this.call(image, `question boxes, page ${pageNumber}`, questionBoxesPrompt(pageNumber, parts), questionBoxesSchema, 'question_boxes');
  }

  private async call<S extends z.ZodType>(image: Buffer | Buffer[], label: string, prompt: string, schema: S, name: string): Promise<z.infer<S>> {
    const images = Array.isArray(image) ? image : [image];
    const response = await this.client.responses.parse({
      model: this.model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            ...images.map((img) => ({ type: 'input_image' as const, detail: 'high' as const, image_url: `data:image/png;base64,${img.toString('base64')}` })),
          ],
        },
      ],
      text: { format: zodTextFormat(schema, name) },
    });

    if (!response.output_parsed) {
      throw new Error(`AI returned no parsable output for ${label}`);
    }
    this.logger.debug(`${label}: ${response.usage?.input_tokens ?? '?'} in / ${response.usage?.output_tokens ?? '?'} out tokens`);
    return response.output_parsed as z.infer<S>;
  }
}

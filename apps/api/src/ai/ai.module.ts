import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { EXTRACTION_PROVIDER, type ExtractionProvider } from './ai.types.js';
import { GeminiExtractionProvider } from './gemini.provider.js';
import { MockExtractionProvider } from './mock.provider.js';
import { OpenAiExtractionProvider } from './openai.provider.js';

@Module({
  providers: [
    {
      provide: EXTRACTION_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ExtractionProvider => {
        const provider = config.get('AI_PROVIDER', { infer: true });
        if (provider === 'gemini') {
          return new GeminiExtractionProvider(
            config.get('GEMINI_API_KEY', { infer: true })!,
            config.get('GEMINI_MODEL', { infer: true }),
            config.get('GEMINI_RPM', { infer: true }),
            config.get('GEMINI_FALLBACK_MODELS', { infer: true }),
          );
        }
        if (provider === 'openai') {
          return new OpenAiExtractionProvider(config.get('OPENAI_API_KEY', { infer: true })!, config.get('OPENAI_MODEL', { infer: true })!);
        }
        return new MockExtractionProvider();
      },
    },
  ],
  exports: [EXTRACTION_PROVIDER],
})
export class AiModule {}

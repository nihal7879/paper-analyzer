import { Module } from '@nestjs/common';
import { AiRouter } from './ai-router.js';
import { EXTRACTION_PROVIDER } from './ai.types.js';

/**
 * Every AI request goes through AiRouter: it uses whichever provider is selected right now (AI_PROVIDER with its
 * key and model, changeable from the admin Settings page without a restart) and counts requests per provider.
 */
@Module({
  providers: [{ provide: AiRouter, useFactory: () => new AiRouter() }, { provide: EXTRACTION_PROVIDER, useExisting: AiRouter }],
  exports: [EXTRACTION_PROVIDER, AiRouter],
})
export class AiModule {}

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { CatalogController } from '../catalog/catalog.controller.js';
import { PdfService } from '../pdf/pdf.service.js';
import { JobService } from '../jobs/job.service.js';
import { ProcessingService } from '../processing/processing.service.js';
import { QuestionCropsService } from '../processing/question-crops.service.js';
import { EmbeddingService } from '../similarity/embedding.service.js';
import { SimilarityService } from '../similarity/similarity.service.js';
import { BankSearchService } from './bank-search.service.js';
import { ImportService } from './import.service.js';
import { BankController, PapersController } from './papers.controller.js';
import { PapersRepository } from './papers.repository.js';
import { PapersService } from './papers.service.js';
import { VersionsService } from './versions.service.js';

@Module({
  imports: [AiModule],
  controllers: [PapersController, BankController, CatalogController],
  providers: [BankSearchService, VersionsService, PapersService, PapersRepository, ProcessingService, QuestionCropsService, JobService, ImportService, EmbeddingService, SimilarityService, PdfService],
})
export class PapersModule {}

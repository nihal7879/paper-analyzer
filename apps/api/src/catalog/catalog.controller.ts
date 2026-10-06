import { Controller, Get, Query } from '@nestjs/common';
import { PapersRepository } from '../papers/papers.repository.js';
import { parseCambridgeFilename } from './catalog.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly repo: PapersRepository) {}

  /** Boards / subjects / paper types / syllabus topics / seasons from the database. */
  @Get()
  catalog() {
    return this.repo.catalog();
  }

  @Get('parse-filename')
  parse(@Query('name') name = '') {
    return { parsed: parseCambridgeFilename(name) };
  }
}

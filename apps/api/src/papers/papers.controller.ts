import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AdminGuard } from '../auth/admin.guard.js';
import { PdfService, type PdfQuery } from '../pdf/pdf.service.js';
import { BankSearchService } from './bank-search.service.js';
import { PapersService } from './papers.service.js';

const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** Admin: upload, review, edit, publish. */
@Controller('papers')
@UseGuards(AdminGuard)
export class PapersController {
  constructor(private readonly papers: PapersService) {}

  @Get()
  list() {
    return this.papers.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.papers.get(id);
  }

  /** Read paper details from the file name or (with AI) the cover page, before uploading. */
  @Post('detect')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES } }))
  detect(@UploadedFile() file: Express.Multer.File | undefined) {
    return this.papers.detect(file);
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'qp', maxCount: 1 },
        { name: 'ms', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_PDF_BYTES } },
    ),
  )
  create(@Body() body: Record<string, unknown>, @UploadedFiles() files: { qp?: Express.Multer.File[]; ms?: Express.Multer.File[] }) {
    return this.papers.create(body, files?.qp?.[0], files?.ms?.[0]);
  }

  @Post(':id/reprocess')
  reprocess(@Param('id') id: string) {
    return this.papers.reprocess(id);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string) {
    return this.papers.publish(id);
  }

  /** Bulk: mark every draft question of the paper as verified (after the admin has checked it). */
  @Post(':id/verify-all')
  @HttpCode(200)
  verifyAll(@Param('id') id: string) {
    return this.papers.verifyAll(id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(@Param('id') id: string) {
    return this.papers.unpublish(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.papers.remove(id);
  }

  // ---------------------------------------------------------------- questions

  /** Save editor changes (only the fields sent). `verify: true` also marks it verified. */
  @Patch(':id/questions/:qid')
  updateQuestion(@Param('id') id: string, @Param('qid', ParseIntPipe) qid: number, @Body() body: unknown) {
    return this.papers.updateQuestion(id, qid, body);
  }

  @Post(':id/questions/:qid/verify')
  @HttpCode(200)
  verify(@Param('id') id: string, @Param('qid', ParseIntPipe) qid: number, @Body() body: { verified?: unknown }) {
    return this.papers.setVerified(id, qid, body?.verified !== false);
  }

  @Delete(':id/questions/:qid')
  @HttpCode(204)
  async deleteQuestion(@Param('id') id: string, @Param('qid', ParseIntPipe) qid: number) {
    await this.papers.setDeleted(id, qid, true);
  }

  @Post(':id/questions/:qid/restore')
  @HttpCode(204)
  async restoreQuestion(@Param('id') id: string, @Param('qid', ParseIntPipe) qid: number) {
    await this.papers.setDeleted(id, qid, false);
  }

  @Post(':id/questions/:qid/regenerate')
  regenerate(@Param('id') id: string, @Param('qid', ParseIntPipe) qid: number) {
    return this.papers.regenerate(id, qid);
  }
}

/** Students: published questions only (no login). Filtering, counts, search and paging run on the server. */
@Controller('bank')
export class BankController {
  constructor(
    private readonly papers: PapersService,
    private readonly pdf: PdfService,
    private readonly bankSearch: BankSearchService,
  ) {}

  /** One page of whole questions (?offset=0&limit=20 + the same filters as the website URL). */
  @Get('search')
  search(@Query() q: Record<string, unknown>) {
    const { f, sort, offset, limit } = this.bankSearch.parse(q);
    return this.bankSearch.page(f, sort, offset, limit);
  }

  /** Dropdown options with whole-question counts; ?fix=1 also returns the filters with stale chain choices dropped. */
  @Get('facets')
  facets(@Query() q: Record<string, unknown>) {
    return this.bankSearch.facets(this.bankSearch.parse(q).f, q.fix === '1');
  }

  /** Every part id of the matching questions (Select all). */
  @Get('ids')
  ids(@Query() q: Record<string, unknown>) {
    return this.bankSearch.ids(this.bankSearch.parse(q).f);
  }

  /** Published questions by id (?ids=1,2,3) or a whole paper (?paper=slug). */
  @Get('entries')
  entries(@Query('ids') ids?: string, @Query('paper') paper?: string) {
    return this.bankSearch.entries({ ids: ids ? ids.split(',') : [], paper });
  }

  /** Same, for long id lists (a big PDF selection). */
  @Post('entries')
  @HttpCode(200)
  entriesPost(@Body() body: { ids?: unknown }) {
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    return this.bankSearch.entries({ ids });
  }

  /** PDF of selected questions (?ids=1,2,3) or a whole paper (?paper=slug), with answers none | end | inline. */
  @Get('pdf')
  async pdfFile(@Query() q: PdfQuery, @Res({ passthrough: true }) res: Response) {
    const file = await this.pdf.render(q);
    const name = (q.title || q.paper || 'questions').replace(/[^\w .-]+/g, '').trim().slice(0, 100) || 'questions';
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"` });
    return new StreamableFile(file);
  }

  /** Make the PDF (ids in the body, so any size of selection) and return a token to download it with. */
  @Post('pdf')
  async preparePdf(@Body() body: { ids?: unknown; paper?: string; answers?: string; title?: string; style?: string; fileName?: string }) {
    const ids = Array.isArray(body?.ids) ? body.ids.map(String).join(',') : undefined;
    const q: PdfQuery = { ids, paper: body?.paper, answers: body?.answers, title: body?.title, style: body?.style };
    const name = (body?.fileName || q.title || q.paper || 'questions').replace(/[^\w .-]+/g, '').trim().slice(0, 100) || 'questions';
    return { token: await this.pdf.prepare(q, name) };
  }

  /** The prepared PDF, as a normal file download (the browser saves it straight to disk). */
  @Get('pdf/file/:token')
  pdfDownload(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const hit = this.pdf.take(token);
    if (!hit) throw new NotFoundException('This PDF has expired. Please download it again.');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${hit.name}.pdf"` });
    return new StreamableFile(hit.file);
  }
}

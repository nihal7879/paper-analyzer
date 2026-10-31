import { createHash } from 'node:crypto';
import { z } from 'zod';
import { extractionFileSchema } from './import.service.js';
import { openPdf } from '../processing/pdf-images.js';

const regionSchema = z.object({
  page: z.number().int().min(1).max(500),
  box: z.object({ x0: z.number().min(0).max(1), y0: z.number().min(0).max(1), x1: z.number().min(0).max(1), y1: z.number().min(0).max(1) }).refine(b => b.x1 - b.x0 >= 0.02 && b.y1 - b.y0 >= 0.02, 'Crop must have positive, usable dimensions'),
});
const localQuestionSchema = extractionFileSchema.shape.questions.element.extend({
  localCrops: z.object({ qp: z.array(regionSchema).min(1).max(20), ms: z.array(regionSchema).min(1).max(20) }).optional(),
});

/** Local, externally checked transcription; never invokes an extraction provider. */
export const localExtractionSchema = z.object({
  paper: extractionFileSchema.shape.paper,
  qpSha256: z.string().regex(/^[a-f0-9]{64}$/),
  msSha256: z.string().regex(/^[a-f0-9]{64}$/),
  questions: z.array(localQuestionSchema).min(1).max(1000),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  for (const [i, q] of data.questions.entries()) {
    const number = q.number.replace(/\s+/g, '');
    if (!/^\d{1,3}(\([a-z]{1,4}\))*$/i.test(number) || seen.has(number)) {
      ctx.addIssue({ code: 'custom', path: ['questions', i, 'number'], message: 'Invalid or duplicate question number' });
    }
    seen.add(number);
    if (q.type === 'MCQ' && (q.options.length !== 4 || q.options.map(o => o.label).join('') !== 'ABCD')) {
      ctx.addIssue({ code: 'custom', path: ['questions', i, 'options'], message: 'MCQ requires options A, B, C, D' });
    }
    if (!q.answer || !q.answer.text.trim()) {
      ctx.addIssue({ code: 'custom', path: ['questions', i, 'answer'], message: 'A checked mark-scheme answer is required' });
    }
    if (q.pages?.length && !q.pages.includes(q.page)) {
      ctx.addIssue({ code: 'custom', path: ['questions', i, 'pages'], message: 'Pages must include the starting page' });
    }
    if (q.localCrops) {
      const qpPages = new Set(q.localCrops.qp.map(r => r.page));
      const declared = new Set(q.pages?.length ? q.pages : [q.page]);
      if (qpPages.size !== declared.size || [...declared].some(page => !qpPages.has(page))) {
        ctx.addIssue({ code: 'custom', path: ['questions', i, 'localCrops'], message: 'Question pages and local QP crop pages must agree' });
      }
    }
    for (const d of q.diagrams) {
      if (d.box.x0 < 0 || d.box.y0 < 0 || d.box.x1 > 1 || d.box.y1 > 1 || d.box.x0 >= d.box.x1 || d.box.y0 >= d.box.y1) {
        ctx.addIssue({ code: 'custom', path: ['questions', i, 'diagrams'], message: 'Invalid crop rectangle' });
      }
    }
  }
  if (data.paper.totalMarks && data.questions.reduce((sum, q) => sum + (q.marks ?? 0), 0) !== data.paper.totalMarks) {
    ctx.addIssue({ code: 'custom', path: ['questions'], message: 'Part marks do not equal the paper total' });
  }
});
export type LocalExtraction = z.infer<typeof localExtractionSchema>;

export async function prepareLocalExtraction(raw: string, fields: {
  subjectCode: string; year: number; seasonCode: string; paperCode: string;
  board?: string; curriculum?: string; subjectName?: string; componentName?: string;
}, qp: Buffer, ms: Buffer): Promise<LocalExtraction> {
  const data = localExtractionSchema.parse(JSON.parse(raw));
  const p = data.paper;
  if (p.subjectCode.toUpperCase() !== fields.subjectCode.toUpperCase() || p.year !== fields.year || p.seasonCode !== fields.seasonCode || p.paperCode !== fields.paperCode ||
      (fields.board && p.board !== fields.board) || (fields.curriculum && p.curriculum !== fields.curriculum) ||
      (fields.subjectName && p.subjectName !== fields.subjectName) || (fields.componentName && p.componentName !== fields.componentName)) {
    throw new Error('Local extraction metadata does not match the upload');
  }
  if (createHash('sha256').update(qp).digest('hex') !== data.qpSha256 || createHash('sha256').update(ms).digest('hex') !== data.msSha256) {
    throw new Error('Local extraction PDF fingerprints do not match the upload');
  }
  if (data.questions.some(q => q.localCrops) && data.questions.some(q => !q.localCrops)) throw new Error('Supply local crop regions for every part, or none');
  for (const [source, buffer] of [['QP', qp], ['MS', ms]] as const) {
    const { doc, close } = await openPdf(buffer);
    try {
      for (const q of data.questions) {
        const pages = source === 'QP' ? [q.page, ...(q.pages ?? []), ...q.diagrams.map(d => d.page), ...(q.localCrops?.qp.map(r => r.page) ?? [])] : q.localCrops?.ms.map(r => r.page) ?? [];
        for (const page of pages) {
          if (page > doc.numPages) throw new Error(`Question ${q.number} references missing ${source} page ${page}`);
        }
      }
    } finally { await close(); }
  }
  return data;
}

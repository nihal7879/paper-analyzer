import { createHash } from 'node:crypto';
import { vi } from 'vitest';
const close = vi.hoisted(() => vi.fn());
vi.mock('../processing/pdf-images.js', () => ({ openPdf: vi.fn(async () => ({ doc: { numPages: 3 }, close })) }));
import { localExtractionSchema, prepareLocalExtraction } from './local-extraction.js';
const qp = Buffer.from('%PDF-question');
const ms = Buffer.from('%PDF-answer');
const paper = { board: 'Pearson Edexcel', curriculum: 'Edexcel AS Level', subjectCode: '8PH0', subjectName: 'Physics', paperCode: '02', year: 2019, seasonCode: 's' as const, totalMarks: 1 };
const question = { number: '1', type: 'MCQ' as const, marks: 1, text: 'Which unit?', page: 2,
  options: ['A', 'B', 'C', 'D'].map(label => ({ label, text: label })), answer: { correctOption: 'A', text: 'A' } };
function payload() { return { paper, qpSha256: createHash('sha256').update(qp).digest('hex'), msSha256: createHash('sha256').update(ms).digest('hex'), questions: [question] }; }
describe('local extraction validation', () => {
  it('accepts only the matching PDFs and metadata and closes documents', async () => {
    close.mockClear();
    expect((await prepareLocalExtraction(JSON.stringify(payload()), paper, qp, ms)).questions).toHaveLength(1);
    expect(close).toHaveBeenCalledTimes(2);
  });
  it('rejects another PDF before processing', async () => {
    await expect(prepareLocalExtraction(JSON.stringify(payload()), paper, Buffer.from('%PDF-other'), ms)).rejects.toThrow('fingerprints');
  });
  it('rejects metadata mismatches', async () => {
    await expect(prepareLocalExtraction(JSON.stringify(payload()), { ...paper, year: 2020 }, qp, ms)).rejects.toThrow('metadata');
  });
  it('rejects repeated part numbers even with spacing', () => {
    const data = payload(); data.questions.push({ ...question, number: ' 1 ' });
    expect(localExtractionSchema.safeParse(data).success).toBe(false);
  });
  it('rejects missing answers, missing options and incorrect marks totals', () => {
    expect(localExtractionSchema.safeParse({ ...payload(), questions: [{ ...question, answer: null }] }).success).toBe(false);
    expect(localExtractionSchema.safeParse({ ...payload(), questions: [{ ...question, options: [] }] }).success).toBe(false);
    expect(localExtractionSchema.safeParse({ ...payload(), paper: { ...paper, totalMarks: 80 } }).success).toBe(false);
  });
  it('rejects out-of-range pages and closes the document on error', async () => {
    close.mockClear();
    await expect(prepareLocalExtraction(JSON.stringify({ ...payload(), questions: [{ ...question, page: 4 }] }), paper, qp, ms)).rejects.toThrow('missing QP page');
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('validates explicit offline regions for scanned PDFs and checks MS page bounds', async () => {
    const region = { page: 2, box: { x0: 0.06, y0: 0.1, x1: 0.93, y1: 0.5 } };
    const data = { ...payload(), questions: [{ ...question, localCrops: { qp: [region], ms: [region] } }] };
    expect((await prepareLocalExtraction(JSON.stringify(data), paper, qp, ms)).questions[0].localCrops).toBeDefined();
    data.questions[0].localCrops.ms[0] = { ...region, page: 4 };
    await expect(prepareLocalExtraction(JSON.stringify(data), paper, qp, ms)).rejects.toThrow('missing MS page');
  });
  it('rejects invalid crop coordinates and crop/page mismatches', () => {
    const region = { page: 2, box: { x0: 0.93, y0: 0.5, x1: 0.06, y1: 0.1 } };
    expect(localExtractionSchema.safeParse({ ...payload(), questions: [{ ...question, localCrops: { qp: [region], ms: [region] } }] }).success).toBe(false);
    const good = { page: 3, box: { x0: 0.06, y0: 0.1, x1: 0.93, y1: 0.5 } };
    expect(localExtractionSchema.safeParse({ ...payload(), questions: [{ ...question, localCrops: { qp: [good], ms: [good] } }] }).success).toBe(false);
  });

});

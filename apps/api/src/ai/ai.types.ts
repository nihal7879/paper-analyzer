import { z } from 'zod';

/**
 * What the AI must return for one question-paper page.
 * Strict structured outputs need every field present, so "missing" is null / [] rather than optional.
 */
export const pageQuestionSchema = z.object({
  number: z.string().describe('Question number exactly as printed, e.g. "1", "3(b)", "4(a)(ii)"'),
  continues_from_previous_page: z
    .boolean()
    .describe('true if this is the continuation of a question that started on an earlier page'),
  type: z.enum(['MCQ', 'THEORY', 'STRUCTURED']),
  marks: z.number().nullable().describe('Marks shown for this part, e.g. [3] -> 3. MCQ is usually 1. null if not shown'),
  text: z
    .string()
    .describe('Full question text as Markdown. Use $...$ for inline LaTeX and $$...$$ for display equations. Do not include MCQ options here.'),
  options: z
    .array(z.object({ label: z.string(), text: z.string() }))
    .describe('MCQ options A-D with LaTeX where needed. Empty array for non-MCQ.'),
  topic_code: z.string().nullable().describe('Code of the best matching topic from the provided list, or null'),
  topic: z.string(),
  subtopic: z.string(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  keywords: z.array(z.string()).describe('5-10 short concept keywords, lowercase'),
  diagrams: z
    .array(z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() }))
    .describe('Bounding boxes of diagrams/graphs/tables belonging to this question, as fractions 0..1 of page width/height (x0,y0 = top-left).'),
  confidence: z.number().describe('Your confidence 0..1 that this extraction is correct'),
});

export const pageExtractionSchema = z.object({
  questions: z.array(pageQuestionSchema),
});

export const markSchemeSchema = z.object({
  answers: z.array(
    z.object({
      number: z.string().describe('Question number as printed, e.g. "1", "3(b)"'),
      correct_option: z.string().nullable().describe('For MCQ: the letter A-D. Otherwise null.'),
      answer_text: z.string().describe('Mark scheme answer as Markdown with $...$ LaTeX. Keep mark codes like B1, M1, A1.'),
    }),
  ),
});

/** What the AI reads from a paper's cover page to fill in the paper details automatically. */
export const paperDetailsSchema = z.object({
  document_type: z.enum(['QUESTION_PAPER', 'MARK_SCHEME', 'OTHER']),
  board: z.string().nullable().describe('Exam board, e.g. "Cambridge International", "Pearson Edexcel", "AQA", "OCR", "IB", "CBSE"'),
  qualification: z.string().nullable().describe('Level / qualification, e.g. "AS & A Level", "International AS", "IGCSE", "GCSE", "A Level"'),
  subject_name: z.string().nullable().describe('Subject, e.g. "Physics"'),
  subject_code: z.string().nullable().describe('Subject / specification code as printed, e.g. "9702", "8PH0", "WPH11", "0625"'),
  paper_number: z.string().nullable().describe('Paper / component number as printed, e.g. "1", "2", "01", "4"'),
  variant: z.string().nullable().describe('Variant digit if printed (Cambridge "Paper 1 1" style), else null'),
  paper_title: z.string().nullable().describe('Paper title, e.g. "Multiple Choice", "Core Physics I", "AS Level Structured Questions"'),
  year: z.number().nullable(),
  session: z.enum(['JANUARY', 'FEB_MARCH', 'MAY_JUNE', 'OCT_NOV', 'OTHER']).nullable().describe('Exam session from the month on the cover'),
  confidence: z.number().describe('0..1 confidence in these details'),
});

export type PaperDetails = z.infer<typeof paperDetailsSchema>;

export type PageQuestion = z.infer<typeof pageQuestionSchema>;
export type PageExtraction = z.infer<typeof pageExtractionSchema>;
export type MarkSchemePage = z.infer<typeof markSchemeSchema>;

export interface PageContext {
  image: Buffer;
  /** Following pages sent in the same AI call (mark schemes are read 2 pages at a time to save calls). */
  extraImages?: Buffer[];
  pageNumber: number;
  pageCount: number;
  subjectName: string;
  subjectCode: string;
  componentName: string | null;
  topics: { code: string; name: string }[];
}

/** Swap implementations via AI_PROVIDER in .env. */
export interface ExtractionProvider {
  readonly name: string;
  readonly model: string;
  extractQuestionPage(ctx: PageContext): Promise<PageExtraction>;
  extractMarkSchemePage(ctx: PageContext): Promise<MarkSchemePage>;
  /** Read the cover page (page 1) to identify board, subject, paper, year and session. */
  detectPaperDetails(image: Buffer, fileName: string): Promise<PaperDetails>;
}

export const EXTRACTION_PROVIDER = Symbol('EXTRACTION_PROVIDER');

/** API shapes for papers and questions (stored in MySQL, see db/migrations). */

export type PaperState = 'UPLOADED' | 'PROCESSING' | 'IN_REVIEW' | 'PUBLISHED' | 'FAILED' | 'ARCHIVED';

export interface PaperMeta {
  /** Public id = slug, e.g. "8PH0_s16_01" (also the storage folder). */
  id: string;
  board: string;
  curriculum: string;
  subjectCode: string;
  subjectName: string;
  year: number;
  seasonCode: string;
  seasonName: string;
  paperCode: string;
  paperNumber: number | null;
  variant: number | null;
  componentName: string | null;
  qpFileName: string;
  msFileName: string | null;
  paperState: PaperState;
  publishedAt: string | null;
  createdAt: string;
}

export type ProcessingState = 'QUEUED' | 'RENDERING' | 'EXTRACTING' | 'MARK_SCHEME' | 'DONE' | 'FAILED';

export interface PaperStatus {
  state: ProcessingState;
  progress: number;
  message: string;
  pagesTotal: number;
  pagesDone: number;
  questionsFound: number;
  error: string | null;
  /** Pages the AI could not read (skipped); re-processing retries them. */
  failedPages?: { qp: number[]; ms: number[] };
  updatedAt: string;
}

export type QuestionType = 'MCQ' | 'THEORY' | 'STRUCTURED';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type QuestionStatus = 'DRAFT' | 'VERIFIED' | 'PUBLISHED';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface QuestionImage {
  /** Cropped WebP storage key (null = not cropped yet; the client crops the page image on the fly). */
  path: string | null;
  page: number;
  /** Normalised 0..1 crop box on the page image. */
  box: Box;
}

export interface Question {
  /** Database id as a string. */
  id: string;
  number: string;
  type: QuestionType;
  marks: number | null;
  /** Markdown with inline $...$ and block $$...$$ LaTeX. */
  text: string;
  options: { label: string; text: string }[];
  topicCode: string | null;
  topic: string;
  subtopic: string;
  /** Syllabus subtopic code (e.g. "2.3") when the subtopic is a syllabus one. */
  subtopicCode: string | null;
  /** The AI's finer wording when it differs from the syllabus subtopic (searchable). */
  subtopicDetail: string | null;
  difficulty: Difficulty;
  keywords: string[];
  page: number;
  pages: number[];
  images: QuestionImage[];
  /** The whole question part cut from the paper (one per page it is on), for worksheets that look like the real paper. */
  crops?: QuestionImage[];
  /** The part's rows cut from the mark scheme, for past-paper style answers. */
  msCrops?: QuestionImage[];
  answer: { correctOption: string | null; text: string } | null;
  confidence: number;
  status: QuestionStatus;
  edited: boolean;
  /** Pre-computed similar questions (ids, best first), from other papers. */
  similarIds: string[];
}

export interface Extraction {
  paperId: string;
  provider: string;
  model: string;
  generatedAt: string;
  questions: Question[];
}

/** What the AI pipeline produces for one question before it is saved. */
export interface ExtractedQuestion {
  number: string;
  type: QuestionType;
  marks: number | null;
  text: string;
  options: { label: string; text: string }[];
  topicCode: string | null;
  topic: string;
  subtopic: string;
  difficulty: Difficulty;
  keywords: string[];
  page: number;
  pages: number[];
  images: { path: string; page: number; box: Box }[];
  answer: { correctOption: string | null; text: string } | null;
  confidence: number;
}

/** Fields an admin can change in the editor. */
export interface QuestionEdit {
  type?: QuestionType;
  marks?: number | null;
  text?: string;
  options?: { label: string; text: string }[];
  topicCode?: string | null;
  topic?: string;
  subtopic?: string;
  difficulty?: Difficulty;
  keywords?: string[];
  answer?: { correctOption: string | null; text: string } | null;
  /** New crop boxes; the server crops them from the page images. */
  images?: { page: number; box: Box }[];
}

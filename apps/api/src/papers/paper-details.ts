import type { PaperDetails } from '../ai/ai.types.js';
import { findSubject, SEASONS, type ParsedFilename, type SeasonCode } from '../catalog/catalog.js';

/** Paper details proposed to the admin before upload (filled automatically, editable). */
export interface DetectedDetails {
  source: 'filename' | 'ai';
  documentType: 'QUESTION_PAPER' | 'MARK_SCHEME' | 'OTHER';
  board: string | null;
  curriculum: string | null;
  subjectCode: string | null;
  subjectName: string | null;
  year: number | null;
  seasonCode: SeasonCode | null;
  paperCode: string | null;
  componentName: string | null;
  confidence: number;
  /** Required fields the detection could not fill. */
  missing: string[];
}

const SESSION_TO_SEASON: Record<string, SeasonCode> = { JANUARY: 'j', FEB_MARCH: 'm', MAY_JUNE: 's', OCT_NOV: 'w' };

const BOARD_SHORT: [RegExp, string][] = [
  [/cambridge/i, 'CIE'],
  [/edexcel|pearson/i, 'Edexcel'],
  [/\baqa\b/i, 'AQA'],
  [/\bocr\b/i, 'OCR'],
  [/international baccalaureate|\bib\b/i, 'IB'],
  [/\bcbse\b/i, 'CBSE'],
];

function shortBoard(board: string): string {
  return BOARD_SHORT.find(([re]) => re.test(board))?.[1] ?? board;
}

const clean = (v: string | null | undefined) => (v ? v.replace(/[^A-Za-z0-9]/g, '') : '') || null;

function withMissing(d: Omit<DetectedDetails, 'missing'>): DetectedDetails {
  const missing = (['subjectCode', 'year', 'seasonCode', 'paperCode'] as const).filter((k) => d[k] == null);
  return { ...d, missing };
}

export function detailsFromFilename(p: ParsedFilename): DetectedDetails {
  const subject = findSubject(p.subjectCode);
  return withMissing({
    source: 'filename',
    documentType: p.kind === 'ms' ? 'MARK_SCHEME' : 'QUESTION_PAPER',
    board: subject?.board ?? 'Cambridge International',
    curriculum: subject?.curriculum ?? 'CIE AS & A Level',
    subjectCode: p.subjectCode,
    subjectName: p.subjectName,
    year: p.year,
    seasonCode: p.seasonCode,
    paperCode: p.paperCode,
    componentName: p.componentName,
    confidence: 1,
  });
}

export function detailsFromAi(d: PaperDetails): DetectedDetails {
  // "8PH0/01" printed as one code -> subject 8PH0, paper 01
  const [rawSubject, rawPaper] = (d.subject_code ?? '').split('/');
  const subjectCode = clean(rawSubject)?.toUpperCase() ?? null;
  const known = subjectCode ? findSubject(subjectCode) : undefined;
  const paper = clean(d.paper_number) ?? clean(rawPaper);
  const variant = clean(d.variant);
  // Cambridge prints "Paper 1" + variant "1" -> code "11"; others keep the printed number ("01").
  const paperCode = paper ? (variant && paper.length === 1 ? `${paper}${variant}` : paper) : null;
  const paperNumber = paperCode && known ? Number(paperCode[0]) : null;
  const board = d.board?.trim() || known?.board || null;
  const qualification = d.qualification?.trim() || null;

  return withMissing({
    source: 'ai',
    documentType: d.document_type,
    board,
    curriculum: known?.curriculum ?? (board ? [shortBoard(board), qualification].filter(Boolean).join(' ') : qualification),
    subjectCode,
    subjectName: known?.name ?? d.subject_name?.trim() ?? null,
    year: d.year && d.year >= 1990 && d.year <= 2100 ? Math.round(d.year) : null,
    seasonCode: d.session ? (SESSION_TO_SEASON[d.session] ?? null) : null,
    paperCode,
    componentName: d.paper_title?.trim() || (paperNumber ? (known?.components.find((c) => c.number === paperNumber)?.name ?? null) : null),
    confidence: Math.min(1, Math.max(0, d.confidence)),
  });
}

export function seasonName(code: SeasonCode): string {
  return SEASONS[code];
}

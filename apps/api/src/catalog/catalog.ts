/**
 * Phase 0 seed data. Moves to MySQL tables (boards, curriculums, subjects,
 * components, topics, seasons) in step 2 — keep the shapes aligned with
 * the plan's schema so the move is a straight copy.
 *
 * Topic lists follow the Cambridge 9702 syllabus numbering; verify against
 * the current syllabus before going live.
 */

export interface Topic {
  code: string;
  name: string;
}

export interface Component {
  number: number;
  name: string;
  style: 'MCQ' | 'THEORY' | 'PRACTICAL' | 'MIXED';
}

export interface Subject {
  code: string;
  name: string;
  board: string;
  curriculum: string;
  components: Component[];
  topics: Topic[];
}

/** Exam sessions. j = January (Edexcel / AQA international series), x = specimen / sample papers. */
export const SEASONS = {
  j: 'January',
  m: 'Feb/March',
  s: 'May/June',
  w: 'Oct/Nov',
  x: 'Specimen',
} as const;

export type SeasonCode = keyof typeof SEASONS;

export const SUBJECTS: Subject[] = [
  {
    code: '9702',
    name: 'Physics',
    board: 'Cambridge International',
    curriculum: 'CIE AS & A Level',
    components: [
      { number: 1, name: 'Multiple Choice', style: 'MCQ' },
      { number: 2, name: 'AS Level Structured Questions', style: 'THEORY' },
      { number: 3, name: 'Advanced Practical Skills', style: 'PRACTICAL' },
      { number: 4, name: 'A Level Structured Questions', style: 'THEORY' },
      { number: 5, name: 'Planning, Analysis and Evaluation', style: 'THEORY' },
    ],
    topics: [
      { code: '1', name: 'Physical quantities and units' },
      { code: '2', name: 'Kinematics' },
      { code: '3', name: 'Dynamics' },
      { code: '4', name: 'Forces, density and pressure' },
      { code: '5', name: 'Work, energy and power' },
      { code: '6', name: 'Deformation of solids' },
      { code: '7', name: 'Waves' },
      { code: '8', name: 'Superposition' },
      { code: '9', name: 'Electricity' },
      { code: '10', name: 'D.C. circuits' },
      { code: '11', name: 'Particle physics' },
      { code: '12', name: 'Motion in a circle' },
      { code: '13', name: 'Gravitational fields' },
      { code: '14', name: 'Temperature' },
      { code: '15', name: 'Ideal gases' },
      { code: '16', name: 'Thermodynamics' },
      { code: '17', name: 'Oscillations' },
      { code: '18', name: 'Electric fields' },
      { code: '19', name: 'Capacitance' },
      { code: '20', name: 'Magnetic fields' },
      { code: '21', name: 'Alternating currents' },
      { code: '22', name: 'Quantum physics' },
      { code: '23', name: 'Nuclear physics' },
      { code: '24', name: 'Medical physics' },
      { code: '25', name: 'Astronomy and cosmology' },
    ],
  },
  {
    code: '9701',
    name: 'Chemistry',
    board: 'Cambridge International',
    curriculum: 'CIE AS & A Level',
    components: [
      { number: 1, name: 'Multiple Choice', style: 'MCQ' },
      { number: 2, name: 'AS Level Structured Questions', style: 'THEORY' },
      { number: 3, name: 'Advanced Practical Skills', style: 'PRACTICAL' },
      { number: 4, name: 'A Level Structured Questions', style: 'THEORY' },
      { number: 5, name: 'Planning, Analysis and Evaluation', style: 'THEORY' },
    ],
    topics: [],
  },
  {
    code: '9700',
    name: 'Biology',
    board: 'Cambridge International',
    curriculum: 'CIE AS & A Level',
    components: [
      { number: 1, name: 'Multiple Choice', style: 'MCQ' },
      { number: 2, name: 'AS Level Structured Questions', style: 'THEORY' },
      { number: 3, name: 'Advanced Practical Skills', style: 'PRACTICAL' },
      { number: 4, name: 'A Level Structured Questions', style: 'THEORY' },
      { number: 5, name: 'Planning, Analysis and Evaluation', style: 'THEORY' },
    ],
    topics: [],
  },
];

SUBJECTS.push({
  code: '8PH0',
  name: 'Physics',
  board: 'Pearson Edexcel',
  curriculum: 'Edexcel AS Level',
  components: [
    { number: 1, name: 'Core Physics I', style: 'MIXED' },
    { number: 2, name: 'Core Physics II', style: 'MIXED' },
  ],
  // Pearson Edexcel AS Physics (8PH0) specification topics (same list as db/seeds/01_catalog.mjs).
  topics: [
    { code: '1', name: 'Working as a Physicist' },
    { code: '2', name: 'Mechanics' },
    { code: '3', name: 'Electric Circuits' },
    { code: '4', name: 'Materials' },
    { code: '5', name: 'Waves and the Particle Nature of Light' },
  ],
});

export function findSubject(code: string): Subject | undefined {
  return SUBJECTS.find((s) => s.code === code);
}

export interface ParsedFilename {
  subjectCode: string;
  subjectName: string | null;
  seasonCode: SeasonCode;
  seasonName: string;
  year: number;
  kind: 'qp' | 'ms';
  paperCode: string;
  paperNumber: number;
  variant: number | null;
  componentName: string | null;
}

// e.g. 9702_s26_qp_11.pdf, 9702_w25_ms_42.pdf, 9702_m24_qp_12.pdf
const CAMBRIDGE_FILENAME = /^(\d{4})_([msw])(\d{2})_(qp|ms)_(\d)(\d)?\.pdf$/i;

export function parseCambridgeFilename(fileName: string): ParsedFilename | null {
  const match = CAMBRIDGE_FILENAME.exec(fileName.trim());
  if (!match) return null;
  const [, subjectCode, season, yy, kind, paperDigit, variantDigit] = match;
  const seasonCode = season.toLowerCase() as SeasonCode;
  const subject = findSubject(subjectCode);
  const paperNumber = Number(paperDigit);
  return {
    subjectCode,
    subjectName: subject?.name ?? null,
    seasonCode,
    seasonName: SEASONS[seasonCode],
    year: 2000 + Number(yy),
    kind: kind.toLowerCase() as 'qp' | 'ms',
    paperCode: `${paperDigit}${variantDigit ?? ''}`,
    paperNumber,
    variant: variantDigit ? Number(variantDigit) : null,
    componentName: subject?.components.find((c) => c.number === paperNumber)?.name ?? null,
  };
}

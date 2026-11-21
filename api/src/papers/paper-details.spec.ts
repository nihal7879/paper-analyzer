import type { PaperDetails } from '../ai/ai.types.js';
import { parseCambridgeFilename } from '../catalog/catalog.js';
import { detailsFromAi, detailsFromFilename } from './paper-details.js';

const base: PaperDetails = {
  document_type: 'QUESTION_PAPER',
  board: null,
  qualification: null,
  subject_name: null,
  subject_code: null,
  paper_number: null,
  variant: null,
  paper_title: null,
  year: null,
  session: null,
  confidence: 0.9,
};

describe('detailsFromAi', () => {
  it('maps an Edexcel AS paper', () => {
    const d = detailsFromAi({
      ...base,
      board: 'Pearson Edexcel',
      qualification: 'AS Level',
      subject_name: 'Physics',
      subject_code: '8PH0',
      paper_number: '01',
      paper_title: 'Core Physics I',
      year: 2016,
      session: 'MAY_JUNE',
    });
    expect(d).toMatchObject({
      source: 'ai',
      board: 'Pearson Edexcel',
      curriculum: 'Edexcel AS Level',
      subjectCode: '8PH0',
      subjectName: 'Physics',
      year: 2016,
      seasonCode: 's',
      paperCode: '01',
      componentName: 'Core Physics I',
      missing: [],
    });
  });

  it('combines Cambridge paper + variant and uses the catalog names', () => {
    const d = detailsFromAi({ ...base, board: 'Cambridge International', subject_code: '9702', paper_number: '1', variant: '2', year: 2025, session: 'OCT_NOV' });
    expect(d).toMatchObject({ curriculum: 'CIE AS & A Level', subjectName: 'Physics', paperCode: '12', componentName: 'Multiple Choice', seasonCode: 'w' });
  });

  it('splits a combined code and lists what it could not find', () => {
    const d = detailsFromAi({ ...base, subject_code: '8PH0/01', year: 1800, session: 'OTHER' });
    expect(d).toMatchObject({ subjectCode: '8PH0', paperCode: '01' });
    expect(d.missing).toEqual(['year', 'seasonCode']);
  });
});

describe('detailsFromFilename', () => {
  it('fills everything from a Cambridge file name', () => {
    const d = detailsFromFilename(parseCambridgeFilename('9702_s26_ms_11.pdf')!);
    expect(d).toMatchObject({ source: 'filename', documentType: 'MARK_SCHEME', subjectCode: '9702', year: 2026, seasonCode: 's', paperCode: '11', missing: [] });
  });
});

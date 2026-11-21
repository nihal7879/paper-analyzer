import { parseCambridgeFilename } from './catalog.js';

describe('parseCambridgeFilename', () => {
  it('parses a May/June question paper', () => {
    expect(parseCambridgeFilename('9702_s26_qp_11.pdf')).toEqual({
      subjectCode: '9702',
      subjectName: 'Physics',
      seasonCode: 's',
      seasonName: 'May/June',
      year: 2026,
      kind: 'qp',
      paperCode: '11',
      paperNumber: 1,
      variant: 1,
      componentName: 'Multiple Choice',
    });
  });

  it('parses an Oct/Nov mark scheme for paper 4 variant 2', () => {
    const parsed = parseCambridgeFilename('9702_w25_ms_42.pdf');
    expect(parsed).toMatchObject({ seasonName: 'Oct/Nov', year: 2025, kind: 'ms', paperCode: '42', paperNumber: 4, variant: 2 });
  });

  it('handles papers without a variant digit and unknown subjects', () => {
    expect(parseCambridgeFilename('1234_m24_qp_2.PDF')).toMatchObject({
      subjectName: null,
      seasonName: 'Feb/March',
      paperCode: '2',
      variant: null,
    });
  });

  it('returns null for non-Cambridge names', () => {
    expect(parseCambridgeFilename('physics paper.pdf')).toBeNull();
    expect(parseCambridgeFilename('9702_s26_er.pdf')).toBeNull();
  });
});

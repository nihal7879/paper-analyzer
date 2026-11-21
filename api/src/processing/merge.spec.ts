import { collectAnswers, mergePages, normaliseQuestionNumber, questionId } from './merge.js';
import type { PageQuestion } from '../ai/ai.types.js';

const base: PageQuestion = {
  number: '1',
  continues_from_previous_page: false,
  type: 'STRUCTURED',
  marks: null,
  text: '',
  options: [],
  topic_code: null,
  topic: 'Dynamics',
  subtopic: 'Momentum',
  difficulty: 'MEDIUM',
  keywords: [],
  diagrams: [],
  confidence: 0.9,
};

describe('normaliseQuestionNumber', () => {
  it.each([
    ['3(b)(ii)', '3(b)(ii)'],
    ['3 (b) (ii)', '3(b)(ii)'],
    ['Q3(b)(ii)', '3(b)(ii)'],
    ['3bii', '3(bii)'],
    ['12', '12'],
    ['4(A)', '4(a)'],
  ])('%s -> %s', (raw, expected) => {
    expect(normaliseQuestionNumber(raw)).toBe(expected);
  });

  it('builds file-safe ids', () => {
    expect(questionId('3(b)(ii)')).toBe('q3_b_ii');
    expect(questionId('12')).toBe('q12');
  });
});

describe('mergePages', () => {
  it('joins a question continued on the next page', () => {
    const merged = mergePages([
      { page: 3, questions: [{ ...base, number: '2(a)', text: 'Start', keywords: ['a'], diagrams: [{ x0: 0, y0: 0, x1: 1, y1: 0.5 }] }] },
      { page: 4, questions: [{ ...base, number: '2 (a)', text: 'End', marks: 3, keywords: ['b'], confidence: 0.5 }] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ number: '2(a)', text: 'Start\n\nEnd', marks: 3, keywords: ['a', 'b'], confidence: 0.5, pages: [3, 4] });
    expect(merged[0].diagramsByPage).toEqual([{ page: 3, box: { x0: 0, y0: 0, x1: 1, y1: 0.5 } }]);
  });
});

describe('collectAnswers', () => {
  it('drops exact duplicates and joins split answers', () => {
    const answers = collectAnswers([
      { answers: [{ number: '1', correct_option: 'B', answer_text: 'B' }, { number: '2(a)', correct_option: null, answer_text: 'part one' }] },
      { answers: [{ number: '1', correct_option: 'B', answer_text: 'B' }, { number: '2 (a)', correct_option: null, answer_text: 'part two' }] },
    ]);
    expect(answers.get('1')?.answer_text).toBe('B');
    expect(answers.get('2(a)')?.answer_text).toBe('part one\n\npart two');
  });
});

import type { ExtractionProvider, MarkSchemePage, PageContext, PageExtraction, PaperDetails, QuestionBoxes } from './ai.types.js';

/**
 * Returns fixed sample data so the whole upload -> process -> view flow works
 * without an API key. Page 1 is treated as a cover page, like real papers.
 */
export class MockExtractionProvider implements ExtractionProvider {
  readonly name = 'mock';
  readonly model = 'mock';

  async extractQuestionPage(ctx: PageContext): Promise<PageExtraction> {
    await delay(400);
    if (ctx.pageNumber === 1 && ctx.pageCount > 1) return { questions: [] };

    const n = ctx.pageNumber;
    const topic = ctx.topics[(n * 2) % Math.max(ctx.topics.length, 1)] ?? { code: null, name: 'General' };

    if (ctx.componentName?.toLowerCase().includes('multiple choice')) {
      return {
        questions: [
          {
            number: String(n * 2 - 3),
            continues_from_previous_page: false,
            type: 'MCQ',
            marks: 1,
            text: 'Which quantity has the same base units as momentum?',
            options: [
              { label: 'A', text: 'force $\\times$ time' },
              { label: 'B', text: 'energy $\\div$ time' },
              { label: 'C', text: 'mass $\\times$ acceleration' },
              { label: 'D', text: 'pressure $\\times$ area' },
            ],
            topic_code: '1',
            topic: 'Physical quantities and units',
            subtopic: 'SI base units',
            difficulty: 'EASY',
            keywords: ['momentum', 'base units', 'si units', 'impulse'],
            diagrams: [],
            confidence: 0.95,
          },
          {
            number: String(n * 2 - 2),
            continues_from_previous_page: false,
            type: 'MCQ',
            marks: 1,
            text: 'The graph shows how the velocity $v$ of a car varies with time $t$. What is the distance travelled in the first $4.0\\,\\text{s}$?',
            options: [
              { label: 'A', text: '$12\\,\\text{m}$' },
              { label: 'B', text: '$24\\,\\text{m}$' },
              { label: 'C', text: '$36\\,\\text{m}$' },
              { label: 'D', text: '$48\\,\\text{m}$' },
            ],
            topic_code: topic.code,
            topic: topic.name,
            subtopic: 'Velocity-time graphs',
            difficulty: 'MEDIUM',
            keywords: ['velocity-time graph', 'distance', 'area under graph', 'kinematics'],
            diagrams: [{ x0: 0.2, y0: 0.45, x1: 0.8, y1: 0.75 }],
            confidence: 0.8,
          },
        ],
      };
    }

    return {
      questions: [
        {
          number: `${n - 1}(a)`,
          continues_from_previous_page: false,
          type: 'STRUCTURED',
          marks: 2,
          text: 'A ball of mass $m = 0.25\\,\\text{kg}$ moves horizontally with speed $4.0\\,\\text{m s}^{-1}$ and hits a vertical wall, as shown in the figure.\n\nDefine *linear momentum*.',
          options: [],
          topic_code: '3',
          topic: 'Dynamics',
          subtopic: 'Momentum',
          difficulty: 'EASY',
          keywords: ['momentum', 'definition', 'mass', 'velocity'],
          diagrams: [{ x0: 0.25, y0: 0.2, x1: 0.75, y1: 0.42 }],
          confidence: 0.9,
        },
        {
          number: `${n - 1}(b)`,
          continues_from_previous_page: false,
          type: 'STRUCTURED',
          marks: 3,
          text: 'The ball rebounds with speed $2.0\\,\\text{m s}^{-1}$. Calculate the change in momentum of the ball.',
          options: [],
          topic_code: '3',
          topic: 'Dynamics',
          subtopic: 'Momentum',
          difficulty: 'MEDIUM',
          keywords: ['momentum', 'change in momentum', 'collision', 'impulse', 'rebound'],
          diagrams: [],
          confidence: 0.85,
        },
      ],
    };
  }

  async extractMarkSchemePage(ctx: PageContext): Promise<MarkSchemePage> {
    await delay(300);
    if (ctx.pageNumber === 1 && ctx.pageCount > 1) return { answers: [] };
    const answers: MarkSchemePage['answers'] = [];
    for (let n = 2; n <= 40; n++) {
      answers.push({ number: String(n * 2 - 3), correct_option: 'A', answer_text: 'A' });
      answers.push({ number: String(n * 2 - 2), correct_option: 'B', answer_text: 'B' });
      answers.push({ number: `${n - 1}(a)`, correct_option: null, answer_text: 'product of mass and velocity **B1**' });
      answers.push({
        number: `${n - 1}(b)`,
        correct_option: null,
        answer_text: '$\\Delta p = m(v - u) = 0.25 \\times (2.0 - (-4.0))$ **C1**\n\n$= 1.5\\,\\text{N s}$ **A1**',
      });
    }
    return { answers };
  }

  /** Mock can't see the page: splits the text area evenly between the listed parts (enough to try the worksheet flow). */
  async findQuestionBoxes(_image: Buffer, _pageNumber: number, parts: string[]): Promise<QuestionBoxes> {
    await delay(200);
    const top = 0.08;
    const step = (0.9 - top) / Math.max(1, parts.length);
    return { boxes: parts.map((number, i) => ({ number, x0: 0.12, y0: top + i * step, x1: 0.88, y1: top + (i + 1) * step })) };
  }

  /** Mock can't read the page: returns a fixed Cambridge Physics paper so the upload flow can be tried without a key. */
  async detectPaperDetails(_image: Buffer, fileName: string): Promise<PaperDetails> {
    await delay(500);
    const yearMatch = /(19|20)\d{2}/.exec(fileName);
    return {
      document_type: /ms|mark/i.test(fileName) ? 'MARK_SCHEME' : 'QUESTION_PAPER',
      board: 'Cambridge International',
      qualification: 'AS & A Level',
      subject_name: 'Physics',
      subject_code: '9702',
      paper_number: '1',
      variant: '1',
      paper_title: 'Multiple Choice',
      year: yearMatch ? Number(yearMatch[0]) : 2026,
      session: 'MAY_JUNE',
      confidence: 0.3,
    };
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

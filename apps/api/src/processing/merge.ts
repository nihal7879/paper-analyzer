import type { MarkSchemePage, PageQuestion } from '../ai/ai.types.js';

/** "3 (b)(ii)" / "3b ii" / "Q3(b)(ii)" -> "3(b)(ii)" so QP and MS numbers line up. */
export function normaliseQuestionNumber(raw: string): string {
  const cleaned = raw.trim().replace(/^q(uestion)?\s*/i, '').replace(/\s+/g, '');
  const match = /^(\d+)(.*)$/.exec(cleaned);
  if (!match) return cleaned.toLowerCase();
  const [, main, rest] = match;
  const parts = rest.match(/[a-z]+|\d+/gi) ?? [];
  return main + parts.map((p) => `(${p.toLowerCase()})`).join('');
}

export function questionId(number: string): string {
  return 'q' + normaliseQuestionNumber(number).replace(/[()]/g, '_').replace(/_+/g, '_').replace(/_$/, '');
}

export interface PageResult {
  page: number;
  questions: PageQuestion[];
}

export interface MergedQuestion extends PageQuestion {
  key: string;
  pages: number[];
  diagramsByPage: { page: number; box: PageQuestion['diagrams'][number] }[];
}

/** Combine per-page results; a question split across pages becomes one question. */
export function mergePages(results: PageResult[]): MergedQuestion[] {
  const merged = new Map<string, MergedQuestion>();
  for (const { page, questions } of [...results].sort((a, b) => a.page - b.page)) {
    for (const q of questions) {
      const key = normaliseQuestionNumber(q.number);
      const existing = merged.get(key);
      const diagrams = q.diagrams.map((box) => ({ page, box }));
      if (!existing) {
        merged.set(key, { ...q, number: key, key, pages: [page], diagramsByPage: diagrams });
        continue;
      }
      existing.text = [existing.text, q.text].filter(Boolean).join('\n\n');
      if (!existing.options.length) existing.options = q.options;
      existing.marks = existing.marks ?? q.marks;
      existing.keywords = [...new Set([...existing.keywords, ...q.keywords])];
      existing.confidence = Math.min(existing.confidence, q.confidence);
      if (!existing.pages.includes(page)) existing.pages.push(page);
      existing.diagramsByPage.push(...diagrams);
    }
  }
  return [...merged.values()];
}

export function collectAnswers(pages: MarkSchemePage[]): Map<string, MarkSchemePage['answers'][number]> {
  const answers = new Map<string, MarkSchemePage['answers'][number]>();
  for (const page of pages) {
    for (const a of page.answers) {
      const key = normaliseQuestionNumber(a.number);
      const existing = answers.get(key);
      if (!existing) {
        answers.set(key, a);
      } else if (existing.answer_text.trim() !== a.answer_text.trim()) {
        // Same question answered across a page break: join the parts.
        answers.set(key, {
          ...existing,
          correct_option: existing.correct_option ?? a.correct_option,
          answer_text: `${existing.answer_text}\n\n${a.answer_text}`,
        });
      }
    }
  }
  return answers;
}

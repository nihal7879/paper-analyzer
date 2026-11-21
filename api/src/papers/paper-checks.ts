import type { Question } from './paper.types.js';

export interface PaperIssue {
  /** error = must be fixed before publishing; warning = check it */
  severity: 'error' | 'warning';
  code: string;
  questionId: string | null;
  number: string | null;
  message: string;
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
const PLACEHOLDER = /^\(New part\./;

/** "13(b)(ii)" -> { q: 13, letter: "b", roman: "ii" }; null when the number has no question number in front. */
function parse(number: string) {
  const n = number.replace(/\s+/g, '');
  // maths: "12(ii)(a)" - a numeral before the letter (the letter is a sub-part of that numeral)
  const r = /^(\d{1,3})\(([ivx]+)\)\(([a-z])\)$/i.exec(n);
  if (r) return { q: Number(r[1]), letter: null, roman: r[2].toLowerCase() };
  const m = /^(\d{1,3})(?:\(([a-z])\))?(?:\(([ivx]+)\))?$/i.exec(n);
  if (!m) return null;
  // "2(i)" (maths: parts numbered (i), (ii) with no letter) is the numeral i, not the letter i
  if (m[2] && !m[3] && /^[iv]$/i.test(m[2])) return { q: Number(m[1]), letter: null, roman: m[2].toLowerCase() };
  return { q: Number(m[1]), letter: m[2]?.toLowerCase() ?? null, roman: m[3]?.toLowerCase() ?? null };
}

/**
 * Checks a paper's parts for the mistakes an AI reading typically makes: a part without its question number
 * ("(b)"), a skipped letter (13(a) then 13(c)), duplicates, a part on pages far apart (two parts merged), parts
 * with no text / marks / answer / worksheet crop.
 */
export function checkPaper(questions: Question[]): PaperIssue[] {
  const issues: PaperIssue[] = [];
  const add = (severity: PaperIssue['severity'], code: string, q: Question | null, message: string) =>
    issues.push({ severity, code, questionId: q?.id ?? null, number: q?.number ?? null, message });
  const live = questions.filter((q) => q.status !== undefined);
  const seen = new Map<string, Question>();
  const byQ = new Map<number, { q: Question; p: NonNullable<ReturnType<typeof parse>> }[]>();

  for (const q of live) {
    const key = q.number.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) add('error', 'duplicate', q, `Q${q.number} appears twice: two parts have the same number`);
    seen.set(key, q);
    const p = parse(q.number);
    if (!p) add('error', 'number', q, `"${q.number}" has no question number in front (e.g. it should be 13${q.number}). Fix the part number.`);
    else byQ.set(p.q, [...(byQ.get(p.q) ?? []), { q, p }]);

    // Judge the pages of the part's real crops when it has them (the stored page list can also hold Answer Book pages of an "A"
    // paper); a gap of a few pages is a blank page ("This question continues on page 32 after the blank page"), not a merged part.
    const cropPages = (q.crops ?? []).filter((c) => c.path).map((c) => c.page);
    const pages = [...new Set(cropPages.length ? cropPages : q.pages?.length ? q.pages : [q.page])].sort((a, b) => a - b);
    for (let i = 1; i < pages.length; i++)
      if (pages[i] - pages[i - 1] > 4) {
        add('error', 'pages', q, `Q${q.number} is on pages ${pages.join(', ')}: pages far apart usually means two parts were merged. Split it, or fix its pages.`);
        break;
      }
    if (!q.text.trim() || PLACEHOLDER.test(q.text)) add('error', 'text', q, `Q${q.number} has no question text yet`);
    if (q.marks == null) add('warning', 'marks', q, `Q${q.number} has no marks`);
    if (!q.answer || (!q.answer.correctOption && !q.answer.text.trim())) add('warning', 'answer', q, `Q${q.number} has no answer`);
    if (q.type === 'MCQ' && q.options.length < 2) add('warning', 'options', q, `Q${q.number} is multiple choice but has ${q.options.length} options`);
    if (!(q.crops ?? []).some((c) => c.path)) add('warning', 'crop', q, `Q${q.number} has no worksheet crop: it prints in the typed layout`);
    if (!(q.msCrops ?? []).some((c) => c.path)) add('warning', 'msCrop', q, `Q${q.number} has no mark-scheme crop: its answer prints as a typed table`);
  }

  // skipped letters / numerals inside one question: 13(a), 13(c) with no 13(b)
  for (const [num, parts] of byQ) {
    const letters = [...new Set(parts.map((x) => x.p.letter).filter((l): l is string => !!l))].sort();
    for (let i = 0; i < letters.length; i++) {
      const expected = String.fromCharCode('a'.charCodeAt(0) + i);
      if (letters[i] !== expected) {
        const q = parts.find((x) => x.p.letter === letters[i])!.q;
        add('error', 'gap', q, `Question ${num} has (${letters[i]}) but no (${expected}): check its part letters`);
        break;
      }
    }
    for (const letter of [null, ...letters]) {
      const romans = [...new Set(parts.filter((x) => x.p.letter === letter && x.p.roman).map((x) => ROMAN.indexOf(x.p.roman!)))].sort((a, b) => a - b);
      for (let i = 0; i < romans.length; i++)
        if (romans[i] !== i) {
          const q = parts.find((x) => x.p.letter === letter && ROMAN.indexOf(x.p.roman!) === romans[i])!.q;
          add('error', 'gap', q, `Question ${num}${letter ? `(${letter})` : ''} has (${ROMAN[romans[i]]}) but no (${ROMAN[i]})`);
          break;
        }
    }
  }
  // question numbers that jump (e.g. 12 then 14)
  const nums = [...byQ.keys()].sort((a, b) => a - b);
  for (let i = 1; i < nums.length; i++) if (nums[i] - nums[i - 1] > 1) add('warning', 'missingQuestion', null, `No question ${nums[i - 1] + 1}${nums[i] - nums[i - 1] > 2 ? `–${nums[i] - 1}` : ''} (between Q${nums[i - 1]} and Q${nums[i]})`);
  return issues;
}

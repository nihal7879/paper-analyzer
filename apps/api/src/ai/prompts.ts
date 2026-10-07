import type { PageContext } from './ai.types.js';

export function questionPagePrompt(ctx: PageContext): string {
  const topicList = ctx.topics.length
    ? ctx.topics
        .map((t) => [`${t.code}. ${t.name}`, ...(t.subtopics ?? []).map((s) => `    - ${s.name}`)].join('\n'))
        .join('\n')
    : '(no fixed list — choose a sensible syllabus topic name and set topic_code to null)';

  return `You are extracting exam questions from page ${ctx.pageNumber} of ${ctx.pageCount} of a past paper.
Subject: ${ctx.subjectName} (${ctx.subjectCode})${ctx.componentName ? `\nPaper: ${ctx.componentName}` : ''}

Rules:
- Return every question or question part that appears on THIS page. Treat each lettered part (a), (b), (c)(i)... as its own question with its own number, e.g. "3(b)(ii)".
- If the page has no questions (cover page, formulae/data page, blank page, "BLANK PAGE"), return an empty "questions" array.
- Copy the question text faithfully. Do not solve the question and do not invent content.
- For a part that depends on a shared stem (text before part (a)), include the stem at the start of the first part only.
- Write all mathematics, units and symbols in LaTeX: $v = u + at$, $1.5\\,\\text{N s}$, $\\Omega$, $\\times 10^{-3}$.
- MCQ: put the stem in "text" and each option in "options" with labels A, B, C, D.
- Marks: read the number in square brackets at the end of the part, e.g. [3]. For MCQ use 1.
- diagrams: tight bounding box around each figure, graph, circuit or table that belongs to the question (fractions of the page, top-left origin). Do not include the question text in the box. Empty array if none.
- tables: one form only, never both. If a table is cropped cleanly in diagrams, do not also write it in the text. Only when a clean crop is not possible, write it in the text as a Markdown table (keep empty columns as empty cells) and leave it out of diagrams.
- topic_code/topic: choose ONLY from this syllabus topic list:
${topicList}
- subtopic: if the chosen topic lists subtopics, copy the best-fitting one EXACTLY as written. Only if none fits, write a short, specific syllabus subtopic (e.g. "Momentum and impulse").
- difficulty: EASY (recall / one step), MEDIUM (two or three steps), HARD (multi-step, unfamiliar context or synthesis).
- keywords: 5-10 lowercase concept keywords a student might search for.
- confidence: lower it if text is hard to read or the layout is unusual.`;
}

export function markSchemePagePrompt(ctx: PageContext): string {
  const extra = ctx.extraImages?.length ?? 0;
  const pages = extra ? `pages ${ctx.pageNumber}-${ctx.pageNumber + extra} (one image per page, in order)` : `page ${ctx.pageNumber}`;
  return `You are reading ${pages} of ${ctx.pageCount} of a MARK SCHEME for ${ctx.subjectName} (${ctx.subjectCode})${
    ctx.componentName ? `, ${ctx.componentName}` : ''
  }.

Rules:
- Return one entry per question / question part answered on this page, using the question number exactly as printed, e.g. "1", "3(b)(ii)".
- MCQ answer grids: one entry per question with correct_option = the letter, and answer_text = the letter.
- Structured answers: answer_text = the marking points as Markdown, one per line, keeping mark codes (B1, M1, A1, C1). Use LaTeX ($...$) for maths and units.
- Ignore generic marking guidance, cover pages and abbreviations pages (return an empty "answers" array).
- Do not invent answers.`;
}

export function coverPagePrompt(fileName: string): string {
  return `This is the FIRST PAGE of an exam document. Identify the document so it can be filed automatically.
Original file name (may help, may be meaningless): "${fileName}"

Rules:
- Read the details printed on the page: board name or logo, qualification, subject, code, paper number and title, month and year.
- session: January -> JANUARY, February/March -> FEB_MARCH, May/June -> MAY_JUNE, October/November -> OCT_NOV.
- document_type: MARK_SCHEME if the page says mark scheme / marking guidance, QUESTION_PAPER for a question paper, otherwise OTHER.
- Copy codes exactly as printed (e.g. "9702", "8PH0", "WPH11"). If printed like "8PH0/01", subject_code is "8PH0" and paper_number is "01".
- Use null for anything not shown. Do not guess a year or code that is not on the page or in the file name.`;
}

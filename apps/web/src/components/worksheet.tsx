import { MathText } from "@/components/math-text";
import { fileUrl, sourceLine, type PaperMeta } from "@/lib/api";
import { baseNumber, groupKeyOf, type BankEntry } from "@/lib/question-bank";

/**
 * Worksheet PDF that looks like the real paper: every question part is the original crop from the paper,
 * placed at exactly its printed size and position on A4 (so fonts, diagrams, tables, answer lines and spacing
 * match the paper), with our own numbering 1, 2, 3…, "Total for Question" lines and a cover page.
 *
 * Geometry: the PDF page is A4 (210 mm wide) with a 10 mm left margin (see the API's PDF settings and @page
 * below). A crop whose box starts at x0 (fraction of the page width) is placed x0 × 210 mm from the paper's left
 * edge and drawn (x1 − x0) × 210 mm wide; its height follows from the image, so the scale is exactly 1:1.
 * Questions without a crop yet fall back to the text layout.
 *
 * typed = the "Normal" format: our own text, laid out like the paper (Times, number in the margin, (a)/(i)
 * labels, marks on the right, dotted answer lines, Total lines, border and side strip). Answers are shown as a
 * mark-scheme table (Question Number | Answer | Mark) in both formats.
 */

const PAGE_MM = 210;
const LEFT_MARGIN_MM = 10;
/** Where Edexcel prints the bold question number (fraction of the page width). */
const NUMBER_X = 0.075;
const PAGE_H_MM = 297;
/** Digit height / font size for the serif number (Times bold), and where the digit top sits in a line-height:1 box. */
const DIGIT_H = 0.66;
const DIGIT_TOP = 0.2;

/** Our number exactly where the paper's own (whited-out) number was: same place, same size. */
function numberStyle(q: WholeQuestion): React.CSSProperties {
  const first = q.parts[0]?.question.crops?.[0]?.box;
  const num = first?.num;
  if (!first || !num) return { left: `calc(${NUMBER_X} * ${PAGE_MM}mm - ${LEFT_MARGIN_MM}mm)` };
  const size = (num.h * PAGE_H_MM) / DIGIT_H;
  return {
    left: `calc(${num.x} * ${PAGE_MM}mm - ${LEFT_MARGIN_MM}mm)`,
    top: `${((num.y - first.y0) * PAGE_H_MM - DIGIT_TOP * size).toFixed(2)}mm`,
    fontSize: `${size.toFixed(2)}mm`,
    fontFamily: '"Times New Roman", Times, serif',
  };
}

type Mode = "none" | "end" | "only";

interface WholeQuestion {
  key: string;
  meta: PaperMeta;
  base: string;
  parts: BankEntry[];
  marks: number;
}

/** Selected parts -> whole questions (Q17 with all its parts), in the order the teacher picked them. */
export function toWholeQuestions(items: BankEntry[]): WholeQuestion[] {
  const map = new Map<string, WholeQuestion>();
  for (const e of items) {
    const k = groupKeyOf(e);
    let q = map.get(k);
    if (!q) map.set(k, (q = { key: k, meta: e.meta, base: baseNumber(e.question.number), parts: [], marks: 0 }));
    q.parts.push(e);
  }
  for (const q of map.values()) {
    q.parts.sort((a, b) => a.order - b.order);
    q.marks = q.parts.reduce((s, p) => s + (p.question.marks ?? 0), 0);
  }
  return [...map.values()];
}

export function Worksheet({ items, title, answers, typed = false }: { items: BankEntry[]; title: string; answers: Mode; typed?: boolean }) {
  const questions = toWholeQuestions(items);
  const msLandscape = answers === "only" && !typed;
  const total = questions.reduce((s, q) => s + q.marks, 0);
  const subjects = [...new Set(items.map((e) => `${e.meta.board} ${e.meta.curriculum.split(/\s+/).filter((w) => !e.meta.board.split(/\s+/).includes(w)).join(" ")} ${e.meta.subjectName}`.replace(/\s+/g, " ").trim()))];

  return (
    <div className={msLandscape ? "ws-doc ws-landscape" : answers === "only" ? "ws-doc ws-plain" : "ws-doc"}>
      <style>{WORKSHEET_CSS}</style>
      {/* Answer pages look like the mark scheme: no page border or "do not write" strip */}
      {answers === "only" ? (
        <style>{msLandscape ? LANDSCAPE_CSS : PLAIN_CSS}</style>
      ) : (
        <>
          {/* The paper's page design, repeated on every printed page: rounded border + hatched side strip */}
          <div className="ws-frame" aria-hidden />
          <Strip />
        </>
      )}

      <table className="ws-pages">
        <thead><tr><td><div className="ws-gap-top" /></td></tr></thead>
        <tfoot><tr><td><div className="ws-gap-bottom" /></td></tr></tfoot>
        <tbody><tr><td>
      {answers === "only" ? (
        <>
          <header className="ws-answers-head">
            <h1>{title}: Answers</h1>
            <p>{subjects.join(" · ")} · {questions.length} question{questions.length === 1 ? "" : "s"} · {total} marks</p>
          </header>
          {typed ? <MarkScheme questions={questions} /> : <MarkSchemeCrops questions={questions} landscape />}
        </>
      ) : (
        <>
          <Cover title={title} subjects={subjects} questions={questions} total={total} />
          {questions.map((q, i) => (
            <QuestionBlock key={q.key} q={q} n={i + 1} typed={typed} />
          ))}
          <p className="ws-end">TOTAL FOR WORKSHEET = {total} MARKS</p>
          {answers === "end" && (
            <section className="ws-answers">
              <h2>Answers</h2>
              {typed ? <MarkScheme questions={questions} /> : <MarkSchemeCrops questions={questions} landscape={false} />}
            </section>
          )}
        </>
      )}
        </td></tr></tbody>
      </table>
    </div>
  );
}

/**
 * The hatched "DO NOT WRITE IN THIS AREA" strip, as an SVG image: Chrome drops SVG transforms inside
 * repeated (position: fixed) print elements, but keeps them inside an image. Units are mm; 276 = printable height.
 */
const STRIP_SVG = (() => {
  const label = (y: number) =>
    `<g transform="translate(3.25 ${y}) rotate(90)"><rect x="-24" y="-2.2" width="48" height="4.4" fill="#fff"/>` +
    `<text x="0" y="1.05" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="2.9" letter-spacing="0.1" fill="#9a9a9a">DO NOT WRITE IN THIS AREA</text></g>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="6.5mm" height="271mm" viewBox="0 0 6.5 271">` +
    `<defs><pattern id="h" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1" stroke="#c8c8c8" stroke-width="0.3"/></pattern></defs>` +
    `<rect width="6.5" height="271" fill="url(#h)"/>${[45, 135.5, 226].map(label).join("")}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();

function Strip() {
  return <img className="ws-strip" src={STRIP_SVG} alt="" aria-hidden />;
}

function Cover({ title, subjects, questions, total }: { title: string; subjects: string[]; questions: WholeQuestion[]; total: number }) {
  const sources = [...new Set(questions.map((q) => sourceLine(q.meta)))];
  return (
    <section className="ws-cover">
      <p className="ws-brand">Practice worksheet</p>
      <h1>{title}</h1>
      <p className="ws-subject">{subjects.join(" · ")}</p>
      <div className="ws-fields">
        <div>
          <span>Name</span>
        </div>
        <div>
          <span>Class</span>
        </div>
        <div>
          <span>Date</span>
        </div>
      </div>
      <div className="ws-facts">
        <div>
          <b>{questions.length}</b>
          <span>question{questions.length === 1 ? "" : "s"}</span>
        </div>
        <div>
          <b>{total}</b>
          <span>total marks</span>
        </div>
      </div>
      <h3>Instructions</h3>
      <ul>
        <li>Use black ink or ball-point pen.</li>
        <li>Answer all questions in the spaces provided; there may be more space than you need.</li>
        <li>Show your working in calculations and include units where appropriate.</li>
        <li>The marks for each question are shown in brackets.</li>
      </ul>
      <h3>Questions taken from</h3>
      <ul className="ws-sources">
        {sources.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </section>
  );
}

function QuestionBlock({ q, n, typed }: { q: WholeQuestion; n: number; typed: boolean }) {
  const cropped = !typed && q.parts.every((p) => (p.question.crops ?? []).some((c) => c.path));
  const tail = (
    <>
      <p className="ws-total">
        (Total for Question {n} = {q.marks} mark{q.marks === 1 ? "" : "s"})
      </p>
      <p className="ws-source">Source: {sourceLine(q.meta, q.base)}</p>
    </>
  );
  const crops = q.parts.flatMap((p) => (p.question.crops ?? []).filter((c) => c.path).map((c, k) => ({ p, c, k })));
  return (
    <section className="ws-q">
      {cropped ? (
        // A question may run over pages between its crops (no half-empty pages); the number rides on the first
        // crop and the Total line on the last one, so neither is ever left alone on a page.
        crops.map(({ p, c, k }, i) => (
          <div key={`${p.question.id}-${k}`} className={i === 0 ? "ws-first" : "ws-keep"}>
            {i === 0 && (
              <span className="ws-num" style={numberStyle(q)}>
                {n}
              </span>
            )}
            <img
              className="ws-crop"
              src={fileUrl(c.path!)}
              alt={`Question ${n}, part ${p.question.number}`}
              style={{ marginLeft: `calc(${c.box.x0} * ${PAGE_MM}mm - ${LEFT_MARGIN_MM}mm)`, width: `calc(${c.box.x1 - c.box.x0} * ${PAGE_MM}mm)` }}
            />
            {i === crops.length - 1 && tail}
          </div>
        ))
      ) : (
        // Normal format (or no crop yet): our text in the paper's layout
        <TypedQuestion q={q} n={n} tail={tail} />
      )}
    </section>
  );
}

/** "(a)", "(ii)", "(a)(i)" at the start of a paragraph. */
const LABEL_RE = /^((?:\((?:[a-h]|i{1,3}|iv|vi{0,3}|ix|x)\)\s*){1,2})/;

/** The part's label from its number ("15(a)(i)" in question 15 -> "(a) (i)"), empty for a one-part question. */
function partLabel(number: string, base: string): string {
  return number.replace(/\s+/g, "").slice(base.length).replace(/\)\(/g, ") (");
}

interface Segment {
  label: string | null;
  text: string;
  /** belongs to a lettered part (indented under its label) rather than the question's opening stem */
  inPart: boolean;
}

/** Split a part's text into paragraphs; labelled paragraphs get a hanging label like the paper. */
function segmentsOf(text: string, label: string, isFirst: boolean): Segment[] {
  const paras = (text ?? "").split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
  const segs = paras.map((t) => {
    const m = LABEL_RE.exec(t);
    return m ? { label: m[1].trim().replace(/\)\s*\(/g, ") ("), text: t.slice(m[0].length) } : { label: null as string | null, text: t };
  });
  // The text doesn't carry its label: a later part starts with it; the first part's stem comes first, so it goes on the last paragraph.
  if (label && segs.length && !segs.some((x) => x.label)) {
    const at = isFirst && segs.length > 1 ? segs.length - 1 : 0;
    segs[at] = { ...segs[at], label };
  }
  let inPart = false;
  return segs.map((x) => {
    if (x.label) inPart = true;
    return { ...x, inPart };
  });
}

/** Dotted answer lines like the paper: about two per mark (none for multiple choice). */
function answerLines(marks: number | null, isMcq: boolean): number {
  if (isMcq || !marks) return 0;
  return Math.min(14, Math.max(2, marks * 2));
}

/** Normal format: one question in the paper's layout, from our own text. */
function TypedQuestion({ q, n, tail }: { q: WholeQuestion; n: number; tail: React.ReactNode }) {
  return (
    <>
      {q.parts.map((p, pi) => {
        const isMcq = p.question.options.length > 0;
        const label = partLabel(p.question.number, q.base);
        const segs = segmentsOf(p.question.text, label, pi === 0);
        const lines = answerLines(p.question.marks, isMcq);
        const last = pi === q.parts.length - 1;
        return (
          <div key={p.question.id} className={pi === 0 ? "ws-first ws-t-part" : "ws-t-part"}>
            {pi === 0 && <span className="ws-num ws-num-typed">{n}</span>}
            {segs.map((x, k) =>
              x.label ? (
                // "(a) (i)" or a lone "(ii)" sits one step further in, like the paper
                <div key={k} className={x.label.includes(") (") || /^\((?:i|ii|iii|iv|v|vi)\)$/.test(x.label) ? "ws-t-lab ws-t-lab2" : "ws-t-lab"}>
                  <span className="ws-t-label">{x.label}</span>
                  <MathText>{x.text}</MathText>
                </div>
              ) : (
                <div key={k} className={x.inPart ? "ws-t-body" : "ws-t-stem"}>
                  <MathText>{x.text}</MathText>
                </div>
              ),
            )}
            {p.question.images.map((img, k) =>
              img.path ? (
                <img
                  key={k}
                  src={fileUrl(img.path)}
                  alt=""
                  className="ws-t-img"
                  // the figure at its size on the paper
                  style={{ width: `min(165mm, calc(${Math.max(0.15, img.box.x1 - img.box.x0)} * ${PAGE_MM}mm))` }}
                />
              ) : null,
            )}
            {isMcq && (
              <ul className="ws-t-options">
                {p.question.options.map((o) => (
                  <li key={o.label}>
                    <span className="ws-t-box" />
                    <b>{o.label}</b>
                    <MathText inline>{o.text}</MathText>
                  </li>
                ))}
              </ul>
            )}
            {p.question.marks != null && <p className="ws-t-marks">({p.question.marks})</p>}
            {Array.from({ length: lines }, (_, k) => (
              <div key={k} className="ws-t-line" />
            ))}
            {last && tail}
          </div>
        );
      })}
    </>
  );
}

/**
 * Answers as a mark-scheme table, like the paper's mark scheme: one table per question with the grey
 * "Question Number | Answer | Mark" header, a row per part, then "(Total for Question n = X marks)".
 */
function MarkScheme({ questions, startAt = 1 }: { questions: WholeQuestion[]; startAt?: number }) {
  return (
    <div className="ws-ms">
      {questions.map((q, i) => (
        <section key={q.key} className="ws-ms-q">
          <table>
            <thead>
              <tr>
                <th className="ws-ms-num">
                  Question
                  <br />
                  Number
                </th>
                <th>Answer</th>
                <th className="ws-ms-mark">Mark</th>
              </tr>
            </thead>
            <tbody>
              {q.parts.map((p) => {
                const a = p.question.answer;
                return (
                  <tr key={p.question.id}>
                    <td className="ws-ms-num">
                      {startAt + i}
                      {partLabel(p.question.number, q.base).replace(/\s+/g, "")}
                    </td>
                    <td className="ws-ms-ans">
                      {!a ? (
                        <p className="ws-muted">No answer available.</p>
                      ) : a.correctOption ? (
                        <p>
                          <b>{a.correctOption.toUpperCase()}</b>
                        </p>
                      ) : (
                        <MathText>{a.text}</MathText>
                      )}
                    </td>
                    <td className="ws-ms-mark">{p.question.marks ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="ws-ms-total">
            (Total for Question {startAt + i} = {q.marks} mark{q.marks === 1 ? "" : "s"})
          </p>
          <p className="ws-source">Source: {sourceLine(q.meta, q.base)}</p>
        </section>
      ))}
    </div>
  );
}

/** Widest a mark-scheme crop may be on a portrait worksheet page (the answers then shrink to fit). */
const PORTRAIT_MS_MM = 180;

/**
 * Past-paper style answers: each question's rows cut from the real mark scheme, under its grey header row, with
 * our numbering written where the mark scheme's own number was. landscape = the separate answer sheet, printed on
 * landscape pages like the real mark scheme, at its real size. A question missing a crop falls back to the table.
 */
function MarkSchemeCrops({ questions, landscape }: { questions: WholeQuestion[]; landscape: boolean }) {
  return (
    <div className="ws-ms">
      {questions.map((q, i) => {
        const n = i + 1;
        const cropped = q.parts.every((p) => (p.question.msCrops ?? []).some((c) => c.path));
        if (!cropped) return <MarkScheme key={q.key} questions={[q]} startAt={n} />;
        const first = q.parts[0].question.msCrops![0].box;
        const pw = first.pw ?? 297;
        const ph = first.ph ?? 210;
        const scale = landscape ? 1 : Math.min(1, PORTRAIT_MS_MM / ((first.x1 - first.x0) * pw));
        const mm = (v: number) => `${v.toFixed(2)}mm`;
        const left = landscape ? `calc(${first.x0} * ${pw}mm - 10mm)` : "3mm"; // portrait: just inside the page border
        const width = (b: { x0: number; x1: number }) => mm((b.x1 - b.x0) * pw * scale);
        return (
          <section key={q.key} className="ws-msq">
            {q.parts.flatMap((p, pi) =>
              (p.question.msCrops ?? [])
                .filter((c) => c.path)
                .map((c, k) => {
                  const b = c.box;
                  const num = k === 0 ? b.num : undefined;
                  const label = `${n}${partLabel(p.question.number, q.base).replace(/\s+/g, "")}`;
                  // a label with brackets measures bracket-top to bracket-bottom (~0.92 of the font size); digits ~0.66
                  const paren = label.includes("(");
                  const size = num ? (num.h * ph * scale) / (paren ? 0.92 : DIGIT_H) : 0;
                  const lastRow = pi === q.parts.length - 1 && k === (p.question.msCrops ?? []).filter((x) => x.path).length - 1;
                  return (
                    <div key={`${p.question.id}-${k}`} className="ws-msq-row" style={{ marginLeft: left }}>
                      {pi === 0 && k === 0 && b.head && <img className="ws-crop" src={fileUrl(b.head)} alt="" style={{ width: width(b) }} />}
                      <div className="ws-msq-cell">
                        <img className="ws-crop" src={fileUrl(c.path!)} alt={`Mark scheme for question ${n} ${p.question.number}`} style={{ width: width(b) }} />
                        {num && (
                          <span
                            className="ws-msq-num"
                            style={{
                              left: mm((num.x - b.x0) * pw * scale),
                              top: mm((num.y - b.y0) * ph * scale - (paren ? 0.08 : DIGIT_TOP) * size),
                              fontSize: mm(size),
                            }}
                          >
                            {label}
                          </span>
                        )}
                      </div>
                      {/* the Total line stays with the question's last row */}
                      {lastRow && (
                        <>
                          <p className="ws-ms-total" style={{ width: width(first) }}>
                            (Total for Question {n} = {q.marks} mark{q.marks === 1 ? "" : "s"})
                          </p>
                          <p className="ws-source" style={{ width: width(first) }}>
                            Source: {sourceLine(q.meta, q.base)}
                          </p>
                        </>
                      )}
                    </div>
                  );
                }),
            )}
          </section>
        );
      })}
    </div>
  );
}


/** Answer pages in the Normal format: plain portrait pages (no border or strip; see pdf.service margins). */
const PLAIN_CSS = `
@page { size: A4; margin: 12mm 10mm 16mm 10mm; }
@media print {
  .ws-plain.ws-doc { width: 190mm; }
  .ws-plain .ws-pages { width: 190mm; }
  .ws-plain .ws-answers-head { margin: 0; }
  .ws-plain .ws-ms-q { margin-left: 0; margin-right: 0; }
}
`;

/** Separate answer sheet in the past-paper style: landscape A4 like the real mark scheme (see pdf.service). */
const LANDSCAPE_CSS = `
@page { size: A4 landscape; margin: 10mm; }
@media print {
  .ws-landscape.ws-doc { width: 277mm; }
  .ws-landscape .ws-pages { width: 277mm; }
  .ws-landscape .ws-answers-head { margin: 0; }
}
`;

const WORKSHEET_CSS = `
@page { size: A4; margin: 7mm 2mm 14mm 10mm; }
.ws-frame, .ws-strip { display: none; }
.ws-pages { border-collapse: collapse; width: 100%; }
.ws-pages td { padding: 0; }
.ws-doc { width: 190mm; margin: 0 auto; background: #fff; color: #000; font-family: "Times New Roman", Times, serif; font-size: 11pt; line-height: 1.35; }
.ws-cover { break-after: page; padding: 6mm 4mm 0; }
.ws-brand { font: 600 9pt Arial, sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #555; margin: 0 0 3mm; }
.ws-cover h1 { font: 700 24pt Arial, sans-serif; margin: 0 0 2mm; }
.ws-subject { font: 12pt Arial, sans-serif; color: #333; margin: 0 0 8mm; }
.ws-fields { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 4mm; margin-bottom: 8mm; }
.ws-fields div { border: 1px solid #000; height: 14mm; padding: 1.5mm 2.5mm; }
.ws-fields span { font: 600 8.5pt Arial, sans-serif; color: #333; }
.ws-facts { display: flex; gap: 4mm; margin-bottom: 8mm; }
.ws-facts div { border: 2px solid #000; padding: 3mm 6mm; text-align: center; }
.ws-facts b { display: block; font: 700 20pt Arial, sans-serif; }
.ws-facts span { font: 9pt Arial, sans-serif; }
.ws-cover h3 { font: 700 11pt Arial, sans-serif; margin: 6mm 0 2mm; }
.ws-cover ul { margin: 0; padding-left: 6mm; font-size: 11pt; }
.ws-cover li { margin: 1.2mm 0; }
.ws-sources { font-size: 10pt; color: #333; }
.ws-q { margin-right: 5mm; margin-bottom: 4mm; }
.ws-first { position: relative; break-inside: avoid; }
.ws-keep { break-inside: avoid; }
/* the rule under each question starts at the number column, inside the page border (like the paper) */
.ws-q::after { content: ""; display: block; margin: 2mm 0 0 3mm; border-bottom: 1px solid #000; }
.ws-num { position: absolute; top: 0.2mm; font: 700 12pt Arial, sans-serif; line-height: 1; }
.ws-crop { display: block; height: auto; break-inside: avoid; }
.ws-total { break-before: avoid; text-align: right; font-weight: 700; margin: 1mm 0 0; font-size: 11pt; }
.ws-source { text-align: right; font: 7.5pt Arial, sans-serif; color: #666; margin: 0.5mm 0 0; }
.ws-end { padding-right: 5mm; text-align: right; font: 700 11pt Arial, sans-serif; margin: 6mm 0 0; }
/* Normal format, laid out like the paper (page x: number 15 mm, stem 21 mm, (a) text 26 mm, (i) text 31.5 mm) */
.ws-t-part { position: relative; break-inside: avoid; font-size: 11pt; line-height: 1.3; margin-bottom: 3mm; }
.ws-t-part p { margin: 0; }
.ws-t-part .math-text { line-height: 1.22; }
.ws-t-part .math-text p + p { margin-top: 2mm; }
.ws-num-typed { left: 5mm; top: 0; font: 700 11pt "Times New Roman", Times, serif; line-height: 1.3; }
.ws-t-stem { margin: 0 10mm 2.5mm 11mm; }
.ws-t-body { margin: 0 10mm 2.5mm 17mm; }
.ws-t-lab { position: relative; margin: 0 10mm 2.5mm 17mm; }
.ws-t-label { position: absolute; left: -6mm; line-height: 1.22; }
.ws-t-lab2 { margin-left: 23mm; }
.ws-t-lab2 .ws-t-label { left: -12mm; }
.ws-t-img { display: block; margin: 2mm auto 3mm; max-width: 165mm; height: auto; }
.ws-t-options { list-style: none; padding: 0; margin: 1mm 0 2mm 11mm; }
.ws-t-options li { display: flex; align-items: baseline; gap: 3mm; margin: 0 0 2.6mm; }
.ws-t-options b { min-width: 3mm; }
.ws-t-box { display: inline-block; width: 3mm; height: 3mm; border: 0.25mm solid #444; flex: none; transform: translateY(0.4mm); }
.ws-t-marks { text-align: right; color: #666; margin: 0 10mm 1mm 0 !important; }
.ws-t-line { height: 8.5mm; margin-left: 5mm; border-bottom: 0.3mm dotted #555; }
/* answers: the mark scheme's table */
.ws-ms-q { break-inside: avoid; margin: 0 5mm 5mm 3mm; }
.ws-ms table { width: 100%; border-collapse: collapse; font-size: 10.5pt; line-height: 1.3; }
.ws-ms th { background: #d9d9d9; font-weight: 700; font-size: 10pt; border: 0.3mm solid #000; padding: 1mm 2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ws-ms td { border: 0.3mm solid #000; padding: 1.5mm 2mm; vertical-align: top; }
.ws-ms-num { width: 17mm; text-align: center; font-weight: 700; }
.ws-ms-mark { width: 13mm; text-align: center; }
.ws-ms-ans .math-text p { margin: 0 0 1.2mm; }
.ws-ms-total { text-align: right; font-weight: 700; margin: 1mm 0 0; }
.ws-msq { margin: 0 0 5mm; }
.ws-msq-row { break-inside: avoid; }
.ws-msq-cell { position: relative; }
.ws-msq-num { position: absolute; font-family: "Times New Roman", Times, serif; font-weight: 700; line-height: 1; white-space: nowrap; }
.ws-answers { break-before: page; }
.ws-answers h2, .ws-answers-head h1 { font: 700 16pt Arial, sans-serif; border-bottom: 2px solid #000; padding-bottom: 2mm; margin: 0 0 4mm; }
.ws-answers-head p { font: 9.5pt Arial, sans-serif; color: #444; margin: -2mm 0 5mm; }
.ws-muted { color: #777; }
.ws-doc .math-text table { margin: 1.5mm auto; }
/* print layout last, so it wins over the base rules above */
@media print {
  /* the app reserves a scrollbar gutter and clips sideways overflow: neither applies on paper */
  html { scrollbar-gutter: auto !important; }
  body { overflow: visible !important; }
  /* printable area: page x 10–208mm, y 7–283mm (see pdf.service margins) */
  .ws-doc { margin: 0; width: 198mm; }
  .ws-pages { width: 190mm; }
  .ws-gap-top { height: 5mm; }
  .ws-gap-bottom { height: 8mm; }
  .ws-frame { display: block; position: fixed; top: 0; bottom: 5mm; left: 1.5mm; width: 186mm; box-sizing: border-box; border: 0.35mm solid #9a9a9a; border-radius: 3.5mm; pointer-events: none; }
  /* answer pages: keep the text inside the page border */
  .ws-answers > h2, .ws-answers-head { margin-left: 4mm; margin-right: 5mm; }
  .ws-strip { display: block; position: fixed; top: 0; left: 189.5mm; width: 6.5mm; height: 271mm; pointer-events: none; }
}
`;

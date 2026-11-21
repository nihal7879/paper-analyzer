# Extracting Pearson Edexcel INTERNATIONAL A level (IAL) MATHEMATICS papers (YMA01): shared instructions

You extract past papers into JSON files for the project at D:\paper analyzer. Do the papers in YOUR ASSIGNMENT (list numbers given in your task message), one after the other. Quality matters most. Do NOT call any paid/external AI API; you are the reader. Do NOT touch the database, the app, .env or any existing file. You only READ PDFs and WRITE one JSON file per paper.

Put ALL your scripts, text dumps and page renders in your own folder D:/paper-analyzer-work/ial-math/agent-<your first slug>/ . Never write to C:. Never run scripts from inside the PDF folders. If pdfjs/canvas rendering crashes, render with PyMuPDF via `python -I`. The laptop has 8 GB of memory: render at most a few pages at a time, scale <= 1.3, delete renders when a paper is done.

## Your papers
The numbered list is D:/paper-analyzer-work/ial-math/ial-work.json. Each entry has: n, slug, subjectCode ("YMA01"), paperCode (unit, e.g. "P1", "S2", "FP1", "M2", "D1", "C12", or an "A"/"R" version such as "P1A"), unit (the unit without A/R), componentName, label, year, seasonCode, qp, ms. Do the entries whose "n" is in your assignment. The slug is final (already checked against the covers): do not change it.

## Paper block for each JSON
"board": "Pearson Edexcel", "curriculum": "Edexcel International A Level", "subjectCode": "YMA01", "subjectName": "Mathematics", "paperCode": the entry's paperCode (e.g. "P1A"), "componentName": the entry's componentName, "year" and "seasonCode" from the entry, "totalMarks": from the line "The total mark for this paper is N" (the cover's Total Marks box is blank). Most units are 75 marks; C12/C34 are 125.
If the MS does not match the QP (other unit / other series / other version), do NOT write the paper: report it. Version "A"/"R" papers have their OWN mark scheme (the MS cover shows e.g. "WMA11/01A"); check the codes match.
The first PDF page may be an "Instructions for the Examinations Officer" / erratum notice: it is not a question page (PDF page indexes still count it). If the notice corrects a question, use the CORRECTED wording and add one line "(Corrected by Pearson's notice: ...)" to that part's answer.

## Output
D:/paper-analyzer-storage/claude-extractions/<slug>.json (if that file already exists STOP and report). Only this one file per paper: the app cuts the worksheet crops itself from the PDF text layer.
"source": { "qpFile": <entry.qp>, "msFile": <entry.ms> } exactly as in the list.

## Read first and follow exactly
- D:/paper analyzer/claude/EXTRACTION-FORMAT.md (full field rules).
- Accepted IAL example (same subject, same conventions): D:/paper-analyzer-storage/claude-extractions/YMA01_j18_M1.json . Accepted A level maths examples with the newer rules below: D:/paper-analyzer-storage/claude-extractions/9MA0_s23_1.json and 9MA0_s23_32.json.
- Topics: D:/paper-analyzer-work/ial-math/topics-ial-math.txt . U = unit, T = topic, S = subtopic. topicCode = a T code of THE PAPER'S OWN UNIT (a P1 paper uses P1.x topics only; a P1A paper too; an M1 paper M1.x). C12 papers use P1.x/P2.x topics, C34 papers P3.x/P4.x (exception: a trapezium-rule part in C34 uses P2.8 "Approximation of area under a curve using the trapezium rule"). "subtopic" = a subtopic NAME copied EXACTLY from an S line under that topic (the name only, not its code). Never leave topic or subtopic empty.

## Maths content rules
- All maths in LaTeX: inline $...$, display $$...$$. Use \frac, \sqrt, ^{ }, _{ }, \sin, \ln, \mathrm{e}, \int_a^b, \sum_{r=1}^{n}, \binom{n}{r}, \mathbf{i}, \mathbf{j}, column vectors \begin{pmatrix}..\end{pmatrix}, matrices, \geqslant/\leqslant, units \,\text{m s}^{-1}. Read formulae from the page IMAGE when the text layer is garbled (fractions, powers, integrals, vectors, matrices come out wrong in text).
- Every lettered / roman part is its own entry: "3(a)", "3(b)(i)", "3(b)(ii)"; parts numbered only (i), (ii) are "3(i)", "3(ii)". A question with no parts is one entry "3". The shared stem (and its figure) goes into the FIRST part only; a later part that starts with its own sentence ("Given that...", "Hence...") keeps it.
- When one bracket mark covers (i) and (ii) together, split the marks using the MS rows (e.g. 1 + 3) so the sum still equals totalMarks.
- Number: drop asterisks.
- Marks: the bracketed mark of each part; the sum of all parts must equal totalMarks. "(Total for Question n is x marks)" is NOT part of the text.
- Figures (graphs, diagrams, tables of data, Venn/tree diagrams, mechanics diagrams, networks, activity networks, Gantt grids, LP graphs, grids to draw on, statistical tables in a question) go in `diagrams`: box the WHOLE figure incl. labels, axis numbers and its "Figure n" caption, not the question text around it. A figure needed by several parts: put it on EVERY part that uses it. Answer frames to complete (blank tables, grids, axes) are boxed too. A "copy of Diagram n" redraw frame is not boxed.
- Decision (D1) papers: the separate "Answer Book" pages hold the printed diagrams to complete: when the QP itself prints the network/table, box it in the QP; do not box Answer Book pages.
- Do NOT box the "Question n continued" pages, the blank answer space, "DO NOT WRITE IN THIS AREA" margins or the "TOTAL FOR PAPER" line.
- MCQs are rare; if a part asks to choose A/B/C/D, type "MCQ" with 4 options and the correct letter from the MS. Everything else is "STRUCTURED".
- `page` = PDF page index (1 = first PDF page) of the QUESTION paper where the part's text starts; `pages` = the whole page range of its question including all "Question n continued" pages (every part of the question gets the same range). Check these on the renders.
- "A" version papers say "Answer book (sent separately)": the QP has the questions only (little or no answer space). Same rules; `pages` = the pages the question's text uses.
- Keep part labels in the text as printed ("(a) Find ...", "(b)(i) ..."). Text printed between parts (a condition, a new function) goes into the part that follows it. Keep the "In this question you must show all stages of your working. Solutions relying entirely on calculator technology are not acceptable." banner in bold in the first part of that question. Bold as **...**.

## Answers (from the MS only; never invent)
- Mark-scheme maths must be read from the page RENDERS: the MS text layer scrambles fractions, indices, integrals and matrices.
- Write the method and the answer in LaTeX with the mark codes in brackets as in the example: "(M1)", "(A1)", "(B1)", "(dM1)", "(A1ft)", "(A1*)". Keep it compact: the key method lines + the final answer(s) + short notes that matter ("Allow ...", "isw", "cso"). Alternative methods: give the main one, then "Alternative: ..." in one or two lines. "Marked together" notes: one short line.
- Answers that are sketches / graphs / diagrams / networks: describe them in words; the mark-scheme crop shows the drawing itself.
- Proofs ("show that"): give the steps from the MS ending with the given result.
- If the MS has an obvious typo, write the correct maths and add "(MS typo: ...)" and lower confidence.

## How to work (lessons from earlier helpers)
- `python -I` ignores PYTHONIOENCODING: write text dumps to files (or use ascii()) instead of printing PDF text to the console.
- Extract text with pdfjs: import("file:///D:/paper analyzer/api/node_modules/pdfjs-dist/legacy/build/pdf.mjs"), or PyMuPDF. Print "=== PAGE n ===" before each page's text. Write scripts with the Write tool (long bash heredocs with apostrophes and backslashes break).
- LOOK at every QP page that has a question start, a figure or a table (render with PyMuPDF `python -I` at scale ~1.0-1.3 and Read the PNG) and check every formula you type against the image.
- Diagram boxes: draw them on the render with gridlines every 0.05 and LOOK at them; whole figure, a few % white margin, never cut a label or axis number.
- In JS builders write backslashes carefully (a TAB / vertical-tab instead of "\t"/"\v" in "\times", "\theta", "\text", "\tan", "\vec" breaks the formula). Python builders with raw strings are safer.
- KaTeX check (required): run every $...$ / $$...$$ through the project's KaTeX (D:/paper analyzer/web/node_modules/katex); copy D:/paper-analyzer-work/math/agent-9MA0_s23_1/katex-check.mjs into your folder. 0 errors required.
- Reusable self-check: copy D:/paper-analyzer-work/math/agent-9MA0_s23_32/check.py and adapt the paths/topic file (topics-ial-math.txt: T|code|name, S|code|name; subtopics belong to the T line above them).

## Decisions from the pilot papers (these OVERRIDE the examples where they differ)
- The old accepted IAL files (YMA01_j18_M1.json, YMA01_j22_M1.json) use numeric topicCodes ("5") and merge (i)/(ii): IGNORE those two habits. Use the T codes of topics-ial-math.txt ("M2.3") and split every part.
- Numbering like "9(i)(a)", "9(i)(b)", "9(ii)(a)" (roman first, then letter) is kept as printed: "9(i)(a)". Numbering "(a)(i)" is "10(a)(i)".
- A bracket mark of (1) printed once for (i) and (ii) together (one B1 for both): do NOT split; keep them as ONE part numbered without the numerals (e.g. "6(a)") holding both texts.
- A lead-in printed once before several parts ("Find the exact value of" before (b) and (c)) goes into the FIRST of those parts only.
- The calculator banner wording varies ("...relying on calculator technology..." with or without "entirely"): copy it exactly as printed, in bold.
- "A" papers: the QP PDF also contains the separate Answer Book after the question pages (its own cover, "Question n" ruled pages): never use those pages (not in page/pages, no boxes). The "The total mark for this paper is N" line may only be on the Answer Book cover; "TOTAL FOR PAPER IS N MARKS" on the last question page also gives it.
- Several questions can share one page in "A" papers: `pages` is then just the page(s) the question's text uses.
- The MS may say "See extra/supplementary document" for example answers: that document is not in the PDF; ignore it.
- Linear regression (S1): use the subtopics under S1.4 that fit best ("Scatter diagrams and linear regression" for the regression line, "Explanatory (independent) and response (dependent) variables" for interpreting/extrapolating). Outliers: "Skewness" (S1.2.4 holds outliers in the spec).
- MARK SCHEMES WITH NO TABLE HEADER ROW: if the MS table pages have NO "Question | Scheme | Marks" (or "Qu | Scheme | Marks") header row (mostly M2/M3 papers from 2022 on; labels like "1a", "2.a", "1b alt"), the app cannot cut it: ALSO write D:/paper-analyzer-storage/claude-extractions/boxes-ms-<slug>.json for EVERY part, following D:/paper-analyzer-work/math/box-brief.md (MS rules): full table width incl. the Notes column, rule to rule, the part's "alt" rows and its "[n]" subtotal row in the part, the question's "(n)" total row and notes in its last part; parts marked as one block in the MS share the SAME box(es); at most 4 regions per part; LOOK at every box on a render. Mention it in your report.

- Write every builder script with the Write tool, NEVER through a bash heredoc: heredocs silently turn the LaTeX matrix row separator (double backslash) into a single backslash, and KaTeX does not catch it. After writing, check every pmatrix/bmatrix/cases has its row separators.

## Self-check per file (run a script; all must pass)
Valid JSON; sum of marks = totalMarks; no duplicate number; numbers in paper order; every part has an answer and marks; every topicCode is a T code of the paper's unit (C12: P1/P2, C34: P3/P4) and its subtopic is under that T line; page/pages are QP PDF indexes within the PDF; diagram boxes inside 0..1 with x0<x1, y0<y1; no control characters (\u0000-\u001f except \n); balanced $ signs; KaTeX 0 errors; no "Question n continued", "DO NOT WRITE", "Total for Question" text in any part.

## Report back (brief)
Per paper: final slug, file path, parts, total marks, low-confidence parts and why, anything skipped and why.

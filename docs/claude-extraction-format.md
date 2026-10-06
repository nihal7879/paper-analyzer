# Paper extraction format (for Claude Code, no API)

Read one **question paper (QP)** and its **mark scheme (MS)** PDF and write ONE JSON file in the exact
format below. The app imports it (renders pages, crops diagrams, saves to MySQL).

## Output file

`D:/paper-analyzer-storage/claude-extractions/<slug>.json`
where `<slug>` = `<subjectCode>_<seasonCode><yy>_<paperCode>` e.g. `8PH0_s16_01`.

```json
{
  "source": { "qpFile": "<full path of QP pdf>", "msFile": "<full path of MS pdf>" },
  "paper": {
    "board": "Pearson Edexcel",
    "curriculum": "Edexcel AS Level",
    "subjectCode": "8PH0",
    "subjectName": "Physics",
    "paperCode": "01",
    "componentName": "Core Physics I",
    "year": 2016,
    "seasonCode": "s",
    "totalMarks": 80
  },
  "questions": [
    {
      "number": "11(a)(ii)",
      "type": "STRUCTURED",
      "marks": 2,
      "text": "Markdown question text with LaTeX: a ball of mass $0.25\\,\\text{kg}$ ...",
      "options": [],
      "topicCode": "2",
      "subtopic": "Momentum",
      "difficulty": "MEDIUM",
      "keywords": ["momentum", "collision", "impulse"],
      "page": 7,
      "pages": [7],
      "diagrams": [{ "page": 7, "box": { "x0": 0.12, "y0": 0.30, "x1": 0.88, "y1": 0.62 } }],
      "answer": { "correctOption": null, "text": "$\\Delta p = m\\Delta v$ (1)\n\n$= 1.5\\,\\text{N s}$ (1)" },
      "confidence": 0.9
    }
  ]
}
```

## Field rules

| Field | Rule |
|---|---|
| `seasonCode` | `j` January, `m` Feb/March, `s` May/June, `w` Oct/Nov, `x` Specimen. Read the month/year **from the cover**, not only the file name. |
| `paperCode` | As printed, e.g. `01` for Edexcel `8PH0/01`. |
| `totalMarks` | Total printed on the cover (used as a self-check). |
| `number` | Full number as printed: `1`, `11(a)`, `11(a)(ii)`. Every lettered/roman part is its **own entry**. Never just `b` or `(ii)`. |
| `type` | `MCQ` (A–D options), `STRUCTURED` (short calculation / short answer parts), `THEORY` (explain / describe / extended writing). |
| `marks` | The number in brackets at the end of the part, e.g. `(3)` → 3. MCQ → 1. |
| `text` | Faithful copy of the question part. If parts share a stem (text before part (a)), put the stem at the start of the FIRST part only. Do **not** include answer lines, dotted lines, "(Total for Question X = N marks)" or the mark in brackets. Use LaTeX for ALL maths, symbols and units: `$v = u + at$`, `$4.0\,\text{m s}^{-1}$`, `$\Omega$`, `$\times 10^{-3}$`. Tables can be Markdown tables. |
| `options` | MCQ only: `[{ "label": "A", "text": "..." }, ...]` with LaTeX. Otherwise `[]`. Don't repeat options in `text`. |
| `topicCode` | Choose ONLY from the topic list given in your task. |
| `subtopic` | Short, specific, e.g. `Momentum and impulse`, `Resistivity`, `Young modulus`. |
| `difficulty` | `EASY` recall / one step, `MEDIUM` 2–3 steps, `HARD` multi-step / unfamiliar context / extended answer. |
| `keywords` | 5–10 lowercase concept keywords a student would search for. |
| `page`, `pages` | **PDF page index** (1 = first page of the PDF file), not the printed page number. |
| `diagrams` | Every figure / graph / circuit / table image that belongs to this part: page index + box as **fractions of the page** (0..1, top-left origin). Generous margins are fine; an admin can fine-tune the crop. Put a diagram on the first part that needs it. `[]` if none. |
| `answer` | From the MARK SCHEME. MCQ: `{ "correctOption": "B", "text": "B" }`. Others: `correctOption: null`, `text` = the marking points as Markdown, one per line, keeping the marks like `(1)`, with LaTeX. Include "Accept"/"Do not accept" notes only if short and useful. `null` only if the MS truly has no answer. Never invent answers. |
| `confidence` | 0..1. Lower it when text is hard to read, a diagram box is a rough guess, or the answer match is uncertain. |

## Self-check before finishing

1. Sum of `marks` = `totalMarks` on the cover (report any difference).
2. Every question part in the QP is present, in order; no duplicate `number`.
3. Every part has an answer from the MS (report any without).
4. The file is valid JSON (run `node -e "JSON.parse(require('fs').readFileSync('<file>','utf8'))"`).

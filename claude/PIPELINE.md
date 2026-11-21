# Pipeline: from source PDFs to the live site

The current method, in the order it runs (IAL Maths, November 2026). Other boards use the same steps with their own gate script (`math-gate.sh`, `aqa-gate.mjs`).

```
Source PDFs ─► 1 list ─► 2 subject + topics ─► 3 pilot ─► 4 Claude helpers read ─► JSON
   ─► 5 gate (Node) ─► CHECK? ─► 6 hand boxes (Claude) ─► re-gate ─► all OK
   ─► 7 final checks ─► 8 publish on dev ─► 9 similar questions ─► 10 PDF check
   ─► 11 upload folder + pictures (WinSCP) ─► 12 prod DB copy (owner's yes) ─► 13 deploy + live check
```

Who does what:
- **Claude** (helpers plus the main session) does the reading and judging work: reading pages, typing questions and answers in LaTeX, choosing topics, drawing boxes, reviewing.
- **Node / Python scripts** do the mechanical work: importing, cutting crops, checking and publishing.

## 1. Paper list
- Group the source files into question paper + mark scheme pairs. Read the cover to get the unit, season and version (A/R).
- Drop duplicates, wrongly named copies and papers that are already live.
- Output: `ial-work.json`, one entry per paper: `n, slug, subjectCode, paperCode, unit, componentName, label, year, seasonCode, qp, ms`.
- Slug: `<subject>_<season><yy>_<unit>`, for example `YMA01_j22_P3`. Seasons: j / m / s / w / x (x = specimen or sample).
- Check that the mark scheme matches the question paper (unit, series, version, log number). If it doesn't, **skip the paper** and ask the owner for the right file.

## 2. Subject, components and topics (dev DB)
- Topic file `topics-ial-math.txt` comes from the official specification. Line types: `U` = unit, `T` = topic (spec heading), `S` = subtopic (spec item).
- A setup script adds the subject, components and topic tree on dev (`add-ial-math.mjs`).
- `rename-subtopics.py` fixes names that got cut off. It updates the file, the dev DB and the extraction JSONs.

## 3. Pilot
- Read 4 papers fully and look at their PDFs.
- Add the decisions to the helper brief, under "Decisions from the pilot papers". Examples:
  - split (i)/(ii) marks using the mark-scheme rows;
  - put the calculator banner in bold;
  - how to handle "A" papers that include an answer book.

## 4. Claude helpers read the papers
- Each helper gets one list number and the brief [tools/briefs/ial-brief.md](tools/briefs/ial-brief.md). The owner chooses how many run at once (up to 6, or 1 at a time).
- The helper reads the PDF text and looks at page renders. It types every part with:
  - text and answer in LaTeX;
  - marks, topic and subtopic;
  - page numbers;
  - figure boxes.
- It runs a self-check and a KaTeX check, which must show 0 errors.
- Output: `D:/paper-analyzer-storage/claude-extractions/<slug>.json`. The format is in `claude/EXTRACTION-FORMAT.md`.
- If a mark scheme has no table header row, the helper also writes `boxes-ms-<slug>.json`.

## 5. Gate (Node, no Claude use): `tools/gate/ial-gate.sh <slugs>`
Each paper runs through these steps one at a time. A lock folder means only one gate runs at once, and the gate waits for free memory.
1. **Import** the JSON into the dev DB with `dist/cli/import-extractions.js`. It retries up to 5 times if the DB can't be reached.
2. **Link the component** with `ial-comp.mjs`.
3. **Cut** the question-paper and mark-scheme crops from the PDF text layer: `question-crops.service.ts`, through `dist/cli/question-crops.js`.
4. **Apply hand boxes** if `boxes-*.json` / `boxes-ms-*.json` exist (`apply-boxes-4100.mjs`, through the API).
5. `cover-num.py` for papers whose text layer can't be read (listed in `unreadable.txt`).
6. **Checks:**
   - `regions.mjs`: every part has QP and MS crops, MS crops are in order, at most 4 regions;
   - `pagecheck.py`: the crop is on the part's own page;
   - `autocheck.mjs`: text cut off at the edges;
   - `scan-overlap.mjs`: repeated stems or figures, numbers still printed;
   - `scan-all.mjs`: totals inside crops;
   - `widecheck.py`: mark-scheme text cut at the sides.
7. Result line in `gate.log`: `GATE <slug> OK` or `GATE <slug> CHECK: <problems>`.

## 6. Hand boxes for what the cutter missed (Claude)
- The cutter fails on unusual layouts, for example:
  - "A" papers with an answer book inside the question PDF;
  - labels like "1a", "(ci)", "(i)+(ii)" or "4. (i) (a)";
  - mark schemes with no ruled lines;
  - question papers whose text layer is garbled.
- A helper, following [tools/briefs/box-brief-ial.md](tools/briefs/box-brief-ial.md), draws the boxes on page renders and looks at them. It also redraws the part just before each failing part.
- Output: `boxes-<slug>.json` (QP) and `boxes-ms-<slug>.json` (MS) in `claude-extractions`. Each part has at most 4 regions.
- The gate re-applies these files on every run, so a re-cut never loses them. Re-gate until every paper shows OK.

## 7. Final checks
- `rename-subtopics.py` and `dbg/topicdiff.mjs`: no labels that differ from their subtopic.
- `yearcheck.py`: year and season match the cover.
- `matcheck.py` / `matfix.py`: matrices with collapsed rows.
- Everything in [QA.txt](QA.txt).

## 8. Publish on dev
- `publish-4100.mjs`: runs verify-all, then publish.
- Setting `SKIP_SIMILAR_ON_PUBLISH=1` before starting the API skips the slow similar-questions rebuild on each publish.

## 9. Similar questions
- `refresh-subjects.mjs <subject id>` runs once after the whole board is published (`dist/cli/refresh-similar.js`).

## 10. PDF check
- Needs the web app running on port 3000.
- `mkpdf.mjs` makes sample worksheets. Look at them:
  - one question;
  - a topic search with 30+ questions;
  - a mixed selection;
  - answers at the end.

## 11. Upload folder and pictures
- Copy the board's paper folders (`papers/<slug>/` with the crop pictures) into an upload staging folder, for example `D:/paper-analyzer-upload3/papers`.
- The owner uploads them with WinSCP Synchronize:
  - direction **Remote**, "New and updated" ticked, **"Delete files" unticked**;
  - check the preview counts before you start.

## 12. Production database copy (only with the owner's yes)
- Take a fresh backup of production first (`sync-db.mjs backup`).
- `copy-subjects-to-prod.mjs` with `CODES=<subject codes>`: run a dry run first, then the real copy, all in one transaction.
- `REPLACE_EMPTY=<code>` replaces a production subject only if it has 0 papers.

## 13. Deploy and check the live site
- Only when the code changed, and only when the owner asks for a release.
- The release zip has `api/{dist,db,package.json,package-lock.json}` and `web/dist`, with no `.env`. It's made with `make-release-zip.py`.
- Upload it to `/home/nihal_shaikh/paper-analyzer/inbox`, then run `ssh nihal_shaikh@195.250.20.169 paper deploy`.
- Check the live site with real PDFs.

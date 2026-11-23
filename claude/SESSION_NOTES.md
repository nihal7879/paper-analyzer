# Session notes — current state

Last updated: **2026-11-23**. Older notes: [history/](history/).

## Environments
| | Where | Notes |
|---|---|---|
| API | NestJS, `api`, port 4100, run from `dist` (`node dist/main.js`) | Build: `npx tsc -p tsconfig.build.json` (nest build ran out of memory) |
| Web | React + Vite, `web`, port 3000 | Needed for PDF downloads (the API prints the web `/print` page) |
| Dev DB | `paper_analyzer` on 122.170.99.55 | Network to it dropped many times on 2026-11-21; the IAL gate now retries |
| Production | 195.250.20.169, https://paperanalyzer.millicenttechnologies.com/ | Office network only. SFTP + `ssh nihal_shaikh@195.250.20.169 paper <status/logs/restart/deploy/...>` |
| Storage | `D:/paper-analyzer-storage` (laptop), `/srv/apps/paper-analyzer/storage` (server) | See [STRUCTURE.md](STRUCTURE.md) |
| Work scripts | `D:/paper-analyzer-work` | Copies of the key ones in [tools/](tools/) |

## Boards and subjects

### Edexcel Maths (8MA0 AS / 9MA0 A Level): 57 papers, 1,598 questions
- Done and published on **dev**.
- Production copy is **ON HOLD**: the owner said "no" on 2026-11-20. Ask again before copying.
  - Dry run of `copy-subjects-to-prod.mjs` (CODES=8MA0,9MA0, REPLACE_EMPTY=9MA0) was OK.
- **Owner must re-upload 2 picture folders** from `D:/paper-analyzer-upload3/papers`: `9MA0_s23_31` and `8MA0_s22_21`. Their crops were re-made after a test import overwrote them.

### Maths on dev, all DONE 2026-11-23 (published + similar questions; production NOT touched)
| Subject (dev id) | Papers published | Similar questions |
|---|---|---|
| IAL YMA01 (5) | 229 (21 older M1 + 208 new) | 5,527 |
| AQA AS 7356 (23) | 16 | 531 |
| AQA A-level 7357 (24) | 24 | 936 |
| Oxford AQA 9660 (25) | 59 (units P1, PSM1, P2, S2, M2) | 1,801 |
- **IAL skipped:** Jan 2022 FP1 (file is the FP3 mark scheme) and Jan 2026 M2A (file is an Oct 2025 mark scheme): need the correct files from the owner. Not in the DB.
- **Oxford June 2025:** the 5 mark schemes are "Pre-Standardisation" drafts (`oxf-math/draft-ms.txt`); published on dev like the rest.
- **Oxford June 2025 drafts:** the owner said KEEP them (2026-11-23); swap in the final mark schemes when they come.
- **Fixed 2026-11-23:** 9660_s19_3 answer pages showed "O7": the MS label white-out reached above the crop top and erased
  the header "Q" tail. The white-out now stops at the crop top; the paper was re-cut offline (no re-import).
- **Fix tools** (work folder, run on the gate's flag lines; all write the box files so re-cuts keep them):
  - `aqa-math/sliverfix.py`: removes empty MS strips at a page top (rows carried over with no text).
  - `ial-math/rulesnap.py`: MS edge that cuts a line → onto the table rule above the next part's label (or the white gap).
  - `ial-math/thinfix.py`: one-row MS parts under 0.02 tall → shared crop with touching siblings, or grown evenly.
  - `aqa-math/setbox.py`: one hand edge (`setbox.py <slug> QP|MS <part> <page> [drop] y0=.. y1=..`).
  - `math/apply-boxes-4100.mjs` / `apply-ms-4100.mjs`: short boxes now grow EVENLY to 0.0205 (not down into the next row).
  - After a re-check re-applies boxes, run `chem/tools/fix-colon-num.mjs --apply` again where a printed number was covered.
- Work folders: `D:/paper-analyzer-work/ial-math`, `aqa-math`, `oxf-math` (`gate.log`, `tally.py`, `dbg/`).
- PDF samples (2026-11-23): `ial-math/look/pdf/`.

### Other subjects
- Earlier boards and subjects are covered in [history/](history/): Physics, KS3, Maths, the Chemistry boards, and AQA / Oxford AQA.
- Check the real counts with the status script before relying on those notes.

## Production (2026-11-23)
- Backup first: `D:/paper-analyzer-work/remote-backup-20261123`. Copied with `chem/tools/copy-subjects-to-prod.mjs`:
  8MA0, 9MA0 (old empty shell replaced), 7356, 7357, 9660 as new subjects; YMA01 REPLACED with the dev version
  (new mode `REPLACE_SUBJECT=YMA01`: old 21 M1 papers / 22 topics removed, 229 papers / 16 units / 331 topics added).
- Pictures: `D:/paper-analyzer-upload-maths/papers` (385 Maths folders); the owner uploads with WinSCP.
- Releases made, NOT deployed yet: `release-20261123.zip` (today's GitLab commit) and `release-20261123b.zip`
  (+ background PDF jobs from `claude/change.txt`, + worksheet edge-trim fix). Deploy the **b** one.

## Open items
- Owner: re-upload 2 Edexcel Maths folders; send the 2 correct IAL mark schemes.
- Code findings from an earlier review are still not fixed:
  - offline mode can delete a paper before the AI fails;
  - crop text passes should be best-effort;
  - browse page clears the selection on automatic course reset.
- The admin papers page should be grouped by Subject → Board → Level (not built).
- Uncommitted code (2026-11-23), built into `api/dist` (the dev API runs it, started with `SKIP_SIMILAR_ON_PUBLISH=1`):
  - `question-crops.service.ts`: AQA / Oxford AQA maths cutter (QP + MS); old Oxford "Q1 | Solution | Mark | Total"
    header; MS hand-box snap never snaps onto a "rule" that runs through text (yellow highlights);
  - `worksheet.tsx`: an identical question crop shared by several parts prints once (like the MS crops).
  - MS label white-out never reaches above the crop's own top (the "O7" fix).
  - `api/dist-aqa` is a leftover build of the same code. It shows in `git status` because `.gitignore` has `dist/` only.
    Never commit it; it can be deleted (aqa-gate.sh falls back to `dist` when it is gone).

## First things in a new session
1. Do not assume background jobs are running. Check for node processes and the gate lock (`ial-math/.gate-lock`).
2. Check the API at `http://localhost:4100/api/health` and that the dev DB answers.
3. Count the real state (extractions on disk, last `GATE` line per paper in `gate.log`) and tell the owner before continuing.

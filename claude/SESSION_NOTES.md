# Session notes — current state

Last updated: **2026-11-21**. Older notes: [history/](history/).

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

### IAL Maths (YMA01): in progress on dev
- **Papers:** 208 new papers, plus 21 IAL M1 papers already live.
- **Skipped:** 2 papers whose mark-scheme file is wrong: Jan 2022 FP1 (the file is the FP3 mark scheme) and Jan 2026 M2A (the file is an Oct 2025 mark scheme). They need the correct files from the owner.
- **Reading:** all 208 are read (JSON in `claude-extractions`).
- **Missing crops:** 52 papers had them; all were boxed by hand (`boxes-*.json` / `boxes-ms-*.json`).
- **Gate:** a re-run with DB retry started at about 13:30 on 2026-11-21, on 121 papers.
- **Next:**
  1. Fix what is still flagged (mark-scheme text cut at the sides, autocheck warnings).
  2. Re-gate until every paper passes.
  3. Run the final topic, metadata and matrix checks.
  4. Publish on dev, then refresh similar questions for YMA01.
  5. PDF sample check (see QA.txt).
- Work folder: `D:/paper-analyzer-work/ial-math` (`ial-work.json` list, `gate.log`, `dbg/` lists).

### Other subjects
- Earlier boards and subjects are covered in [history/](history/): Physics, KS3, Maths, the Chemistry boards, and AQA / Oxford AQA.
- Check the real counts with the status script before relying on those notes.

## Open items
- Owner: re-upload 2 Edexcel Maths folders; send the 2 correct IAL mark schemes.
- Code findings from an earlier review are still not fixed:
  - offline mode can delete a paper before the AI fails;
  - crop text passes should be best-effort;
  - browse page clears the selection on automatic course reset.
- The admin papers page should be grouped by Subject → Board → Level (not built).
- Uncommitted code from the IAL work:
  - `question-crops.service.ts`: old IAL layout, stats mark schemes, notes under tables, roman-first numbering;
  - `paper-checks.ts`;
  - `worksheet.tsx`, `pdf-download.tsx`, `api.ts`.

## First things in a new session
1. Do not assume background jobs are running. Check for node processes and the gate lock (`ial-math/.gate-lock`).
2. Check the API at `http://localhost:4100/api/health` and that the dev DB answers.
3. Count the real state (extractions on disk, last `GATE` line per paper in `gate.log`) and tell the owner before continuing.

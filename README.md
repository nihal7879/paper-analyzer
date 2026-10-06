# Paper Analyzer – Phase 0 (demo)

Upload a past paper PDF (+ mark scheme) → AI extracts every question (text with LaTeX,
MCQ options, marks, topic, difficulty, cropped reference images, answers) → view question
cards with Reveal / Hide answer and the exact source (`Physics · May/June 2026 · Paper 11 · Q1`).

```
apps/api   NestJS API  (upload, PDF → images, AI extraction, files on local disk)
apps/web   React + Vite UI  (React Router, Tailwind + shadcn/ui + KaTeX)
.env       shared config for both apps (copy from .env.example)
```

## Run locally

Needs Node 20+ (tested on Node 24).

```bash
cp .env.example .env          # then edit ADMIN_PASSWORD, JWT_SECRET
cd apps/api && npm install && cd ../web && npm install && cd ../..
npm run dev:api               # http://localhost:4100/api
npm run dev:web               # http://localhost:3000
```

Click **Upload** → enter `ADMIN_PASSWORD` → drop `9702_s26_qp_11.pdf` and `9702_s26_ms_11.pdf`
→ details auto-fill from the file names → **Process with AI**.

## AI

- `AI_PROVIDER=mock` – sample questions, no key needed (default, for building the UI).
- `AI_PROVIDER=openai` + `OPENAI_API_KEY` + `OPENAI_MODEL` – real extraction.
  Use a current vision-capable model with Structured Outputs; switch models in `.env` only.
  The key is used by the API only and never sent to the browser.

## Storage

Everything goes under `STORAGE_ROOT` (default `D:/paper-analyzer-storage`):

```
papers/9702_s26_11/
  paper.json        paper details        status.json   processing progress
  qp.pdf  ms.pdf    originals            extraction.json  all questions + answers
  pages/qp-p1.png   rendered pages       questions/q2-img1.webp  cropped figures
```

All file access goes through `StorageService` and all background work through `JobService`,
so S3 / BullMQ can replace them later without touching the rest of the code.
The JSON files mirror the planned MySQL tables (step 2).

## Notes

- If npm fails with `Cannot read properties of null (reading 'edgesOut')`, the global npm is
  too old (10.2.x). Use the npm bundled with Node:
  `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" install`
- The frontend reads `VITE_API_URL` from the root `.env` (only `VITE_*` variables reach the browser).
- Phase 0 serves every stored file at `/files/...` (including original PDFs). Protected
  downloads come with the download feature.

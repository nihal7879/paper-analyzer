# Structure: repo, storage, backend, database

## Repo (`D:/paper analyzer`)
```
apps/
  api/                    NestJS API (port 4100)
    src/                  source (modules below)
    db/
      migrations/         knex migrations (tables below)
      seeds/              catalog seed (boards, curriculums, subjects)
      knexfile.mjs
      import-storage.mjs  one-off: storage JSON -> DB
    dist/                 build output (git-ignored), served with `node dist/main.js`
    .env                  API settings + secrets (git-ignored; copy from .env.example)
  web/                    React + Vite + TypeScript UI (port 3000)
    src/pages/            browse, similar, review, upload, admin-papers, admin-settings, print, not-found
    src/components/       question cards, worksheet, pdf-download, sort menu, ui/ (shadcn)
    src/lib/              api client, helpers
    public/               icons, manifest
claude/EXTRACTION-FORMAT.md  extraction JSON format
claude/                   this handbook (rules, session notes, pipeline, QA, tools)
(DB dumps are kept outside the repo, in D:/paper-analyzer-work/backups)
```

## Storage (`STORAGE_ROOT`, default `D:/paper-analyzer-storage`)
```
papers/<slug>/
  qp.pdf  ms.pdf          the original question paper and mark scheme
  pages/                  rendered page images
  questions/              crop pictures: q<id>-full-p<page>-<n>-<hash>.jpg (question and mark-scheme crops)
claude-extractions/
  <slug>.json             what the Claude helpers read (questions, answers, topics, pages, figure boxes)
  boxes-<slug>.json       hand-drawn question-paper crop boxes (at most 4 regions per part)
  boxes-ms-<slug>.json    hand-drawn mark-scheme crop boxes
local-extractions/        older local runs
versions/                 saved paper versions
models/                   local embedding model files (similar questions)
```
- The server copy is `/srv/apps/paper-analyzer/storage`, with the same layout.
- Crop pictures go to the server with WinSCP. The database rows point to them by file name.

## Work folder (`D:/paper-analyzer-work`, outside the repo)
- `math/`, `chem/`, `ial-math/`: per-board work: lists, gate scripts, checks, logs, `dbg/` lists.
- `agent-<slug>/`: each helper's scratch scripts (no PDFs).
- `sync-db.mjs`, `copy-subjects-to-prod.mjs`, `make-release-zip.py`: database and production tools.
- Copies of the key scripts: [tools/](tools/).

## Backend modules (`api/src`)
| Module | What it does |
|---|---|
| `main.ts`, `app.module.ts` | Nest bootstrap, `/api` prefix, serves stored files at `/files` |
| `config/env.ts` | Reads and validates `.env` |
| `auth/` | Admin login (password → JWT), `admin.guard.ts` |
| `catalog/` | Boards, curriculums, subjects, components, seasons, topics |
| `papers/` | Papers and questions: controller, repository, service. Also: `import.service.ts` (import extraction JSON), `bank-search.service.ts` (student search, filters, sorting), `paper-checks.ts` (publish checks: numbering, marks, crops), `paper-label.ts`, `paper-keys.ts`, `versions.service.ts` |
| `processing/` | PDF → images (`pdf-images.ts`), `question-crops.service.ts` (cuts QP and MS crops from the PDF text layer: labels, mark-scheme tables, notes, old IAL layout), `merge.ts`, `processing.service.ts` |
| `ai/` | AI router: Claude, OpenAI, Gemini, mock. Prompts. Keys only from `.env`. Bulk reading is done by Claude Code helpers instead. |
| `similarity/` | Embeddings plus similar-question lists |
| `pdf/pdf.service.ts` | Worksheet PDFs: puppeteer prints the web `/print` page (normal or past-paper style) |
| `storage/` | All file access (`StorageService`) |
| `jobs/` | Background jobs (`JobService`) |
| `settings/` | Admin settings (AI provider, masked keys) |
| `cli/` | `import-extractions`, `question-crops`, `refresh-search`, `refresh-similar` (built to `dist/cli/*.js`) |

## Database tables (MySQL `paper_analyzer`)
- **Catalog:** `boards`, `curriculums`, `subjects`, `components`, `seasons`, `topics`, `concepts`, `topic_concepts`.
- **Papers:** `papers`, `paper_versions`, `processing_jobs`.
- **Questions:** `questions`, `answers`, `question_images` (crops: kind FULL, source QP/MS, boxes), `question_keywords`, `question_embeddings`.
- **Other:** `users`, `audit_logs`.
- Migrations are in `api/db/migrations` (`20261005_0001_core` … `20261030_0008_topic_year_group`).

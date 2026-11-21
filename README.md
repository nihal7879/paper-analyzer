# Paper Analyzer

Past-paper question bank. Exam papers and mark schemes are read into questions (text with LaTeX, marks, topics, answers, cropped pictures of the original question and mark scheme). Students and teachers search by board, subject, topic and difficulty, see similar questions, and download worksheet PDFs.

**Start with [claude/README.md](claude/README.md)**: rules, current state, full pipeline, folder and storage structure, QA checklist.

```
api   NestJS API (port 4100): papers, crops, search, similar questions, PDFs
web   React + Vite UI (port 3000)
claude/    handbook, extraction JSON format, tools
```

## Run locally

Needs Node 20+ (tested on Node 24).

```bash
cp api/.env.example api/.env   # then edit ADMIN_PASSWORD, JWT_SECRET, DB_*
cp web/.env.example web/.env
cd api && npm install && npx tsc -p tsconfig.build.json && node dist/main.js   # http://localhost:4100/api
cd web && npm install && npm run dev                                            # http://localhost:3000
```

- Secrets live only in the `.env` files (git-ignored). The frontend sees only `VITE_*` variables.
- If npm fails with `Cannot read properties of null (reading 'edgesOut')`, the global npm (10.2.x) is broken. Use the npm bundled with Node: `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" install`.
- The PDF download needs the web app running, because the API prints the web `/print` page.

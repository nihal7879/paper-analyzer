# Standing rules (from the owner)

## Asking and acting
- Explain the plan and wait for a **yes** before changing files, `.env`, the database or servers.
- "ask only" means **answer only**. Do not act.
- Ask **one** yes/no before anything goes to production.
- Keep answers in simple English.

## Databases and servers
- **Never write to the production DB (195.250.20.169)** unless the owner says yes for that specific change. Take a fresh backup first.
- Only touch the `paper_analyzer` database.
- Dev DB: `paper_analyzer` on 122.170.99.55 (settings in `api/.env`).
- The owner restarts production. Ask first.

## Secrets
- AI keys and passwords live **only** in `.env` files (git-ignored). Never in code, docs or commits.
- Never paste or echo a password. Scripts read credentials from `.env` without printing them.
- Database dumps (`backups/`, `*.sql`) are client data: never commit them.

## AI usage
- Papers are read by **Claude Code helpers on the subscription plan**, not the paid API key.
- Ask before anything that might spend API credit.

## Laptop
- 8 GB memory: run at most ~6 helpers at once and keep 1.2 GB free (the gate waits for free memory).
  The owner may ask for one helper at a time.
- **Never write to drive C:** (it filled up). Helpers work in their own D: folders.
- No release build or zip unless the owner asks.

## Quality
- Run every check in [QA.txt](QA.txt) and look at real PDFs before any publish, picture upload or deploy.
- Never invent answers: if a mark scheme is missing or wrong, skip the paper and report it.
- Git: never discard uncommitted changes.

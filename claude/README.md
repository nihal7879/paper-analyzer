# claude/ — project handbook

Everything a new person (or a new Claude Code session) needs to work on Paper Analyzer.
Read in this order:

| File | What it is |
|---|---|
| [RULES.md](RULES.md) | Standing rules from the owner. Read first. |
| [SESSION_NOTES.md](SESSION_NOTES.md) | Current state: what is live, what is on dev, what is in progress, open items. |
| [PIPELINE.md](PIPELINE.md) | The full flow: source PDFs → Claude reading → gate → hand boxes → publish → production. |
| [STRUCTURE.md](STRUCTURE.md) | Repo folders, storage folders, backend modules, database tables. |
| [QA.txt](QA.txt) | QA checklist to run before ANY publish, picture upload or deploy. Every item happened at least once. |
| [EXTRACTION-FORMAT.md](EXTRACTION-FORMAT.md) | The JSON format the Claude helpers write for each paper. |
| [tools/](tools/) | Copies of the work scripts used outside the repo (gate, checks, box apply) and the helper briefs. |
| [history/](history/) | Old handover notes, kept for reference only. They are out of date. |

The live work folders are outside the repo (`D:/paper-analyzer-work`, `D:/paper-analyzer-storage`).
`tools/` holds copies so the method is not lost; the paths inside the scripts still point at those D: folders.

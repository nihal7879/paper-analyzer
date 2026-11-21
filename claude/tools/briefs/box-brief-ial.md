# Hand crop boxes for IAL Maths parts the automatic cutter could not place

Read D:/paper-analyzer-work/math/box-brief.md first and follow it (QP rules, MS rules, file format, checks). Then these IAL notes, which override it where they differ:

- Your task message lists, per paper (slug), the parts to box and whether QP, MS or both. For EACH listed part, also box the part printed just BEFORE it (in the same source): when the cutter misses a label, the previous part's crop runs on over the missed part, so that previous part must be redrawn too. If the listed part is the first part of its question, the "part before" is the last part of the previous question.
- Use the copies D:/paper-analyzer-storage/papers/<slug>/qp.pdf and ms.pdf (page = PDF page index, 1 = first page).
- Write/extend D:/paper-analyzer-storage/claude-extractions/boxes-<slug>.json (QP) and boxes-ms-<slug>.json (MS). If a file exists, KEEP its parts and add/replace only the parts you box. Part numbers exactly as in D:/paper-analyzer-storage/claude-extractions/<slug>.json.
- QP (IAL layout): width = the printed text area; leave out the right-hand "Leave blank" column with its "Q1" box (older papers) and the "DO NOT WRITE IN THIS AREA" strip. Leave out "(Total n marks)" / "(Total for Question n is x marks)" and "TOTAL FOR PAPER".
  - D1 and "A" papers: the PDF may contain an Answer Book (before or after the question pages): never box Answer Book pages.
- MS: a part's rows = full table width (all columns incl. Notes); the question's LAST part also takes the notes printed under that question's table (plain text below the table too), up to the next question's table or header. Parts the MS marks as one block share the SAME box(es).
- At most 4 regions per part. Draw every box on a render and LOOK. Work in D:/paper-analyzer-work/ial-math/agent-boxes-<first slug>/ ; delete renders after. Never touch the DB/app/.env or C:.

Report per slug: the parts you boxed (QP / MS) and anything doubtful.

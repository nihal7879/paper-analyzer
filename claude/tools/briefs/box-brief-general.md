# Hand crop boxes for parts the automatic cutter cannot place (Edexcel Maths 8MA0/9MA0)

You draw crop boxes by LOOKING at page renders. You only WRITE box files; never touch the database, the app, .env, or any other file. Work in your own folder D:/paper-analyzer-work/math/agent-boxes-<your first slug>/ (scripts, renders). Render with PyMuPDF via `python -I` at scale ~1.0, a few pages at a time (8 GB laptop; delete renders when done). Never write to C:.

## Files you write (only the parts in your assignment)
- Question-paper boxes: D:/paper-analyzer-storage/claude-extractions/boxes-<slug>.json
- Mark-scheme boxes:    D:/paper-analyzer-storage/claude-extractions/boxes-ms-<slug>.json
Format (same as the existing AQA/Oxford files, e.g. boxes-ms-9MA0_s19_1.json in that folder):
{"slug": "<slug>", "parts": [{"number": "3(a)", "regions": [{"page": 6, "box": {"x0": 0.06, "y0": 0.12, "x1": 0.94, "y1": 0.47}}]}]}
- `number` exactly as in the paper's extraction file D:/paper-analyzer-storage/claude-extractions/<slug>.json.
- `page` = PDF page index (1 = first page) of the qp.pdf / ms.pdf in D:/paper-analyzer-storage/papers/<slug>/ (use THOSE copies).
- Coordinates are fractions of the page (0..1, x0<x1, y0<y1). AT MOST 4 regions per part (the app refuses more): if a part runs over more pages, keep its question text pages and the first answer space, drop extra blank "continued" pages.
- If a file already exists for that slug (e.g. boxes-ms-9MA0_s19_1.json), ADD your parts to it, keep the existing ones.

## Question-paper (QP) boxes = the part exactly as printed, for the worksheet
- From the part's own label line ("(b)", "(ii)") down to just above the next part's label; the FIRST part of a question starts at the question number and includes the shared stem and its figure. Include the part's marks "(3)" and its answer lines/space. The question's last part also takes its "Question n continued" pages (up to the 4-region limit).
- Width: the printed text area, about x0 0.05 .. x1 0.94 (not the "DO NOT WRITE IN THIS AREA" margin strip at the right edge, not the page header/footer, not the barcode).
- Do not include the paper's "(Total for Question n is x marks)" line or "TOTAL FOR PAPER" (the worksheet prints its own).
- Never cut through a text line, a figure, a label or the marks bracket: put edges in the white space between lines. Check every box by drawing it on the render and LOOKING.

## Mark-scheme (MS) boxes = the part's rows of the mark-scheme table
- The table rows of that part (Question | Scheme | Marks | AOs), full table width, from the rule above its first row to the rule above the next part's first row. A question's last part also takes the notes printed under that question's table (up to the 4-region limit). Not the grey header row ("Question Scheme Marks AOs"), not the next question.
- Where the MS marks (i) and (ii) together in one row block, give both parts the SAME box.

## Check before you finish
Valid JSON; every assigned part present; numbers match the extraction file; pages exist in the PDF; boxes inside 0..1; at most 4 regions; you LOOKED at every box on a render. Report: per slug, which parts you boxed (QP / MS) and anything doubtful.

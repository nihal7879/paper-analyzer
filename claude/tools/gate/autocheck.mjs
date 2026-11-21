// Read-only automatic crop check for papers (dev DB crops vs the PDFs' text layer).
// Usage: node autocheck.mjs <slug> [<slug> ...]   (or: node autocheck.mjs --file ial-slugs.txt)
// Flags (one line each): MS includes "Total for Question"; MS includes the "Question Number / Answer" header row;
// two parts share the same MS box; QP/MS crop edge cuts through a text line; first part of a question lacks its number.
// Text positions are raw PDF positions: on PDFs whose page image is shifted (crop box) a flag may be a false alarm.
import fs from "fs";
import { createRequire } from "module";
const require = createRequire("D:/paper analyzer/api/package.json");
const mysql = require("mysql2/promise");
const pdfjs = await import("file:///D:/paper%20analyzer/api/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const env = Object.fromEntries(fs.readFileSync("D:/paper analyzer/api/.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const c = await mysql.createConnection({ host: env.DB_HOST, port: +(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: "paper_analyzer" });
let slugs = process.argv.slice(2);
if (slugs[0] === "--file") slugs = fs.readFileSync(slugs[1], "utf8").split(/\r?\n/).filter(Boolean);
const out = [];
for (const slug of slugs) {
  const [rows] = await c.query(
    `select q.id, q.number, q.sort_order, i.source, i.page, i.box from question_images i join questions q on q.id = i.question_id join papers p on p.id = q.paper_id
     where p.slug = ? and q.deleted_at is null and i.kind = 'FULL' order by q.sort_order, i.source desc, i.sort_order`, [slug]);
  const docs = {}, cache = {};
  const open = async (src) => {
    if (docs[src] !== undefined) return docs[src];
    const f = `D:/paper-analyzer-storage/papers/${slug}/${src === "QP" ? "qp" : "ms"}.pdf`;
    docs[src] = fs.existsSync(f) ? await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(f)), useSystemFonts: true, verbosity: 0 }).promise : null;
    return docs[src];
  };
  const items = async (src, page) => {
    const k = src + page;
    if (cache[k]) return cache[k];
    const doc = await open(src);
    if (!doc || page < 1 || page > doc.numPages) return (cache[k] = []);
    const pg = await doc.getPage(page);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    return (cache[k] = tc.items.filter((it) => it.str && it.str.trim() && Math.abs(it.transform[1]) <= Math.abs(it.transform[0])).map((it) => {
      const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]); // visible-page coordinates (crop box applied), as the cutter and the page images use
      const base = vy / vp.height;
      return { str: it.str.trim(), x: vx / vp.width, w: it.width / vp.width, base, top: base - it.height / vp.height };
    }));
  };
  const flag = (n, src, msg) => out.push(`${slug} | ${n} | ${src} | ${msg}`);
  const seenMs = new Map();
  const qpBoxes = {};
  let paperFlags = 0;
  for (const r of rows) {
    const box = typeof r.box === "string" ? JSON.parse(r.box) : r.box;
    const its = await items(r.source, r.page);
    const inBox = its.filter((i) => i.x + i.w > box.x0 && i.x < box.x1 && i.top >= box.y0 - 0.004 && i.base <= box.y1 + 0.004);
    const text = inBox.map((i) => i.str).join(" ");
    const n0 = out.length;
    if (r.source === "MS") {
      if (/Total for Question/i.test(text)) flag(r.number, "MS", `p${r.page} includes a "Total for Question" line`);
      if (/Question/i.test(text) && /Number/i.test(text) && /Answer/i.test(text) && /Mark/i.test(text) && inBox.some((i) => i.top > box.y0 + 0.03 && /^Question$/i.test(i.str))) flag(r.number, "MS", `p${r.page} includes a repeated header row`);
      const key = r.page + ":" + [box.x0, box.y0, box.x1, box.y1].map((v) => Math.round(v * 200)).join(",");
      // (i)/(ii) of one lettered part sharing the MS crop is intended when the MS marks them together (printed once)
      const stem = (x) => String(x).replace(/\((?:i|ii|iii|iv|v|vi)\)$/i, "");
      if (seenMs.has(key) && seenMs.get(key) !== r.number && stem(seenMs.get(key)) !== stem(r.number)) flag(r.number, "MS", `p${r.page} same box as ${seenMs.get(key)} (duplicate)`);
      else seenMs.set(key, r.number);
    }
    // an edge that cuts through a line of text (more than 40% of the line on each side of the edge is not a cut; a thin overlap is)
    for (const it of its) {
      if (it.x + it.w <= box.x0 || it.x >= box.x1) continue;
      const h = it.base - it.top;
      if (h <= 0 || h > 0.03) continue;
      for (const [edge, name] of [[box.y1, "bottom"], [box.y0, "top"]]) {
        const above = edge - it.top, below = it.base - edge;
        if (/[^\s-]/.test(it.str) && above > 0.25 * h && below > 0.25 * h) flag(r.number, r.source, `p${r.page} ${name} edge cuts through the line "${it.str.slice(0, 30)}"`);
      }
    }
    if (r.source === "QP") (qpBoxes[r.page] ||= []).push({ n: r.number, box });
    paperFlags += out.length - n0;
  }
  // text printed in the body of a question-paper page that lies outside EVERY crop on that page (a missing stem / label line)
  const n1 = out.length;
  const SKIP = /^(\(?Total for Question.*|TOTAL FOR .*|SECTION [A-C].*|Answer ALL.*|You should aim.*|For each question.*|If you change.*|with a cross.*|Write your answers.*|Use this space.*|Anything you write.*|your mind, put.*|mark your new.*|Turn over|\*?P\d+\w*\*?|BLANK PAGE|\(?Total for|Total for|Question \d+ continued|\d+|[.\s…]+|\(\d+\)|\*?[A-Z]?\d{4,}.*|©.*|DO NOT WRITE.*|\(Total \d+ marks?\)|Leave|blank|Leave blank|Q\d{1,2})$/i;
  for (const [pg, boxes] of Object.entries(qpBoxes)) {
    const its = await items("QP", +pg);
    const rowsByBase = new Map();
    for (const i of its) {
      if (i.top < 0.04 || i.base > 0.915 || i.x > 0.93) continue;
      const k = Math.round(i.base * 400);
      (rowsByBase.get(k) || rowsByBase.set(k, []).get(k)).push(i);
    }
    for (const [, row] of rowsByBase) {
      const t = row.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").trim();
      if (!t || SKIP.test(t) || /^[.\s]+$/.test(t)) continue;
      const mid = (Math.min(...row.map((i) => i.top)) + Math.max(...row.map((i) => i.base))) / 2;
      if (boxes.some((b) => mid >= b.box.y0 - 0.002 && mid <= b.box.y1 + 0.002)) continue;
      flag("?", "QP", `p${pg} text outside every crop at y=${mid.toFixed(3)}: "${t.slice(0, 60)}"`);
    }
  }
  paperFlags += out.length - n1;
  out.push(`${slug}: ${rows.length} crops checked, ${paperFlags} flags`);
  for (const d of Object.values(docs)) if (d && d.cleanup) await d.cleanup();
}
fs.writeFileSync("D:/paper-analyzer-work/chem/autocheck-result.txt", out.join("\n") + "\n");
console.log(out.filter((l) => /flags$/.test(l)).map((l) => l.replace(/: \d+ crops checked,/, ":")).join("\n"));
console.log("total flag lines:", out.filter((l) => !/flags$/.test(l)).length);
await c.end();

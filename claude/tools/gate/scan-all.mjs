// Read-only: for every published paper, QP crops that contain the paper's own "Total for Question"/"TOTAL FOR" text,
// and first parts of a question whose printed number is still inside the crop (number not erased).
import fs from "fs";
import { createRequire } from "module";
const require = createRequire("D:/paper analyzer/api/package.json");
const mysql = require("mysql2/promise");
const pdfjs = await import("file:///D:/paper%20analyzer/api/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const env = Object.fromEntries(fs.readFileSync("D:/paper analyzer/api/.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const c = await mysql.createConnection({ host: env.DB_HOST, port: +(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: "paper_analyzer" });
const [papers] = await c.query("select id,slug from papers where (status='PUBLISHED' or ?) and slug like ? order by slug", [process.env.ANY === '1', process.env.SLUGS || '%']);
const by = {};
const out = [];
for (const p of papers) {
  const f = `D:/paper-analyzer-storage/papers/${p.slug}/qp.pdf`;
  if (!fs.existsSync(f)) continue;
  const fam = p.slug.slice(0, 4);
  const [rows] = await c.query(
    "select q.number,i.page,i.box from question_images i join questions q on q.id=i.question_id where q.paper_id=? and q.deleted_at is null and i.source='QP' and i.kind='FULL' order by q.sort_order,i.sort_order", [p.id]);
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(f)), useSystemFonts: true, verbosity: 0 }).promise; } catch { continue; }
  const cache = {};
  const items = async (n) => {
    if (cache[n]) return cache[n];
    if (n < 1 || n > doc.numPages) return (cache[n] = []);
    const pg = await doc.getPage(n);
    const vp = pg.getViewport({ scale: 1 });
    const tc = await pg.getTextContent();
    return (cache[n] = tc.items.filter((it) => it.str && it.str.trim() && Math.abs(it.transform[1]) <= Math.abs(it.transform[0])).map((it) => {
      const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const base = vy / vp.height;
      return { s: it.str.trim(), x: vx / vp.width, w: it.width / vp.width, base, top: base - it.height / vp.height };
    }));
  };
  const seenQ = new Set();
  const k = (by[fam] ??= { papers: 0, crops: 0, total: 0, firsts: 0, dupnum: 0 });
  k.papers++;
  for (const r of rows) {
    const b = typeof r.box === "string" ? JSON.parse(r.box) : r.box;
    const its = await items(r.page);
    const inBox = its.filter((i) => i.x + i.w > b.x0 && i.x < b.x1 && i.top >= b.y0 - 0.004 && i.base <= b.y1 + 0.004);
    k.crops++;
    const txt = inBox.map((i) => i.s).join(" ");
    if (/Total\s*for\s*Question|TOTAL\s*FOR\s*(SECTION|PAPER|QUESTION)/i.test(txt)) { k.total++; out.push(`${p.slug} | ${r.number} | total-in-crop`); }
    const base = String(r.number).replace(/\s*\(.*$/, "").trim();
    if (!seenQ.has(base)) {
      seenQ.add(base);
      k.firsts++;
      const hit = inBox.find((i) => i.x < b.x0 + 0.11 && i.top < b.y0 + 0.07 && i.s.replace(/^\*/, "").replace(/\.$/, "") === base);
      if (hit && !b.num) { k.dupnum++; out.push(`${p.slug} | ${r.number} | number-still-printed`); }
    }
  }
  await doc.cleanup();
}
fs.writeFileSync("D:/paper-analyzer-work/chem/scan-all.txt", out.join("\n") + "\n");
console.log(JSON.stringify(by));
await c.end();

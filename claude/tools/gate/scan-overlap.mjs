// Read-only. (1) Crops of one question that overlap on the same page (a later part repeats the stem/figure of an earlier one).
// (2) A question's first crop that still shows the paper's own number ("4", "4.", "4:") with no erase recorded (num missing).
import fs from "fs";
import { createRequire } from "module";
const require = createRequire("D:/paper analyzer/api/package.json");
const mysql = require("mysql2/promise");
const pdfjs = await import("file:///D:/paper%20analyzer/api/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
const env = Object.fromEntries(fs.readFileSync("D:/paper analyzer/api/.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const c = await mysql.createConnection({ host: env.DB_HOST, port: +(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: "paper_analyzer" });
const [papers] = await c.query("select id, slug from papers where (status='PUBLISHED' or ?) and slug like ? order by slug", [process.env.ANY === '1', process.argv[2] || '%']);
const out = [], by = {};
for (const p of papers) {
  const fam = p.slug.slice(0, 4);
  const k = (by[fam] ??= { overlap: 0, num: 0 });
  const [rows] = await c.query("select q.number, q.base_number b, q.sort_order so, i.page, i.box, i.sort_order cs from question_images i join questions q on q.id=i.question_id where q.paper_id=? and q.deleted_at is null and i.source='QP' and i.kind='FULL' order by q.sort_order, i.sort_order", [p.id]);
  const groups = new Map();
  for (const r of rows) (groups.get(r.b) || groups.set(r.b, []).get(r.b)).push({ ...r, box: typeof r.box === "string" ? JSON.parse(r.box) : r.box });
  for (const [, g] of groups) {
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const a = g[i], b = g[j];
      if (a.page !== b.page || a.number === b.number) continue;
      const ov = Math.min(a.box.y1, b.box.y1) - Math.max(a.box.y0, b.box.y0);
      if (ov > 0.03) { k.overlap++; out.push(`${p.slug} | ${a.number} & ${b.number} | p${a.page} | overlap ${ov.toFixed(3)} (${a.box.y0}-${a.box.y1} vs ${b.box.y0}-${b.box.y1})`); }
    }
  }
  // number still printed: only where no erase was recorded
  const firsts = [...groups.values()].map((g) => g[0]).filter((r) => !r.box.num);
  if (!firsts.length || /^(7404|7405|7407|7408|9620|9630|KS3)/.test(p.slug)) continue;
  const f = `D:/paper-analyzer-storage/papers/${p.slug}/qp.pdf`;
  if (!fs.existsSync(f)) continue;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(f)), useSystemFonts: true, verbosity: 0 }).promise;
  for (const r of firsts) {
    const pg = await doc.getPage(r.page), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
    const hit = tc.items.find((it) => { const [vx, vy] = vp.convertToViewportPoint(it.transform[4], it.transform[5]); const x = vx / vp.width, base = vy / vp.height; return x >= r.box.x0 - 0.005 && x < r.box.x0 + 0.06 && base > r.box.y0 && base < r.box.y0 + 0.05 && new RegExp(`^\\*?${r.b}[.:]?$`).test(it.str.trim()); });
    if (hit) { k.num++; out.push(`${p.slug} | ${r.number} | p${r.page} | number still printed: "${hit.str.trim()}"`); }
  }
  await doc.cleanup();
}
fs.writeFileSync("D:/paper-analyzer-work/chem/scan-overlap.txt", out.join("\n") + "\n");
console.log(JSON.stringify(by));
await c.end();

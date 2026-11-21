// Dev only: worksheet PDFs of whole papers in both styles (past-paper crops + typed), answers at the end.
import fs from "fs";
import { createRequire } from "module";
const require = createRequire("D:/paper analyzer/api/package.json");
const mysql = require("mysql2/promise");
const env = Object.fromEntries(fs.readFileSync("D:/paper analyzer/api/.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
if (env.DB_HOST === "195.250.20.169") throw new Error("refusing");
const c = await mysql.createConnection({ host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD, database: "paper_analyzer" });
const base = "http://localhost:4100/api";
const { token } = await (await fetch(base + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) })).json();
const h = { authorization: "Bearer " + token, "content-type": "application/json" };
for (const slug of process.argv.slice(2)) {
  const [rows] = await c.query("select q.id from questions q join papers p on p.id=q.paper_id where p.slug=? and q.deleted_at is null order by q.sort_order", [slug]);
  for (const style of ["paper", "typed"]) {
    const body = { ids: rows.map((r) => String(r.id)), answers: "end", title: slug, ...(style === "paper" ? { style: "paper" } : {}) };
    const r = await fetch(base + "/bank/pdf", { method: "POST", headers: h, body: JSON.stringify(body) });
    if (!r.ok) { console.log(slug, style, r.status, (await r.text()).slice(0, 200)); continue; }
    const { token: t } = await r.json();
    const f = await fetch(`${base}/bank/pdf/file/${t}`, { headers: h });
    const buf = Buffer.from(await f.arrayBuffer());
    fs.writeFileSync(`D:/paper-analyzer-work/ial-math/look/pdf/${slug}-${style}.pdf`, buf);
    console.log(slug, style, f.status, buf.length);
  }
}
await c.end();

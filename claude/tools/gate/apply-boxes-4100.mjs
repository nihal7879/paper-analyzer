// Saves the helpers' QP + MS crop boxes (boxes-<slug>.json, boxes-ms-<slug>.json) through the API.
// Usage: node apply-boxes.mjs <slug> [<slug> ...]
import fs from "fs";
import { createRequire } from "module";
const require = createRequire("D:/paper analyzer/api/package.json");
const mysql = require("mysql2/promise");
const env = Object.fromEntries(fs.readFileSync("D:/paper analyzer/api/.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const dir = "D:/paper-analyzer-storage/claude-extractions";
const base = "http://localhost:4100/api";
const c = await mysql.createConnection({ host: env.DB_HOST, port: +(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: "paper_analyzer" });
const { token } = await (await fetch(base + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) })).json();
const h = { authorization: "Bearer " + token, "content-type": "application/json" };
for (const slug of process.argv.slice(2)) {
  const [qs] = await c.query("select q.id, q.number from questions q join papers p on p.id = q.paper_id where p.slug = ? and q.deleted_at is null", [slug]);
  const ids = new Map(qs.map((q) => [q.number, q.id]));
  let ok = 0; const bad = [];
  for (const [source, file] of [["QP", `boxes-${slug}.json`], ["MS", `boxes-ms-${slug}.json`]]) {
    if (!fs.existsSync(`${dir}/${file}`)) { bad.push(`${source}: no file`); continue; }
    for (const part of JSON.parse(fs.readFileSync(`${dir}/${file}`, "utf8")).parts) {
      const qid = ids.get(part.number);
      if (!qid) { bad.push(`${source} ${part.number}: no question`); continue; }
      // Very thin boxes are refused by the API; give them a minimum height.
      const regions = part.regions.map((r) => ({ page: r.page, box: r.box.y1 - r.box.y0 < 0.024 ? { ...r.box, y1: Math.min(1, r.box.y0 + 0.024) } : r.box }));
      const res = await fetch(`${base}/papers/${slug}/questions/${qid}/crops`, { method: "PUT", headers: h, body: JSON.stringify({ source, regions }) });
      if (res.ok) ok++; else bad.push(`${source} ${part.number}: ${res.status} ${(await res.text()).slice(0, 120)}`);
    }
  }
  console.log(slug, "saved", ok, "of", qs.length * 2, bad.length ? "| " + bad.join(" | ") : "");
}
await c.end();

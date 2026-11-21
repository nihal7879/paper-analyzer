// Dev only: link an imported IAL paper to its unit component (the importer only links numeric paper codes).
import fs from "fs";
import { createRequire } from "module";
const require = createRequire("D:/paper analyzer/api/package.json");
const mysql = require("mysql2/promise");
const env = Object.fromEntries(fs.readFileSync("D:/paper analyzer/api/.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
if (env.DB_HOST === "195.250.20.169") throw new Error("refusing: production");
const NUM = { P1: 11, P2: 12, P3: 13, P4: 14, FP1: 21, FP2: 22, FP3: 23, M1: 31, M2: 32, M3: 33, S1: 41, S2: 42, S3: 43, D1: 51, C12: 61, C34: 62 };
const c = await mysql.createConnection({ host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD, database: "paper_analyzer" });
for (const slug of process.argv.slice(2)) {
  const [[p]] = await c.query("select id, subject_id, paper_code from papers where slug=?", [slug]);
  if (!p) { console.log(`COMP ${slug} no paper`); continue; }
  const unit = NUM[p.paper_code] ? p.paper_code : p.paper_code.replace(/[AR]$/, "");
  const [[k]] = await c.query("select id from components where subject_id=? and number=?", [p.subject_id, NUM[unit] ?? -1]);
  if (!k) { console.log(`COMP ${slug} no component for ${p.paper_code}`); continue; }
  await c.query("update papers set component_id=? where id=?", [k.id, p.id]);
  console.log(`COMP ${slug} -> ${unit}`);
}
await c.end();

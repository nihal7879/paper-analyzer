// Parts with more than N crop regions (the API refuses > 4) and parts with no QP or no MS crop. Usage: node regions.mjs <slug-like>
import fs from "fs";
import { createRequire } from "module";
const require = createRequire("D:/paper analyzer/api/package.json");
const mysql = require("mysql2/promise");
const env = Object.fromEntries(fs.readFileSync("D:/paper analyzer/api/.env","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const c = await mysql.createConnection({host:env.DB_HOST,port:+(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:"paper_analyzer"});
const [r]=await c.query(`select p.slug, q.number, sum(i.source='QP') qp, sum(i.source='MS') ms, min(case when i.source='MS' and i.sort_order=0 then i.page*10+json_extract(i.box,'$.y0') end) msat from questions q join papers p on p.id=q.paper_id left join question_images i on i.question_id=q.id and i.kind='FULL' where p.slug like ? and q.deleted_at is null group by q.id order by p.slug, q.sort_order`,[process.argv[2]]);
// mark-scheme crops must come in question order (a part whose MS crop starts before the previous part's = wrong rows)
let prev=null; const order=[];
for (const x of r) { if (prev && prev.slug===x.slug && x.msat!=null && prev.msat!=null && Number(x.msat) < Number(prev.msat)-0.001) order.push(`${x.slug} ${x.number} MS crop starts before ${prev.number}'s (wrong rows?)`); if (x.msat!=null) prev=x; }
for (const o of order) console.log(o);
const bad=r.filter(x=>Number(x.qp)>=4||Number(x.ms)>=4||!Number(x.qp)||!Number(x.ms)||x.qp==null||x.ms==null);
console.log(JSON.stringify({parts:r.length, flagged:bad.length})); for (const x of bad) console.log(`${x.slug} ${x.number} QP ${x.qp} MS ${x.ms}${Number(x.qp)>=4||Number(x.ms)>=4?"  (at the 4-region limit: check nothing was dropped)":""}`);
await c.end();

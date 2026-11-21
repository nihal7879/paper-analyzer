// Dev only: publish papers through the dev API on 4100 (the API's own checks run). Usage: node publish-4100.mjs <slug> ...
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync("D:/paper analyzer/api/.env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
if (env.DB_HOST === "195.250.20.169") throw new Error("refusing: production");
const base = "http://localhost:4100/api";
const { token } = await (await fetch(base + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) })).json();
const h = { authorization: "Bearer " + token, "content-type": "application/json" };
for (const slug of process.argv.slice(2)) {
  const v = await fetch(`${base}/papers/${slug}/verify-all`, { method: "POST", headers: h }); if (!v.ok) console.log(slug, "verify-all", v.status, (await v.text()).slice(0, 200));
  const r = await fetch(`${base}/papers/${slug}/publish`, { method: "POST", headers: h });
  const t = await r.text();
  console.log(slug, r.status, r.ok ? "PUBLISHED" : t.slice(0, 400));
}

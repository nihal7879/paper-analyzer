# Papers whose question paper has no usable text layer (scanned / font-garbled): the printed question number at the
# top-left of each question's first crop can't be erased from text, so the worksheet printed ours next to it ("2" over "4.").
# This measures the printed number from the PAGE IMAGE and stores box.num = {x, y, h, w, t, cover: true}: the worksheet
# then prints our number on a white patch exactly over it. Dev DB only. Old boxes logged to cover-num-backup.jsonl.
# Usage: python -I cover-num.py [--apply] <slug> [<slug> ...]
import sys, json, re, pymupdf, subprocess
apply = "--apply" in sys.argv
slugs = [a for a in sys.argv[1:] if not a.startswith("--")]
env = {}
for l in open("D:/paper analyzer/api/.env", encoding="utf8"):
    if "=" in l and not l.startswith("#"):
        k, v = l.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
if env["DB_HOST"] == "195.250.20.169": sys.exit("refusing: production")
import importlib.util
try:
    import pymysql as mysql
except ImportError:
    mysql = None
q = """select i.id, i.page, i.box, q.number, q.base_number from question_images i join questions q on q.id=i.question_id
 join papers p on p.id=q.paper_id where p.slug=%s and q.deleted_at is null and i.kind='FULL' and i.source='QP' order by q.sort_order, i.sort_order"""
def rows(slug):
    out = subprocess.run(["node", "D:/paper-analyzer-work/math/dbq.mjs", slug], capture_output=True, text=True, encoding="utf8").stdout
    return json.loads(out)
fixed = 0
for slug in slugs:
    doc = pymupdf.open(f"D:/paper-analyzer-storage/papers/{slug}/qp.pdf")
    seen = set(); upd = []
    for r in rows(slug):
        if r["base_number"] in seen: continue
        seen.add(r["base_number"])
        b = r["box"] if isinstance(r["box"], dict) else json.loads(r["box"])
        if b.get("num"): continue
        pg = doc[r["page"] - 1]; S = 3
        pix = pg.get_pixmap(matrix=pymupdf.Matrix(S, S), colorspace=pymupdf.csGRAY)
        W, H = pix.width, pix.height; data = pix.samples
        x0, x1 = int(b["x0"] * W), int(min(b["x0"] + 0.075, b["x1"]) * W)
        y0, y1 = int(b["y0"] * H), int(min(b["y0"] + 0.05, b["y1"]) * H)
        ink = lambda x, y: data[y * W + x] < 140
        rowsInk = [y for y in range(y0, y1) if any(ink(x, y) for x in range(x0, x1))]
        if not rowsInk: continue
        top = rowsInk[0]; bot = top
        while bot + 1 < y1 and any(ink(x, bot + 1) for x in range(x0, x1)): bot += 1
        cols = [x for x in range(x0, x1) if any(ink(x, y) for y in range(top, bot + 1))]
        if not cols: continue
        left = cols[0]; right = left
        for x in cols:
            if x - right > 0.005 * W: break      # a gap: the number ends, the question text begins
            right = x
        h = (bot - top + 1) / H
        if h < 0.006 or h > 0.03 or (right - left) / W > 0.05: continue
        num = {"x": round(left / W - 0.002, 4), "y": round(top / H - 0.001, 4), "h": round(h + 0.002, 4), "w": round((right - left) / W + 0.006, 4), "t": r["base_number"], "cover": True}
        nb = dict(b); nb["num"] = num; upd.append((r["id"], b, nb, num))
    # "Question 12 continued" at the top of a continuation crop: store box.cont with cover, so ours goes on a white patch
    firsts = set()
    for r in rows(slug):
        b = r["box"] if isinstance(r["box"], dict) else json.loads(r["box"])
        key = r["number"]
        if key not in firsts: firsts.add(key); continue
        if b.get("cont") or b["y0"] > 0.1: continue
        pg = doc[r["page"] - 1]; S = 3
        pix = pg.get_pixmap(matrix=pymupdf.Matrix(S, S), colorspace=pymupdf.csGRAY)
        W, H = pix.width, pix.height; data = pix.samples
        ink = lambda x, y: data[y * W + x] < 140
        x0, x1 = int(b["x0"] * W), int(min(b["x0"] + 0.4, b["x1"]) * W)
        y0, y1 = int(b["y0"] * H), int(min(b["y0"] + 0.035, b["y1"]) * H)
        rowsInk = [y for y in range(y0, y1) if any(ink(x, y) for x in range(x0, x1))]
        if not rowsInk: continue
        top = rowsInk[0]; bot = top
        while bot + 1 < y1 and any(ink(x, bot + 1) for x in range(x0, x1)): bot += 1
        cols = [x for x in range(x0, x1) if any(ink(x, y) for y in range(top, bot + 1))]
        left = cols[0]; right = left
        for x in cols:
            if x - right > 0.03 * W: break
            right = x
        h = (bot - top + 1) / H; w = (right - left) / W
        if not (0.006 < h < 0.025 and 0.12 < w < 0.35): continue     # a bold one-line heading, not text or a rule
        em = h / 0.72
        nb = dict(b); nb["cont"] = {"x": round(left / W, 4), "base": round(bot / H + 0.001, 4), "em": round(em, 4), "w": round(w + 0.01, 4), "cover": True}
        upd.append((r["id"], b, nb, nb["cont"]))
    print(f"{slug}: {len(upd)} numbers/headings measured")
    for i, (rid, old, nb, num) in enumerate(upd[:3]): print("   e.g.", num)
    if apply and upd:
        with open("D:/paper-analyzer-work/math/cover-num-backup.jsonl", "a", encoding="utf8") as f:
            for rid, old, nb, num in upd: f.write(json.dumps({"id": rid, "box": old}) + "\n")
        payload = json.dumps([[rid, nb] for rid, old, nb, num in upd])
        open("D:/paper-analyzer-work/math/_covernum.json", "w", encoding="utf8").write(payload)
        print(subprocess.run(["node", "D:/paper-analyzer-work/math/dbset.mjs", "D:/paper-analyzer-work/math/_covernum.json"], capture_output=True, text=True).stdout.strip())
        fixed += len(upd)
print("APPLIED" if apply else "DRY RUN", fixed)

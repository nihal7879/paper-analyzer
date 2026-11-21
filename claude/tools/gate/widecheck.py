# MS crops: text lines that start/end OUTSIDE the crop's left/right edge while inside its height (cut text). Usage: python -I widecheck.py <slug> ...
import sys, json, subprocess, pymupdf
for slug in sys.argv[1:]:
    rows = json.loads(subprocess.run(["node", "D:/paper-analyzer-work/ial-math/crops.mjs", slug, "MS"], capture_output=True, text=True).stdout)
    doc = pymupdf.open(f"D:/paper-analyzer-storage/papers/{slug}/ms.pdf"); bad = {}
    for r in rows:
        b = r["box"]; pg = doc[r["page"] - 1]; R = pg.rect
        for blk in pg.get_text("dict")["blocks"]:
            for l in blk.get("lines", []):
                x0, y0, x1, y1 = l["bbox"]; t = "".join(s["text"] for s in l["spans"]).strip()
                if not t: continue
                fy = ((y0 + y1) / 2 - R.y0) / R.height
                if not (b["y0"] < fy < b["y1"]): continue
                fx0, fx1 = (x0 - R.x0) / R.width, (x1 - R.x0) / R.width
                if fx1 > 0.985 or fx0 < 0.015: continue      # text running off the page itself: no crop can hold it
                if (fx0 < b["x0"] - 0.008 and fx1 > b["x0"]) or (fx1 > b["x1"] + 0.008 and fx0 < b["x1"]): bad.setdefault(r["number"], []).append(f"p{r['page']} {fx0:.3f}-{fx1:.3f} vs {b['x0']:.3f}-{b['x1']:.3f} {ascii(t[:30])}")
    print(slug, "MS parts with cut text:", len(bad))
    for k, v in list(bad.items())[:4]: print("  ", k, v[0], f"(+{len(v)-1})")

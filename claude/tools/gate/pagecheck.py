# Every part's first QP crop must be on one of the pages the extraction says the part uses (page/pages).
# A crop on another page = the cutter matched the wrong printed number (e.g. a section that restarts at 1).
# Usage: python -I pagecheck.py <slug> [<slug> ...]   (prints "PAGECHECK <slug> OK" or the wrong parts)
import json, sys, subprocess
for s in sys.argv[1:]:
    d = json.load(open(f"D:/paper-analyzer-storage/claude-extractions/{s}.json", encoding="utf8"))
    ok = {q["number"]: set([q["page"]] + list(q.get("pages") or [])) for q in d["questions"]}
    out = subprocess.run(["node", "D:/paper-analyzer-work/math/mspages.mjs", s, "QP"], capture_output=True, text=True).stdout
    bad = []
    for l in out.splitlines():
        f = l.split()
        if len(f) < 2 or f[0] not in ok: continue
        first = int(f[1].split(":")[0])
        if first not in ok[f[0]]: bad.append(f"{f[0]} crop p{first} not in {sorted(ok[f[0]])}")
    print(f"PAGECHECK {s} OK" if not bad else f"PAGECHECK {s} WRONG: " + " | ".join(bad))

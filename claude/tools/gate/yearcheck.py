# Every extraction's paper block must agree with ial-work.json (year, seasonCode, paperCode, subjectCode, componentName).
import json, os
L = json.load(open("D:/paper-analyzer-work/ial-math/ial-work.json"))
E = "D:/paper-analyzer-storage/claude-extractions/"
bad = 0
for e in L:
    f = E + e["slug"] + ".json"
    if not os.path.exists(f): continue
    p = json.load(open(f, encoding="utf8"))["paper"]
    for k in ("year", "seasonCode", "paperCode", "subjectCode", "componentName"):
        if p.get(k) != e[k]: bad += 1; print("MISMATCH", e["slug"], k, p.get(k), "!=", e[k])
print("checked; mismatches:", bad)

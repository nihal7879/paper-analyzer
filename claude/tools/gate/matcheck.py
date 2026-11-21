# Matrices / cases / arrays whose row separators look collapsed: a single backslash + space ("\ ") inside the
# environment and no double backslash at all (a heredoc turned the row separators into "\ ").
import json, re, glob, sys
sys.stdout.reconfigure(encoding="utf8")
ENV = re.compile(r"\\begin\{(pmatrix|bmatrix|vmatrix|matrix|cases|array)\}(.*?)\\end\{\1\}", re.S)
SINGLE = re.compile(r"(?<!\\)\\ (?=\S)")
bad = 0
for f in sorted(glob.glob("D:/paper-analyzer-storage/claude-extractions/YMA01_*.json")):
    if "boxes" in f: continue
    d = json.load(open(f, encoding="utf8"))
    for q in d.get("questions", []):
        for field, txt in (("text", q.get("text", "")), ("answer", (q.get("answer") or {}).get("text", ""))):
            for m in ENV.finditer(txt or ""):
                body = m.group(2)
                if SINGLE.search(body) and "\\\\" not in body:
                    bad += 1
                    print(f.replace("\\", "/").split("/")[-1], q["number"], field, m.group(0)[:90])
print("suspect matrices:", bad)

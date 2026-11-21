# Repairs collapsed matrix rows in the given extraction files: inside a matrix/cases/array environment that has NO
# double backslash, every single "\ " (backslash + space, not part of a command) becomes the row separator "\\ ".
# Backup of each file first: <file>.bak-matfix. Usage: python -I -X utf8 matfix.py <slug> ...
import json, re, sys, shutil
ENV = re.compile(r"(\\begin\{(pmatrix|bmatrix|vmatrix|matrix|cases|array)\})(.*?)(\\end\{\2\})", re.S)
SINGLE = re.compile(r"(?<!\\)\\ (?=\S)")
def fix_env(m):
    body = m.group(3)
    if "\\\\" in body or not SINGLE.search(body): return m.group(0)
    return m.group(1) + SINGLE.sub(lambda _: "\\\\ ", body) + m.group(4)
for slug in sys.argv[1:]:
    p = f"D:/paper-analyzer-storage/claude-extractions/{slug}.json"
    d = json.load(open(p, encoding="utf8")); n = 0
    for q in d["questions"]:
        for holder, key in ((q, "text"), (q.get("answer") or {}, "text")):
            old = holder.get(key)
            if not old: continue
            new = ENV.sub(fix_env, old)
            if new != old: holder[key] = new; n += 1
    if n:
        shutil.copy(p, p + ".bak-matfix")
        json.dump(d, open(p, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(slug, "fields fixed:", n)

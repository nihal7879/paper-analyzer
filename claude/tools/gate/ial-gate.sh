#!/bin/sh
# IAL Maths (YMA01): import + cut + ALL qa.txt checks, one paper at a time (lock dir: only one run at once).
# Waits for free memory before each paper (8 GB laptop). Dev DB only. Usage: sh math-gate.sh <slug> [<slug> ...]
# Log: D:/paper-analyzer-work/math/gate.log   Summary per paper: "GATE <slug> OK" or "GATE <slug> CHECK: ..."
W=/d/paper-analyzer-work; M=$W/math; I=$W/ial-math; C=$W/chem; L=$I/gate.log; E=/d/paper-analyzer-storage/claude-extractions
until mkdir "$I/.gate-lock" 2>/dev/null; do sleep 20; done
trap 'rmdir "$I/.gate-lock"' EXIT
cd "D:/paper analyzer/api" || exit 1
grep -q "^DB_HOST=.*195\.250\.20\.169" .env && { echo "refusing: .env points at production" >> $L; exit 1; }
export PAPER_ANALYZER_OFFLINE=1
for s in "$@"; do
  echo "--- $s $(date)" >> $L
  [ -f "$E/$s.json" ] || { echo "GATE $s CHECK: no extraction file" >> $L; continue; }
  until [ "$(awk '/MemFree/ {print $2}' /proc/meminfo)" -gt 1100000 ]; do sleep 20; done
  # retry up to 5 times when the dev DB is briefly unreachable (network blips)
  for try in 1 2 3 4 5; do
    imp=$(node dist/cli/import-extractions.js "$s" 2>&1 | grep -E "^(✓|✗|   !)")
    echo "$imp" | grep -qE "EHOSTUNREACH|ECONNREFUSED|ETIMEDOUT|ECONNRESET" || break
    echo "  db unreachable, retry $try" >> $L; sleep 60
  done; echo "$imp" >> $L
  echo "$imp" | grep -q "^✓" || { echo "GATE $s CHECK: import failed" >> $L; continue; }
  node $I/ial-comp.mjs "$s" >> $L 2>&1
  cut=$(node dist/cli/question-crops.js "$s" 2>&1 | grep -E "^$s:|memory|skia|rror"); echo "$cut" >> $L
  # parts the cutter cannot place (e.g. a proof question with no MS table row) have hand boxes: apply them after every cut
  if [ -f "$E/boxes-$s.json" ]; then (cd $W && node math/apply-boxes-4100.mjs "$s" 2>&1 | tail -2 >> $L)
  elif [ -f "$E/boxes-ms-$s.json" ]; then (cd $W && node math/apply-ms-4100.mjs "$s" 2>&1 | tail -1 >> $L); fi
  # scanned / unreadable question papers: cover the printed numbers and "Question n continued" headings (measured from images)
  grep -qx "$s" $I/unreadable.txt && python -I -X utf8 $M/cover-num.py --apply "$s" 2>&1 | grep -E "measured" >> $L
  probs=""
  echo "$cut" | grep -qiE "memory|skia" && probs="$probs out-of-memory;"
  reg=$(cd $C && node tools/regions.mjs "$s"); echo "$reg" >> $L
  echo "$reg" | grep -q "wrong rows" && probs="$probs MS crops out of order;"
  echo "$reg" | grep -qE "QP 0|MS 0|QP null|MS null" && probs="$probs a part has no crop;"
  pc=$(python -I -X utf8 $M/pagecheck.py "$s"); echo "$pc" >> $L
  echo "$pc" | grep -q "WRONG" && probs="$probs crop on wrong page;"
  ac=$(cd $C && node autocheck.mjs "$s" | grep "^$s:"); echo "$ac" >> $L; (cd $C && grep "^$s |" autocheck-result.txt >> $L)
  # (edge flags on a tiny token, e.g. a fraction digit or superscript touching a table rule, are not real cuts)
  real=$(cd $C && grep "^$s |" autocheck-result.txt | grep -vE 'cuts through the line ".{0,3}"$' | wc -l)
  [ "$real" -eq 0 ] || probs="$probs autocheck flags (look);"
  ov=$(cd $C && ANY=1 node tools/scan-overlap.mjs "$s" | tail -1); echo "$ov" >> $L
  echo "$ov" | grep -q '"overlap":0,"num":0' || probs="$probs overlap/number;"
  sa=$(cd $C && ANY=1 SLUGS="$s" node tools/scan-all.mjs | tail -1); echo "$sa" >> $L
  echo "$sa" | grep -q '"total":0' || probs="$probs total-in-crop;"
  echo "$sa" | grep -q '"dupnum":0' || probs="$probs duplicate number;"
  wc=$(python -I -X utf8 $I/widecheck.py "$s" | head -3); echo "$wc" >> $L
  echo "$wc" | grep -q "cut text: 0" || probs="$probs MS text cut at the sides;"
  if [ -z "$probs" ]; then echo "GATE $s OK" >> $L; else echo "GATE $s CHECK:$probs" >> $L; fi
done

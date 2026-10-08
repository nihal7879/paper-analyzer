import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { MathText } from "@/components/math-text";
import { fileUrl, sourceLine, type AnswerMode } from "@/lib/api";
import { useEntries, usePaperEntries } from "@/lib/bank-api";
import { Worksheet } from "@/components/worksheet";
import type { BankEntry } from "@/lib/question-bank";

declare global {
  interface Window {
    /** Set when everything (data, images, fonts) is ready; the API waits for it before making the PDF. */
    __printReady?: boolean;
  }
}

/**
 * Print layout for PDFs: /print?ids=1,2,3 (selected, in that order) or /print?paper=<id> (whole paper),
 * &answers=none|end|inline|only, &title=…, &style=paper (past-paper style worksheet; default the normal layout)  The API opens this page in Chrome and saves it as PDF.
 * With &print=1 the browser's own print dialog opens instead (fallback when the server can't make the PDF).
 */
export function PrintPage() {
  const [params] = useSearchParams();
  const answers = (["none", "end", "inline", "only"].includes(params.get("answers") ?? "") ? params.get("answers") : "none") as AnswerMode;
  const paperId = params.get("paper");
  const idList = useMemo(() => (params.get("ids") ?? "").split(",").filter(Boolean), [params]);

  // Only the questions in this PDF are asked from the server (selected ids, in order, or one whole paper).
  const paper = usePaperEntries(paperId);
  const picked = useEntries(paperId ? [] : idList);
  const loading = paper.isLoading || picked.isLoading;
  const items = useMemo<BankEntry[]>(() => (paperId ? [...paper.entries].sort((a, b) => a.order - b.order) : picked.entries), [paperId, paper.entries, picked.entries]);

  const title = params.get("title") || (paperId && items[0] ? sourceLine(items[0].meta) : "Practice questions");
  const marks = items.reduce((s, e) => s + (e.question.marks ?? 0), 0);
  const single = paperId != null;
  const paperStyle = !single && params.get("style") === "paper";
  const answersOnly = answers === "only";

  // Paper is always white, whatever the app theme.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    return () => {
      if (wasDark) root.classList.add("dark");
      root.style.colorScheme = "";
    };
  }, []);

  // Ready once the data is in, every image has loaded (or failed) and KaTeX fonts are loaded.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      await Promise.all(
        [...document.images].map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );
      await document.fonts.ready;
      if (cancelled) return;
      window.__printReady = true;
      if (params.get("print") === "1") setTimeout(() => window.print(), 150);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, items, params]);

  if (loading) return <p className="p-10 text-sm">Loading…</p>;
  if (items.length === 0) return <p className="p-10 text-sm">No published questions found for this PDF.</p>;

  // Selected questions: a worksheet in the paper's layout. Past-paper style = the original crops; Normal = our text.
  if (!single) return <Worksheet items={items} title={title} answers={answers === "inline" ? "end" : answers} typed={!paperStyle} />;

  return (
    <div className="print-doc mx-auto max-w-[780px] bg-white px-8 py-8 text-[13px] leading-relaxed text-black">
      <header className="mb-6 border-b-2 border-black pb-3">
        <h1 className="text-xl font-bold">{answersOnly ? `${title}: Answers` : title}</h1>
        <p className="mt-1 text-xs text-neutral-600">
          {items.length} question{items.length === 1 ? "" : "s"} · {marks} marks
        </p>
      </header>

      {!answersOnly && (
      <ol className="space-y-6">
        {items.map((e, i) => (
          <li key={e.key} className="print-question space-y-2.5">
            <div className="flex items-baseline justify-between gap-4 border-b border-neutral-300 pb-1">
              <span className="font-bold">
                {single ? `Question ${e.question.number}` : `${i + 1}.`}
                {!single && <span className="ml-2 text-xs font-normal text-neutral-600">{sourceLine(e.meta, e.question.number)}</span>}
              </span>
              {e.question.marks != null && <span className="text-xs whitespace-nowrap text-neutral-600">[{e.question.marks} mark{e.question.marks === 1 ? "" : "s"}]</span>}
            </div>
            <MathText>{e.question.text}</MathText>
            {e.question.images.map((img, k) =>
              img.path ? (
                <img
                  key={k}
                  src={fileUrl(img.path)}
                  alt=""
                  className="mx-auto block max-h-[360px] object-contain"
                  style={{ width: `min(100%, ${Math.max(220, Math.round((img.box.x1 - img.box.x0) * 700))}px)` }}
                />
              ) : null,
            )}
            {e.question.options.length > 0 && (
              <ul className="space-y-1 pl-1">
                {e.question.options.map((o) => (
                  <li key={o.label} className="flex gap-2.5">
                    <span className="font-semibold">{o.label}</span>
                    <MathText inline className="min-w-0 flex-1">
                      {o.text}
                    </MathText>
                  </li>
                ))}
              </ul>
            )}
            {answers === "inline" && <Answer entry={e} />}
          </li>
        ))}
      </ol>
      )}

      {(answers === "end" || answersOnly) && (
        <section className={answersOnly ? undefined : "print-answers mt-10"}>
          {!answersOnly && <h2 className="mb-4 border-b-2 border-black pb-2 text-lg font-bold">Answers</h2>}
          <ol className="space-y-4">
            {items.map((e, i) => (
              <li key={e.key} className="print-question print-keep space-y-1">
                <span className="font-bold">
                  {single ? `Question ${e.question.number}` : `${i + 1}.`}
                  {!single && <span className="ml-2 text-xs font-normal text-neutral-600">{sourceLine(e.meta, e.question.number)}</span>}
                </span>
                <AnswerBody entry={e} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function Answer({ entry }: { entry: BankEntry }) {
  return (
    <div className="print-keep rounded border border-neutral-400 bg-neutral-50 px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold tracking-wide text-neutral-600 uppercase">Answer</p>
      <AnswerBody entry={entry} />
    </div>
  );
}

function AnswerBody({ entry }: { entry: BankEntry }) {
  const a = entry.question.answer;
  if (!a) return <p className="text-neutral-500">No answer available.</p>;
  if (a.correctOption) return <p className="font-semibold">{a.correctOption.toUpperCase()}</p>;
  return <MathText className="text-[12.5px]">{a.text}</MathText>;
}

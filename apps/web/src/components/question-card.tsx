import { Check, CircleCheck, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, EyeOff, FileText, Plus, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { Link } from "react-router";
import { Collapse } from "@/components/collapse";
import { MathText } from "@/components/math-text";
import { PaperDownloadMenu } from "@/components/pdf-download";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { sourceLine, type PaperMeta, type Question } from "@/lib/api";
import { baseNumber } from "@/lib/question-bank";
import { pageImageUrl, type DisplayImage } from "@/lib/review";
import { difficultyLabel, difficultyStyle, typeLabel } from "@/lib/format";
import { useSimilarMode } from "@/lib/preferences";
import { selection, useAllSelected } from "@/lib/selection";
import { openSimilarModal } from "@/components/similar-modal";
import { cn } from "@/lib/utils";

export type CardQuestion = Omit<Question, "images"> & { images: DisplayImage[] };

/** A question shown in the "Similar questions" list. */
export interface SimilarItem {
  key: string;
  meta: PaperMeta;
  question: CardQuestion;
}

const EMPTY: SimilarItem[] = [];

export const QuestionCard = memo(function QuestionCard({
  question: q,
  meta,
  showConfidence = false,
  className,
  similar = EMPTY,
  selectable = false,
  serial,
  parts,
  matched,
}: {
  question: CardQuestion;
  meta: PaperMeta;
  showConfidence?: boolean;
  className?: string;
  /** Similar questions from other papers (already resolved, best first). */
  similar?: SimilarItem[];
  /** Students: "Add to PDF" button and the paper download menu. */
  selectable?: boolean;
  /** Position in the current list (1, 2, 3…), shown before the question text. */
  serial?: number;
  /** A whole paper question with parts (a), (b), (c)…, shown together like the paper. */
  parts?: CardQuestion[];
  /** Parts matching the current filters (marked when only some match). */
  matched?: Set<string>;
}) {
  const [showSimilar, setShowSimilar] = useState(false);
  const similarMode = useSimilarMode();
  const lowConfidence = q.confidence < 0.7;
  const grouped = !!parts && parts.length > 1;
  const all = useMemo(() => (parts && parts.length > 1 ? parts : [q]), [parts, q]);
  const ids = useMemo(() => all.map((p) => p.id), [all]);
  const pages = [...new Set(all.flatMap((p) => p.pages))].sort((a, b) => a - b);
  const totalMarks = all.reduce((n, p) => n + (p.marks ?? 0), 0);
  const hasMarks = all.some((p) => p.marks != null);
  const hardest = all.reduce((h, p) => (DIFF_RANK[p.difficulty] > DIFF_RANK[h.difficulty] ? p : h), all[0]).difficulty;
  const subtopics = [...new Set(all.map((p) => p.subtopic).filter(Boolean))];
  const partial = grouped && !!matched && matched.size > 0 && matched.size < all.length;

  return (
    <Card className={cn("gap-0 overflow-hidden rounded-[14px] border border-foreground/12 p-0 ring-0", showConfidence && lowConfidence && "ring-2 ring-amber-400/60", className)}>
      {/* Source */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted px-4 py-3 text-sm sm:px-5">
        <span className="min-w-0 font-semibold">{sourceLine(meta, grouped ? baseNumber(q.number) : q.number)}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <ExamPages paperId={meta.id} pages={pages.length ? pages : [q.page]} title={sourceLine(meta, grouped ? baseNumber(q.number) : q.number)} />
          {selectable && (
            <>
              <PaperDownloadMenu meta={meta}>
                <Download className="size-3.5" /> Paper
              </PaperDownloadMenu>
              <SelectButton ids={ids} />
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3.5 px-4 py-4 sm:px-5 sm:py-5">
        {/* Badges + topic */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{typeLabel[q.type]}</Badge>
          {grouped && <Badge variant="outline">{all.length} parts</Badge>}
          {hasMarks && (
            <Badge variant="outline">
              {totalMarks} mark{totalMarks === 1 ? "" : "s"}
            </Badge>
          )}
          <Badge className={cn("border-transparent", difficultyStyle[hardest])}>{difficultyLabel(hardest)}</Badge>
          {showConfidence && lowConfidence && (
            <Badge className="gap-1 border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <TriangleAlert className="size-3" /> Check · {Math.round(q.confidence * 100)}%
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {q.topicCode ? `${q.topicCode}. ` : ""}
            {q.topic}
          </span>
          {subtopics.length > 0 && <> › {subtopics.join(", ")}</>}
        </p>

        {!selectable && <p className="text-sm font-semibold text-muted-foreground">Question {grouped ? baseNumber(q.number) : q.number}</p>}

        {grouped ? (
          // Whole question: the number once, then every part with its own marks and answer
          <div className={cn("grid", serial != null && "grid-cols-[auto_minmax(0,1fr)] gap-x-2.5")}>
            {serial != null && <SerialMark n={serial} />}
            <div className="grid gap-6">
              {all.map((p) => {
                const hit = partial && matched.has(p.id);
                return (
                  <div key={p.id} className={cn("grid gap-3.5", partial && "-ml-3 border-l-2 pl-3", partial && (hit ? "border-primary" : "border-transparent"))}>
                    {hit && <span className="w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Matches your filters</span>}
                    <QuestionBody q={p} meta={meta} part label={partLabel(p, all[all.indexOf(p) - 1])} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // Number in its own column: text, figures, options and answer all line up after it
          <div className={cn("grid", serial != null && "grid-cols-[auto_minmax(0,1fr)] gap-x-2.5")}>
            {serial != null && <SerialMark n={serial} />}
            <div className="grid min-w-0 gap-3.5">
              <QuestionBody q={q} meta={meta} />
            </div>
          </div>
        )}

        {/* Similar questions (by meaning, from other papers): a page, a pop-up or inside the card (Settings) */}
        {similar.length > 0 && (
          <div className="border-t pt-3">
            {similarMode === "page" ? (
              <Link to={`/similar/${q.id}`} viewTransition className={similarLinkCls}>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-4" /> Similar questions ({similar.length})
                </span>
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <button
                type="button"
                aria-expanded={similarMode === "inline" ? showSimilar : undefined}
                onClick={() => (similarMode === "modal" ? openSimilarModal(similar, 0) : setShowSimilar((v) => !v))}
                className={similarLinkCls}
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-4" /> Similar questions ({similar.length})
                </span>
                <ChevronRight className={cn("size-4 transition-transform duration-200", similarMode === "inline" && showSimilar && "rotate-90")} />
              </button>
            )}
            {similarMode === "inline" && showSimilar && <SimilarPanel list={similar} selectable={selectable} />}
          </div>
        )}
      </div>
    </Card>
  );
});

const similarLinkCls = "flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-sm font-medium text-primary hover:underline";
const DIFF_RANK: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };

/**
 * The part's label, e.g. "(ii)" for 11(a)(ii) after 11(a)(i), when its text doesn't already start with one
 * (the paper only prints the levels that change).
 */
function partLabel(p: CardQuestion, prev: CardQuestion | undefined): string | null {
  if (/^\s*\(/.test(p.text)) return null;
  const tokens = String(p.number).match(/\([^)]*\)/g) ?? [];
  if (tokens.length === 0) return null;
  // already written further down (after the question's shared intro)
  const last = tokens[tokens.length - 1];
  if (p.text.split("\n").some((line) => line.trim().startsWith(last))) return null;
  const before = prev ? (String(prev.number).match(/\([^)]*\)/g) ?? []) : [];
  let k = 0;
  while (k < tokens.length - 1 && tokens[k] === before[k]) k++;
  return tokens.slice(k).join(" ");
}

const pageLinkCls =
  "flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95";

/**
 * The question's original exam page(s) in a viewer, one under the other (each can still open in its own tab).
 */
function ExamPages({ paperId, pages, title }: { paperId: string; pages: number[]; title: string }) {
  const [open, setOpen] = useState(false);
  const many = pages.length > 1;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={pageLinkCls} title={many ? `Show the original exam pages (${pages.length})` : "Show the original exam page"}>
        <FileText className="size-3.5" />
        {many ? "Pages" : "Page"} {pages.join(", ")}
        <ExternalLink className="size-3" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92dvh] w-[min(96vw,860px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
          <div className="flex items-center gap-3 border-b px-4 py-3 pr-12">
            <DialogTitle className="truncate text-sm font-semibold">{title}</DialogTitle>
            <span className="shrink-0 text-xs text-muted-foreground">
              {many ? `${pages.length} pages` : `Page ${pages[0]}`}
            </span>
          </div>
          <div className="grid gap-4 overflow-y-auto bg-muted/50 p-3 sm:p-4">
            {pages.map((p) => (
              <figure key={p} className="grid gap-1.5">
                <figcaption className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  Page {p}
                  <a href={pageImageUrl(paperId, p)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground">
                    Open <ExternalLink className="size-3" />
                  </a>
                </figcaption>
                <img src={pageImageUrl(paperId, p)} alt={`Exam page ${p}`} loading="lazy" className="w-full rounded-md border bg-white shadow-sm" />
              </figure>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SerialMark({ n }: { n: number }) {
  return (
    <span className="shrink-0 text-base font-bold text-primary tabular-nums" aria-label={`Question ${n}`}>
      {n}.
    </span>
  );
}

/** Question text, figures, then the MCQ check or the mark scheme. `part`: one part of a whole question. */
function QuestionBody({ q, meta, serial, part = false, label }: { q: CardQuestion; meta: PaperMeta; serial?: number; part?: boolean; label?: string | null }) {
  const [revealed, setRevealed] = useState(false);
  // MCQ: tapping an option only selects it; "Check answer" marks it (or, with nothing chosen, just shows the answer).
  const [choice, setChoice] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const correct = q.answer?.correctOption?.toUpperCase() ?? null;
  // MCQs with a known answer are answered by clicking an option; everything else shows the mark scheme.
  const quiz = q.options.length > 0 && !!correct;

  return (
    <>
      {/* Question */}
      {part ? (
        // each part keeps its own marks, like the paper
        <div className="flex items-start gap-3">
          {label && <span className="shrink-0 text-base font-semibold">{label}</span>}
          <MathText className="min-w-0 flex-1 text-base">{q.text}</MathText>
          {q.marks != null && (
            <span className="shrink-0 pt-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums">
              [{q.marks} mark{q.marks === 1 ? "" : "s"}]
            </span>
          )}
        </div>
      ) : serial != null ? (
        // Position in the list (1, 2, 3…) in front of the question text
        <div className="flex gap-2.5">
          <SerialMark n={serial} />
          <MathText className="min-w-0 flex-1 text-base">{q.text}</MathText>
        </div>
      ) : (
        <MathText className="text-base">{q.text}</MathText>
      )}

        {/* Figures: on laptops two share a row (left-aligned, wrapping when too wide).
            MCQ figures stay one under another, so the A–D answer diagram sits just above the options. */}
        {q.images.length > 0 && (
          <div className={cn("grid gap-3", q.images.length > 1 && q.options.length === 0 && "lg:flex lg:flex-wrap lg:items-start")}>
            {q.images.map((img, i) => (
              <QuestionImage key={`${img.page}-${i}`} image={img} paperId={meta.id} alt={`Figure ${i + 1} for question ${q.number}`} />
            ))}
          </div>
        )}

        {/* MCQ: click an option to check it */}
        {q.options.length > 0 && (
          <div className="grid gap-2">
            {quiz && !checked && <p className="text-xs text-muted-foreground">Choose an answer and press Check answer, or press it to see the answer.</p>}
            <ul className="grid gap-2" role={quiz ? "radiogroup" : undefined} aria-label={quiz ? "Answer options" : undefined}>
              {q.options.map((opt) => {
                const label = opt.label.toUpperCase();
                const isRight = checked && label === correct;
                const isWrong = checked && choice === label && label !== correct;
                const faded = checked && !isRight && !isWrong;
                const chosen = !checked && choice === label;
                const body = (
                  <>
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground/15 text-[13px] font-bold transition-colors duration-200",
                        isRight && "border-emerald-600 bg-emerald-600 text-white",
                        isWrong && "border-red-600 bg-red-600 text-white",
                        chosen && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {isRight ? <Check className="size-3.5" /> : isWrong ? <X className="size-3.5" /> : opt.label}
                    </span>
                    <MathText inline className="min-w-0 flex-1 text-[15px]">
                      {opt.text}
                    </MathText>
                  </>
                );
                const cls = cn(
                  "flex min-h-13 w-full items-center gap-3 rounded-xl border-[1.5px] border-foreground/12 px-3 py-2 text-left transition-[background-color,border-color,opacity] duration-200",
                  isRight && "border-emerald-500/70 bg-emerald-500/10",
                  isWrong && "border-red-500/70 bg-red-500/10",
                  faded && "opacity-55",
                  chosen && "border-primary bg-primary/[0.07] ring-1 ring-primary/30",
                );
                return (
                  <li key={opt.label}>
                    {quiz ? (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={choice === label}
                        disabled={checked}
                        onClick={() => setChoice(label)}
                        className={cn(cls, !checked && !chosen && "cursor-pointer hover:border-primary/50 hover:bg-primary/5 active:scale-[0.995]")}
                      >
                        {body}
                      </button>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
            {quiz && !checked && (
              <Button size="lg" className="w-full gap-2 sm:w-fit" onClick={() => setChecked(true)}>
                <CircleCheck className="size-4" />
                Check answer
              </Button>
            )}
            {checked && (
              <div
                role="status"
                className={cn(
                  "enter-up flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                  !choice || choice === correct ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400",
                )}
              >
                <span className="flex items-center gap-2">
                  {!choice || choice === correct ? <Check className="size-4" /> : <X className="size-4" />}
                  {!choice ? `The correct answer is ${correct}.` : choice === correct ? "Correct!" : `Wrong answer. The correct answer is ${correct}.`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setChecked(false);
                    setChoice(null);
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                >
                  <RotateCcw className="size-3" /> Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* Written questions: the mark scheme */}
        {!quiz && (
          <div className={cn("grid", revealed ? "gap-3" : "gap-0", "transition-[gap] duration-200")}>
            <Button
              variant={revealed || part ? "outline" : "default"}
              size={part ? "default" : "lg"}
              className="w-full gap-2 sm:w-fit"
              onClick={() => setRevealed((r) => !r)}
              disabled={!q.answer}
            >
              {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {!q.answer ? "No answer available" : revealed ? "Hide answer" : "Show answer"}
            </Button>

            {q.answer && (
              <Collapse open={revealed}>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                  <p className="mb-1.5 text-xs font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                    {correct ? `Correct answer: ${correct}` : "Mark scheme"}
                  </p>
                  {!correct && <MathText className="text-sm">{q.answer.text}</MathText>}
                </div>
              </Collapse>
            )}
          </div>
        )}

    </>
  );
}

/**
 * Similar questions inside the card: the list on the left (a swipe row on phones), the chosen
 * question previewed on the right. ‹ › buttons and the arrow keys step through the list.
 */
function SimilarPanel({ list, selectable }: { list: SimilarItem[]; selectable: boolean }) {
  const [index, setIndex] = useState(0);
  const i = Math.min(index, list.length - 1);
  const current = list[i];
  const go = (k: number) => setIndex(Math.max(0, Math.min(list.length - 1, k)));
  const shortSource = (s: SimilarItem) => `${s.meta.seasonName} ${s.meta.year} · Paper ${s.meta.paperCode} · Q${s.question.number}`;
  const arrow = "flex size-8 items-center justify-center rounded-full border bg-background shadow-xs transition-[opacity,scale] hover:scale-105 active:scale-95 disabled:opacity-35";

  return (
    <div
      className="fade-in mt-3 grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl border lg:grid-cols-[250px_minmax(0,1fr)]"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          go(i - 1);
        }
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          go(i + 1);
        }
      }}
    >
      <div role="tablist" aria-label="Similar questions" className="flex gap-1.5 overflow-x-auto border-b bg-muted/50 p-2 lg:max-h-[680px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:border-r lg:border-b-0">
        {list.map((s, k) => {
          const on = k === i;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => go(k)}
              className={cn("grid w-[220px] shrink-0 gap-1 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 lg:w-full", on && "border-primary ring-1 ring-primary/25")}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold">
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px]", on && "bg-primary text-primary-foreground")}>{k + 1}</span>
                <span className="truncate">{shortSource(s)}</span>
              </span>
              <span className="truncate text-xs text-muted-foreground">{s.question.subtopic || s.question.topic}</span>
              <span className="flex flex-wrap gap-1">
                <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                  {typeLabel[s.question.type]}
                </Badge>
                <Badge className={cn("h-5 border-transparent px-1.5 text-[11px] font-normal", difficultyStyle[s.question.difficulty])}>{difficultyLabel(s.question.difficulty)}</Badge>
              </span>
            </button>
          );
        })}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
          <button type="button" className={arrow} onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous similar question">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" className={arrow} onClick={() => go(i + 1)} disabled={i === list.length - 1} aria-label="Next similar question">
            <ChevronRight className="size-4" />
          </button>
          <span className="text-sm font-medium">
            Similar {i + 1} of {list.length}
          </span>
        </div>
        <div key={current.key} className="fade-in">
          <QuestionCard question={current.question} meta={current.meta} selectable={selectable} className="rounded-none border-0" />
        </div>
      </div>
    </div>
  );
}

/** Adds / removes the question (all its parts) from the PDF selection (re-renders only this button). */
function SelectButton({ ids }: { ids: string[] }) {
  const on = useAllSelected(ids);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => (on ? selection.removeMany(ids) : selection.addMany(ids))}
      className={cn(
        "btn-soft flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors active:scale-95",
        on ? "border-primary bg-primary text-primary-foreground" : "border-[color:var(--btn-border)] bg-card text-foreground hover:bg-muted",
      )}
      title={on ? "Remove from PDF" : "Add to PDF"}
    >
      {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      {on ? "Added" : "Add to PDF"}
    </button>
  );
}

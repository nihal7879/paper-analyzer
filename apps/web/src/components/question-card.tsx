import { Check, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, EyeOff, FileText, Plus, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { memo, useState } from "react";
import { Link } from "react-router";
import { Collapse } from "@/components/collapse";
import { MathText } from "@/components/math-text";
import { PaperDownloadMenu } from "@/components/pdf-download";
import { QuestionImage } from "@/components/question-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { sourceLine, type PaperMeta, type Question } from "@/lib/api";
import { pageImageUrl, type DisplayImage } from "@/lib/review";
import { difficultyLabel, difficultyStyle, typeLabel } from "@/lib/format";
import { useSimilarMode } from "@/lib/preferences";
import { selection, useIsSelected } from "@/lib/selection";
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
}: {
  question: CardQuestion;
  meta: PaperMeta;
  showConfidence?: boolean;
  className?: string;
  /** Similar questions from other papers (already resolved, best first). */
  similar?: SimilarItem[];
  /** Students: "Add to PDF" button and the paper download menu. */
  selectable?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [showSimilar, setShowSimilar] = useState(false);
  const similarMode = useSimilarMode();
  const correct = q.answer?.correctOption?.toUpperCase() ?? null;
  // MCQs with a known answer are answered by clicking an option; everything else shows the mark scheme.
  const quiz = q.options.length > 0 && !!correct;
  const lowConfidence = q.confidence < 0.7;

  return (
    <Card className={cn("gap-0 overflow-hidden rounded-[14px] border border-foreground/12 p-0 ring-0", showConfidence && lowConfidence && "ring-2 ring-amber-400/60", className)}>
      {/* Source */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted px-4 py-3 text-sm sm:px-5">
        <span className="min-w-0 font-semibold">{sourceLine(meta, q.number)}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {/* The question's original exam page (opens in a new tab) */}
          <a
            href={pageImageUrl(meta.id, q.page)}
            target="_blank"
            rel="noreferrer"
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
            title="Open the original exam page"
          >
            <FileText className="size-3.5" />
            Page {q.pages.join(", ")}
            <ExternalLink className="size-3" />
          </a>
          {selectable && (
            <>
              <PaperDownloadMenu meta={meta}>
                <Download className="size-3.5" /> Paper
              </PaperDownloadMenu>
              <SelectButton id={q.id} />
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3.5 px-4 py-4 sm:px-5 sm:py-5">
        {/* Badges + topic */}
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{typeLabel[q.type]}</Badge>
            {q.marks != null && (
              <Badge variant="outline">
                {q.marks} mark{q.marks === 1 ? "" : "s"}
              </Badge>
            )}
            <Badge className={cn("border-transparent", difficultyStyle[q.difficulty])}>{difficultyLabel(q.difficulty)}</Badge>
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
            {q.subtopic && <> › {q.subtopic}</>}
          </p>
        </>

        {/* Question */}
        <div className="grid gap-3">
          {!selectable && <p className="text-sm font-semibold text-muted-foreground">Question {q.number}</p>}
          <MathText className="text-base">{q.text}</MathText>
        </div>

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
            {quiz && !picked && <p className="text-xs text-muted-foreground">Choose an answer to check it.</p>}
            <ul className="grid gap-2">
              {q.options.map((opt) => {
                const label = opt.label.toUpperCase();
                const isRight = picked != null && label === correct;
                const isWrong = picked === label && label !== correct;
                const faded = picked != null && !isRight && !isWrong;
                const body = (
                  <>
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-foreground/15 text-[13px] font-bold transition-colors duration-200",
                        isRight && "border-emerald-600 bg-emerald-600 text-white",
                        isWrong && "border-red-600 bg-red-600 text-white",
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
                );
                return (
                  <li key={opt.label}>
                    {quiz ? (
                      <button
                        type="button"
                        disabled={picked != null}
                        onClick={() => setPicked(label)}
                        className={cn(cls, !picked && "cursor-pointer hover:border-primary/50 hover:bg-primary/5 active:scale-[0.995]")}
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
            {picked && (
              <div
                role="status"
                className={cn(
                  "enter-up flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                  picked === correct ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400",
                )}
              >
                <span className="flex items-center gap-2">
                  {picked === correct ? <Check className="size-4" /> : <X className="size-4" />}
                  {picked === correct ? "Correct!" : `Wrong answer. The correct answer is ${correct}.`}
                </span>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
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
              variant={revealed ? "outline" : "default"}
              size="lg"
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

/** Adds / removes the question from the PDF selection (re-renders only this button). */
function SelectButton({ id }: { id: string }) {
  const on = useIsSelected(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => selection.toggle(id)}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors active:scale-95",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
      title={on ? "Remove from PDF" : "Add to PDF"}
    >
      {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      {on ? "Added" : "Add to PDF"}
    </button>
  );
}

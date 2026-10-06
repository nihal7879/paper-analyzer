import { Check, ChevronDown, Download, ExternalLink, Eye, EyeOff, FileText, Plus, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { memo, useState } from "react";
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
import { selection, useIsSelected } from "@/lib/selection";
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
  onOpenSimilar,
  selectable = false,
}: {
  question: CardQuestion;
  meta: PaperMeta;
  showConfidence?: boolean;
  className?: string;
  /** Similar questions from other papers (already resolved, best first). */
  similar?: SimilarItem[];
  onOpenSimilar?: (item: SimilarItem) => void;
  /** Students: "Add to PDF" button and the paper download menu. */
  selectable?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [showSimilar, setShowSimilar] = useState(false);
  const correct = q.answer?.correctOption?.toUpperCase() ?? null;
  // MCQs with a known answer are answered by clicking an option; everything else shows the mark scheme.
  const quiz = q.options.length > 0 && !!correct;
  const lowConfidence = q.confidence < 0.7;

  return (
    <Card className={cn("gap-0 overflow-hidden p-0", showConfidence && lowConfidence && "ring-2 ring-amber-400/60", className)}>
      {/* Source */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted/40 px-4 py-2.5 text-sm sm:px-5 sm:py-2 lg:gap-y-1.5">
        <span className="min-w-0 font-medium">{sourceLine(meta, q.number)}</span>
        <div className="-mr-1 ml-auto flex items-center gap-1 lg:mr-0">
          <a
            href={pageImageUrl(meta.id, q.page)}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
            title="Open the original page"
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

      <div className="grid gap-4 px-4 py-4 sm:px-5 sm:py-5">
        {/* Badges + topic */}
        <div className="grid gap-2">
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
        </div>

        {/* Question */}
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-muted-foreground">Question {q.number}</p>
          <MathText className="text-[15px]">{q.text}</MathText>
        </div>

        {q.images.map((img, i) => (
          <QuestionImage key={`${img.page}-${i}`} image={img} paperId={meta.id} alt={`Figure ${i + 1} for question ${q.number}`} />
        ))}

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
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-200",
                        isRight && "border-emerald-600 bg-emerald-600 text-white",
                        isWrong && "border-red-600 bg-red-600 text-white",
                      )}
                    >
                      {isRight ? <Check className="size-3.5" /> : isWrong ? <X className="size-3.5" /> : opt.label}
                    </span>
                    <MathText inline className="min-w-0 flex-1">
                      {opt.text}
                    </MathText>
                  </>
                );
                const cls = cn(
                  "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-[background-color,border-color,opacity] duration-200",
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

        {/* Similar questions (by meaning, from other papers) */}
        {similar.length > 0 && (
          <div className="border-t pt-3">
            <button
              type="button"
              aria-expanded={showSimilar}
              onClick={() => setShowSimilar((s) => !s)}
              className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-sm font-medium text-primary hover:underline"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-4" /> Similar questions ({similar.length})
              </span>
              <ChevronDown className={cn("size-4 transition-transform duration-200", showSimilar && "rotate-180")} />
            </button>
            {/* Only built when opened: keeps long lists light */}
            {showSimilar && (
              <ul className="enter-up grid gap-1.5 pt-2">
                {similar.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => onOpenSimilar?.(s)}
                      className="grid w-full gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                        {sourceLine(s.meta, s.question.number)}
                        <Badge variant="outline" className="font-normal">
                          {typeLabel[s.question.type]}
                          {s.question.marks != null ? ` · ${s.question.marks} mark${s.question.marks === 1 ? "" : "s"}` : ""}
                        </Badge>
                        <Badge className={cn("border-transparent font-normal", difficultyStyle[s.question.difficulty])}>{difficultyLabel(s.question.difficulty)}</Badge>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {s.question.topic}
                        {s.question.subtopic ? ` › ${s.question.subtopic}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
});

/** Adds / removes the question from the PDF selection (re-renders only this button). */
function SelectButton({ id }: { id: string }) {
  const on = useIsSelected(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => selection.toggle(id)}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors active:scale-95 lg:h-auto lg:px-2 lg:py-1",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
      title={on ? "Remove from PDF" : "Add to PDF"}
    >
      {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      {on ? "Added" : "Add to PDF"}
    </button>
  );
}

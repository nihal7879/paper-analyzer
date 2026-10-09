import { ArrowLeft, Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { SelectionBar } from "@/components/pdf-download";
import { QuestionCard } from "@/components/question-card";
import { Logo } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/lib/admin";
import { AdminMenu } from "@/components/admin-menu";
import { sourceLine } from "@/lib/api";
import { difficultyLabel, difficultyStyle, typeLabel } from "@/lib/format";
import { useEntries } from "@/lib/bank-api";
import type { BankEntry } from "@/lib/question-bank";
import { useSelection } from "@/lib/selection";
import { cn } from "@/lib/utils";

/** Same number as the card's "Similar questions (5)". */
const SIMILAR_COUNT = 5;

/**
 * /similar/:id — a question and its similar questions on their own page:
 * the list on the left (a swipe row on phones), the chosen one in full on the right.
 * ‹ › buttons and the ← → keys step through; ?i= keeps the position in the link.
 */
export function SimilarPage() {
  const { isAdmin } = useAdmin();
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const selected = useSelection();
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // The question, then its similar ones (best first), asked from the server by id.
  const originQuery = useEntries(useMemo(() => [id], [id]));
  const origin = originQuery.byId.get(id);
  const similarIds = useMemo(() => origin?.question.similarIds.slice(0, SIMILAR_COUNT + 3) ?? [], [origin]);
  const similarQuery = useEntries(similarIds);
  // Item 0 is the student's own question, then the similar ones (best first).
  const items: BankEntry[] = useMemo(() => (origin ? [origin, ...similarQuery.entries.slice(0, SIMILAR_COUNT)] : []), [origin, similarQuery.entries]);
  const selectedEntries = useEntries(selected);
  const last = items.length - 1;
  const index = Math.min(Math.max(Number(params.get("i") ?? 1) || 0, 0), Math.max(last, 0));
  const current = items[index];

  const go = useCallback(
    (i: number) => {
      if (i < 0 || i > last) return;
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set("i", String(i));
        return next;
      }, { replace: true, preventScrollReset: true });
    },
    [last, setParams],
  );

  // ← → anywhere on the page (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  // Back to the list where the student was (or the list itself when opened from a link)
  const back = () => (location.key !== "default" ? navigate(-1) : navigate("/"));

  if (originQuery.isLoading || similarQuery.isLoading)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  if (!origin)
    return (
      <Card className="items-center gap-3 px-6 py-14 text-center">
        <p className="font-medium">This question is not available.</p>
        <Button nativeButton={false} render={<Link to="/" />}>
          Back to questions
        </Button>
      </Card>
    );

  const shortSource = (e: BankEntry) => `${e.meta.seasonName} ${e.meta.year} · Paper ${e.meta.paperCode} · Q${e.question.number}`;

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-4", selected.length > 0 && "pb-20")}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Logo compact />
        <Button variant="outline" className="gap-1.5" onClick={back}>
          <ArrowLeft className="size-4" /> Back to questions
        </Button>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5 text-primary" /> Similar questions
        </h1>
        <span className="text-sm text-muted-foreground">to {sourceLine(origin.meta, origin.question.number)}</span>
        {isAdmin && (
          <div className="ml-auto">
            <AdminMenu />
          </div>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-6">
        {/* List */}
        <nav aria-label="Similar questions" className="lg:sticky lg:top-[calc(var(--header-h)+1rem)]">
          <div role="tablist" className="panel-scroll flex gap-2 overflow-x-auto rounded-2xl border bg-card p-2 lg:max-h-[calc(100vh-7rem)] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
            {items.map((e, k) => {
              const on = k === index;
              return (
                <button
                  key={e.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => go(k)}
                  className={cn(
                    "grid w-[230px] shrink-0 gap-1 rounded-xl border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 lg:w-full",
                    on && "border-primary ring-1 ring-primary/25",
                    k === 0 && "bg-muted/60",
                  )}
                >
                  <span className="flex items-center gap-2 text-[13px] font-semibold">
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px]", on && "bg-primary text-primary-foreground")}>{k === 0 ? "★" : k}</span>
                    <span className="truncate">{k === 0 ? "Your question" : shortSource(e)}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{k === 0 ? shortSource(e) : e.question.subtopic || e.question.topic}</span>
                  <span className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                      {typeLabel[e.question.type]}
                    </Badge>
                    <Badge className={cn("h-5 border-transparent px-1.5 text-[11px] font-normal", difficultyStyle[e.question.difficulty])}>{difficultyLabel(e.question.difficulty)}</Badge>
                    {selectedSet.has(e.question.id) && (
                      <Badge className="h-5 gap-0.5 border-transparent bg-primary px-1.5 text-[11px] font-normal text-primary-foreground">
                        <Check className="size-3" /> In PDF
                      </Badge>
                    )}
                  </span>
                </button>
              );
            })}
            {items.length === 1 && <p className="p-3 text-sm text-muted-foreground">No similar questions yet.</p>}
          </div>
        </nav>

        {/* Preview */}
        {current && (
          <section className="grid min-w-0 gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(index - 1)}
                disabled={index === 0}
                aria-label="Previous"
                className="flex size-10 items-center justify-center rounded-full border bg-background shadow-xs transition-[opacity,scale] hover:scale-105 active:scale-95 disabled:opacity-35"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                disabled={index === last}
                aria-label="Next"
                className="flex size-10 items-center justify-center rounded-full border bg-background shadow-xs transition-[opacity,scale] hover:scale-105 active:scale-95 disabled:opacity-35"
              >
                <ChevronRight className="size-5" />
              </button>
              <span className="font-medium">{index === 0 ? "Your question" : `Similar ${index} of ${last}`}</span>
              <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
                <kbd className="rounded border bg-muted px-1 font-sans">←</kbd> <kbd className="rounded border bg-muted px-1 font-sans">→</kbd> to move
              </span>
            </div>
            <div key={current.key} className="fade-in">
              <QuestionCard question={current.question} meta={current.meta} selectable />
            </div>
          </section>
        )}
      </div>

      {/* Same bottom bar as the questions page: what is picked for the PDF */}
      <SelectionBar ids={selected} byId={selectedEntries.byId} />
    </div>
  );
}

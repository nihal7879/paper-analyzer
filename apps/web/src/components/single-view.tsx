import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { QuestionCard, type SimilarItem } from "@/components/question-card";
import { Button } from "@/components/ui/button";
import type { BankEntry } from "@/lib/question-bank";

/**
 * One question at a time: ‹ › buttons, ← → keys, swipe left / right on phones, and a progress bar.
 */
export function SingleQuestionView({
  results,
  index,
  onIndex,
  similarById,
}: {
  results: BankEntry[];
  index: number;
  onIndex: (i: number) => void;
  similarById: Map<string, SimilarItem[]>;
}) {
  const total = results.length;
  const i = Math.min(index, total - 1);
  const current = results[i];
  const go = (k: number) => {
    if (k < 0 || k >= total) return;
    onIndex(k);
    // keep the question's top in view after moving
    const top = topRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 64) topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const topRef = useRef<HTMLDivElement>(null);
  const goRef = useRef(go);
  goRef.current = go;

  // ← → keys (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.closest("[role=dialog]") || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") goRef.current(i - 1);
      if (e.key === "ArrowRight") goRef.current(i + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i]);

  // swipe left / right
  const touch = useRef<{ x: number; y: number } | null>(null);

  const arrow =
    "flex size-10 items-center justify-center rounded-full border bg-background shadow-xs transition-[opacity,scale] hover:scale-105 active:scale-95 disabled:opacity-35";

  return (
    <div ref={topRef} className="grid scroll-mt-20 gap-3">
      <div className="flex items-center gap-2">
        <button type="button" className={arrow} onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous question">
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" className={arrow} onClick={() => go(i + 1)} disabled={i === total - 1} aria-label="Next question">
          <ChevronRight className="size-5" />
        </button>
        <span className="text-sm font-medium tabular-nums">
          Question {i + 1} of {total}
        </span>
        <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
          <kbd className="rounded border bg-muted px-1 font-sans">←</kbd> <kbd className="rounded border bg-muted px-1 font-sans">→</kbd> to move
        </span>
        <span className="ml-auto text-xs text-muted-foreground lg:hidden">Swipe to move</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((i + 1) / total) * 100}%` }} />
      </div>

      <div
        key={current.key}
        className="fade-in"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? i + 1 : i - 1);
        }}
      >
        <QuestionCard question={current.question} meta={current.meta} similar={similarById.get(current.question.id)} selectable />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="lg" className="flex-1 gap-1.5 sm:flex-none" onClick={() => go(i - 1)} disabled={i === 0}>
          <ChevronLeft className="size-4" /> Previous
        </Button>
        <Button size="lg" className="flex-1 gap-1.5 sm:ml-auto sm:flex-none" onClick={() => go(i + 1)} disabled={i === total - 1}>
          Next question <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

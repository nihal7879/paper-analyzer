import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { QuestionCard, type SimilarItem } from "@/components/question-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// One window for the whole app; any card can open it with its similar list.
type State = { list: SimilarItem[]; index: number } | null;
let state: State = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function openSimilarModal(list: SimilarItem[], index = 0) {
  state = { list, index };
  emit();
}
function setState(next: State) {
  state = next;
  emit();
}

/**
 * Similar questions in a pop-up window (Settings → "Similar questions: Pop-up"):
 * round ‹ › arrows beside the window (laptop), Previous / Next at the bottom (phone), ← → keys.
 */
export function SimilarModalHost() {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const item = s ? s.list[s.index] : null;
  const total = s?.list.length ?? 0;
  const go = (step: number) => {
    if (!s) return;
    const index = s.index + step;
    if (index >= 0 && index < s.list.length) setState({ list: s.list, index });
  };
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [item?.key]);

  const arrow =
    "absolute top-1/2 hidden size-[50px] -translate-y-1/2 items-center justify-center rounded-full border border-foreground/12 bg-background text-foreground shadow-[0_12px_32px_rgba(17,19,24,0.16)] transition-[opacity,scale] duration-150 hover:scale-[1.07] active:scale-95 disabled:pointer-events-none disabled:opacity-0 lg:flex";

  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && setState(null)}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-none gap-0 overflow-visible p-0 sm:w-full sm:max-w-3xl"
        onKeyDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(-1);
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(1);
          }
        }}
      >
        <DialogTitle className="sr-only">Similar question</DialogTitle>
        <button type="button" className={cn(arrow, "-left-[66px]")} onClick={() => go(-1)} disabled={!s || s.index === 0} aria-label="Previous similar question">
          <ChevronLeft className="size-[22px] stroke-[2.4]" />
        </button>
        <button type="button" className={cn(arrow, "-right-[66px]")} onClick={() => go(1)} disabled={!s || s.index === total - 1} aria-label="Next similar question">
          <ChevronRight className="size-[22px] stroke-[2.4]" />
        </button>

        <div ref={scrollRef} className="max-h-[92dvh] overflow-y-auto rounded-xl lg:max-h-[90vh]">
          <div className="flex items-center gap-3 border-b py-2.5 pr-14 pl-4 text-sm sm:pl-5">
            <span className="font-medium">
              Similar question {s ? s.index + 1 : 0} of {total}
            </span>
            <span className="flex gap-1" aria-hidden>
              {s?.list.map((x, i) => (
                <span key={x.key} className={cn("size-1.5 rounded-full bg-foreground/15 transition-colors", i === s.index && "bg-primary")} />
              ))}
            </span>
            <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
              Use <kbd className="rounded border bg-muted px-1 font-sans">←</kbd> <kbd className="rounded border bg-muted px-1 font-sans">→</kbd> to move
            </span>
          </div>
          {item && (
            <div key={item.key} className="fade-in">
              <QuestionCard className="rounded-none border-0 ring-0" question={item.question} meta={item.meta} selectable />
            </div>
          )}
          <div className="sticky bottom-0 flex gap-2 border-t bg-background p-3 lg:hidden">
            <Button variant="outline" size="lg" className="flex-1 gap-1.5" onClick={() => go(-1)} disabled={!s || s.index === 0}>
              <ChevronLeft className="size-4" /> Previous
            </Button>
            <Button variant="outline" size="lg" className="flex-1 gap-1.5" onClick={() => go(1)} disabled={!s || s.index === total - 1}>
              Next <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



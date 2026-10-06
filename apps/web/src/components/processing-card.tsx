import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import type { PaperStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const STEPS: { states: PaperStatus["state"][]; label: string }[] = [
  { states: ["QUEUED", "RENDERING"], label: "Render pages" },
  { states: ["EXTRACTING"], label: "Read questions" },
  { states: ["MARK_SCHEME"], label: "Match answers" },
];

/** Counts smoothly from the shown number to `target` (the status only arrives every 1.5 s). */
function useGlide(target: number, ms = 1200) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const v = a + (target - a) * (1 - (1 - t) ** 3);
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

export function ProcessingCard({ status }: { status: PaperStatus }) {
  const activeIndex = Math.max(0, STEPS.findIndex((s) => s.states.includes(status.state)));
  const pct = useGlide(Math.max(0, Math.min(100, status.progress)));

  return (
    <Card className="gap-5 px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <p key={status.message} className="fade-in font-medium">
          {status.message || "Processing…"}
        </p>
        <span className="text-sm font-semibold text-primary tabular-nums">{Math.round(pct)}%</span>
      </div>

      {/* bar: glides between updates, with a soft moving shine so it never looks stuck */}
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={status.progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-shine h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      {/* stepper: circles joined by a line that fills as each step finishes */}
      <ol className="flex items-start">
        {STEPS.map((s, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={s.label} className="relative flex flex-1 flex-col items-center gap-2 text-center">
              {i > 0 && (
                <span aria-hidden className="absolute top-3.5 right-[calc(50%+18px)] left-[calc(-50%+18px)] h-0.5 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full origin-left bg-primary transition-transform duration-700 ease-out", i <= activeIndex ? "scale-x-100" : "scale-x-0")} />
                </span>
              )}
              <span
                className={cn(
                  "relative flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-[background-color,border-color,color] duration-500",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-muted-foreground/25 text-muted-foreground",
                )}
              >
                {done ? <Check key="done" className="step-pop size-4" /> : i + 1}
                {active && <span aria-hidden className="absolute -inset-[5px] animate-spin rounded-full border-2 border-transparent border-t-primary/60 [animation-duration:1.1s]" />}
              </span>
              <span className={cn("text-xs transition-colors duration-500 sm:text-sm", done ? "text-primary" : active ? "font-medium text-foreground" : "text-muted-foreground")}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      {status.questionsFound > 0 && <p className="text-sm text-muted-foreground">{status.questionsFound} questions found so far</p>}
    </Card>
  );
}

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PaperStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const STEPS: { states: PaperStatus["state"][]; label: string }[] = [
  { states: ["QUEUED", "RENDERING"], label: "Render pages" },
  { states: ["EXTRACTING"], label: "Read questions" },
  { states: ["MARK_SCHEME"], label: "Match answers" },
];

export function ProcessingCard({ status }: { status: PaperStatus }) {
  const activeIndex = STEPS.findIndex((s) => s.states.includes(status.state));
  return (
    <Card className="gap-4 px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{status.message || "Processing…"}</p>
        <span className="text-sm font-semibold text-primary tabular-nums">{status.progress}%</span>
      </div>
      <Progress value={status.progress} />
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {STEPS.map((s, i) => (
          <span
            key={s.label}
            className={cn("text-muted-foreground", i < activeIndex && "text-emerald-600 dark:text-emerald-400", i === activeIndex && "font-medium text-foreground")}
          >
            {i < activeIndex ? "✓ " : `${i + 1}. `}
            {s.label}
          </span>
        ))}
      </div>
      {status.questionsFound > 0 && <p className="text-sm text-muted-foreground">{status.questionsFound} questions found so far</p>}
    </Card>
  );
}

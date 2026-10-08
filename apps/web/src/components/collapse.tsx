import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Smooth open/close for content of unknown height. Closed content is inert (not focusable). */
export function Collapse({ open, children, className }: { open: boolean; children: React.ReactNode; className?: string }) {
  // Content that mounts already open (built on first click) starts closed for one frame, so it slides open too.
  // (Mounted closed — e.g. every question card — needs nothing extra.)
  const [ready, setReady] = useState(!open);
  useEffect(() => {
    if (ready) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => (inner = requestAnimationFrame(() => setReady(true))));
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [ready]);
  const shown = open && ready;
  return (
    <div className={cn("collapsible", className)} data-open={shown} inert={!open} aria-hidden={!open}>
      <div>{children}</div>
    </div>
  );
}














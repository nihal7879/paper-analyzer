import { cn } from "@/lib/utils";

/** Smooth open/close for content of unknown height. Closed content is inert (not focusable). */
export function Collapse({ open, children, className }: { open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("collapsible", className)} data-open={open} inert={!open} aria-hidden={!open}>
      <div>{children}</div>
    </div>
  );
}

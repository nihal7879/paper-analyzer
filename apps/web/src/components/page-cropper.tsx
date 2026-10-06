import { Crop, ImageOff, MousePointerClick, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState } from "react";
import { CropImage } from "@/components/question-image";
import { Button } from "@/components/ui/button";
import { pageImageUrl, type Box } from "@/lib/review";
import { cn } from "@/lib/utils";

export interface CropRegion {
  page: number;
  box: Box;
}

/**
 * Original page with the question's figure boxes drawn on top.
 * Drag on the page to add a box; click × to remove one.
 */
export function PageCropper({
  paperId,
  pages,
  initialPage,
  regions,
  onChange,
}: {
  paperId: string;
  pages: number[];
  initialPage: number;
  regions: CropRegion[];
  onChange: (regions: CropRegion[]) => void;
}) {
  const [page, setPage] = useState(initialPage);
  const [zoom, setZoom] = useState(1);
  const [draft, setDraft] = useState<Box | null>(null);
  const [missing, setMissing] = useState<Record<number, boolean>>({});
  const start = useRef<{ x: number; y: number } | null>(null);
  const surface = useRef<HTMLDivElement>(null);

  function point(e: React.PointerEvent) {
    const rect = surface.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-box-action]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = point(e);
    setDraft({ x0: start.current.x, y0: start.current.y, x1: start.current.x, y1: start.current.y });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const p = point(e);
    setDraft({
      x0: Math.min(start.current.x, p.x),
      y0: Math.min(start.current.y, p.y),
      x1: Math.max(start.current.x, p.x),
      y1: Math.max(start.current.y, p.y),
    });
  }

  function onPointerUp() {
    if (draft && draft.x1 - draft.x0 > 0.02 && draft.y1 - draft.y0 > 0.015) {
      onChange([...regions, { page, box: draft }]);
    }
    start.current = null;
    setDraft(null);
  }

  const onPage = regions.map((r, i) => ({ ...r, index: i })).filter((r) => r.page === page);

  return (
    <div className="grid gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {pages.map((p) => (
            <Button key={p} size="sm" variant={p === page ? "secondary" : "ghost"} onClick={() => setPage(p)} disabled={missing[p]}>
              Page {p}
              {regions.some((r) => r.page === p) && <span className="size-1.5 rounded-full bg-primary" />}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
            <ZoomOut />
          </Button>
          <span className="w-10 text-center text-xs text-muted-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button size="icon-sm" variant="ghost" aria-label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>
            <ZoomIn />
          </Button>
        </div>
      </div>

      {/* Page */}
      <div className="max-h-[70vh] overflow-auto rounded-lg border bg-muted/40">
        {missing[page] ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ImageOff className="size-6" /> Page image not available
          </div>
        ) : (
          <div
            ref={surface}
            className="relative cursor-crosshair touch-none select-none"
            style={{ width: `${zoom * 100}%` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              src={pageImageUrl(paperId, page)}
              alt={`Original page ${page}`}
              draggable={false}
              className="block w-full bg-white"
              onError={() => setMissing((m) => ({ ...m, [page]: true }))}
            />
            {onPage.map((r) => (
              <div
                key={r.index}
                className="absolute border-2 border-primary bg-primary/10"
                style={{ left: `${r.box.x0 * 100}%`, top: `${r.box.y0 * 100}%`, width: `${(r.box.x1 - r.box.x0) * 100}%`, height: `${(r.box.y1 - r.box.y0) * 100}%` }}
              >
                <span className="absolute -top-6 left-0 rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                  Figure {r.index + 1}
                </span>
                <button
                  type="button"
                  data-box-action
                  aria-label={`Remove figure ${r.index + 1}`}
                  onClick={() => onChange(regions.filter((_, i) => i !== r.index))}
                  className="absolute -top-3 -right-3 flex size-6 items-center justify-center rounded-full bg-destructive text-white shadow"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {draft && (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/15"
                style={{ left: `${draft.x0 * 100}%`, top: `${draft.y0 * 100}%`, width: `${(draft.x1 - draft.x0) * 100}%`, height: `${(draft.y1 - draft.y0) * 100}%` }}
              />
            )}
          </div>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MousePointerClick className="size-3.5" /> Drag on the page to add a figure. Students see exactly the boxed area.
      </p>

      {/* Crops */}
      {regions.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {regions.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(r.page)}
              className={cn("group relative overflow-hidden rounded-lg border bg-white p-1 text-left", r.page === page && "ring-2 ring-primary/40")}
            >
              <CropImage src={pageImageUrl(paperId, r.page)} box={r.box} alt={`Figure ${i + 1}`} />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                Fig {i + 1} · p{r.page}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
          <Crop className="size-3.5" /> No figures. Questions without a diagram don't need one.
        </p>
      )}
    </div>
  );
}

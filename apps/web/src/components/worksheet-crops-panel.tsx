import { useQueryClient } from "@tanstack/react-query";
import { Crop, ImageOff, Loader2, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageCropper, type CropRegion } from "@/components/page-cropper";
import { Button } from "@/components/ui/button";
import { api, fileUrl, type Question } from "@/lib/api";

type Source = "QP" | "MS";
type Crop = NonNullable<Question["crops"]>[number];

/**
 * Editor tab "Worksheet": the part exactly as it prints in a downloaded worksheet — its crop from the question
 * paper and its rows from the mark scheme — each with "Adjust" to redraw the box on the original page.
 */
export function WorksheetCropsPanel({ paperId, question }: { paperId: string; question: Question }) {
  return (
    <div className="grid gap-6 p-4 sm:p-5">
      <CropSection
        paperId={paperId}
        question={question}
        source="QP"
        title="Question (as printed)"
        crops={question.crops ?? []}
        pages={around(question.pages?.length ? question.pages : [question.page])}
      />
      <CropSection
        paperId={paperId}
        question={question}
        source="MS"
        title="Mark scheme (as printed)"
        crops={question.msCrops ?? []}
        pages={around((question.msCrops ?? []).map((c) => c.page), 30)}
      />
    </div>
  );
}

/** Pages to choose from when drawing: the crop's pages and a couple either side (or the first pages). */
function around(pages: number[], fallback = 0): number[] {
  if (!pages.length) return Array.from({ length: fallback }, (_, i) => i + 1);
  const lo = Math.max(1, Math.min(...pages) - 2);
  const hi = Math.max(...pages) + 2;
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

function CropSection({ paperId, question, source, title, crops, pages }: { paperId: string; question: Question; source: Source; title: string; crops: Crop[]; pages: number[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = crops.filter((c) => c.path);
  const initial: CropRegion[] = shown.map((c) => ({ page: c.page, box: { x0: c.box.x0, y0: c.box.y0, x1: c.box.x1, y1: c.box.y1 } }));
  const [regions, setRegions] = useState<CropRegion[]>(initial);
  const head = source === "MS" ? (shown[0]?.box as { head?: string } | undefined)?.head : undefined;

  async function save() {
    if (!regions.length) return toast.error("Draw a box around the part first");
    setBusy(true);
    try {
      await api.setCrops(paperId, question.id, { source, regions });
      toast.success(source === "QP" ? "Question crop saved" : "Mark scheme crop saved");
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["paper", paperId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid content-start gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {editing ? (
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="gap-1" onClick={() => { setRegions(initial); setEditing(false); }} disabled={busy}>
              <X className="size-3.5" /> Cancel
            </Button>
            <Button size="sm" className="gap-1" onClick={() => void save()} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save crop
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(true)}>
            <Crop className="size-3.5" /> {shown.length ? "Adjust" : "Draw"}
          </Button>
        )}
      </div>

      {editing ? (
        <>
          <p className="text-xs text-muted-foreground">
            Drag on the page to draw the box{source === "QP" ? " around the whole part (from its number to above the next part)" : " around the part's rows of the table"}. Use the page buttons to move between
            pages; a part that runs over two pages gets one box on each. The printed number inside the box is whited out and the worksheet's own number goes there.
          </p>
          <PageCropper kind={source === "QP" ? "qp" : "ms"} paperId={paperId} pages={pages} initialPage={regions[0]?.page ?? pages[0] ?? 1} regions={regions} onChange={setRegions} />
        </>
      ) : shown.length ? (
        <div className="grid gap-0 overflow-hidden rounded-lg border bg-white p-2">
          {head && <img src={fileUrl(head)} alt="" className="w-full" />}
          {shown.map((c, k) => (
            <img key={k} src={fileUrl(c.path!)} alt={`${title}, page ${c.page}`} className="w-full" />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-6 text-sm text-amber-700 dark:text-amber-400">
          <ImageOff className="size-4 shrink-0" />
          No crop yet: in a downloaded worksheet this part {source === "QP" ? "prints in the typed layout" : "shows the typed answer table"}. Use “Draw” to add it.
        </div>
      )}
    </section>
  );
}

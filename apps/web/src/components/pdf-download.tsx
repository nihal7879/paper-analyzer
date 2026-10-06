import { Download, FileDown, FileText, Loader2, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { downloadPdf, originalPdfUrl, pdfParams, sourceLine, type AnswerMode, type PaperMeta, type PdfRequest } from "@/lib/api";
import type { BankEntry } from "@/lib/question-bank";
import { selection } from "@/lib/selection";
import { cn } from "@/lib/utils";

const ANSWER_OPTIONS: { value: AnswerMode; label: React.ReactNode }[] = [
  { value: "none", label: "No answers" },
  { value: "end", label: <><span className="lg:hidden">At the end</span><span className="hidden lg:inline">Answers at end</span></> },
  { value: "inline", label: <><span className="lg:hidden">After each</span><span className="hidden lg:inline">After each question</span></> },
];

/** Server PDF; if the server can't make it, open the print page so the browser can save it as PDF. */
async function runPdf(req: PdfRequest, fileName: string) {
  const id = toast.loading("Preparing your PDF…");
  try {
    await downloadPdf(req, fileName);
    toast.success("PDF downloaded", { id });
  } catch (e) {
    toast.error(`${e instanceof Error ? e.message : "PDF failed"} · opening the print view instead`, { id });
    window.open(`/print?${pdfParams(req)}&print=1`, "_blank", "noopener");
  }
}

function marksOf(entries: BankEntry[]) {
  return entries.reduce((s, e) => s + (e.question.marks ?? 0), 0);
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "questions";
}

// ---------------------------------------------------------------- whole paper

export function PaperDownloadMenu({ meta, children, className }: { meta: PaperMeta; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const name = safeName(`${meta.subjectName} ${meta.seasonName} ${meta.year} Paper ${meta.paperCode}`);
  const item = "flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted lg:py-2";
  const pick = (answers: AnswerMode) => {
    setOpen(false);
    void runPdf({ paper: meta.id, answers }, answers === "none" ? name : `${name} with answers`);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 data-popup-open:bg-muted lg:h-auto lg:py-1",
          className,
        )}
        title="Download this paper"
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0.5 p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">{sourceLine(meta)}</p>
        <button type="button" className={item} onClick={() => pick("none")}>
          <FileDown className="size-4 text-primary" /> Whole paper (PDF)
        </button>
        <button type="button" className={item} onClick={() => pick("end")}>
          <FileDown className="size-4 text-primary" /> Whole paper + answers
        </button>
        <div className="my-1 border-t" />
        <a className={item} href={originalPdfUrl(meta.id, "qp")} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
          <FileText className="size-4 text-muted-foreground" /> Original question paper
        </a>
        {meta.msFileName && (
          <a className={item} href={originalPdfUrl(meta.id, "ms")} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
            <FileText className="size-4 text-muted-foreground" /> Original mark scheme
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------- selection

/** Floating bar at the bottom while questions are selected. */
export function SelectionBar({ ids, byId }: { ids: string[]; byId: Map<string, BankEntry> }) {
  const [open, setOpen] = useState(false);
  const picked = ids.flatMap((id) => byId.get(id) ?? []);
  const marks = picked.reduce((s, e) => s + (e.question.marks ?? 0), 0);
  const visible = picked.length > 0;

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-4 transition-[transform,opacity] duration-300 ease-out",
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        )}
        aria-hidden={!visible}
        inert={!visible}
      >
        <div className="pointer-events-auto flex w-full max-w-xl items-center gap-2 rounded-2xl border bg-popover/95 p-2 pl-4 shadow-lg ring-1 ring-foreground/5 backdrop-blur">
          <p className="mr-auto min-w-0 text-sm">
            <span className="font-semibold">{picked.length}</span> selected
            <span className="hidden text-muted-foreground sm:inline"> · {marks} mark{marks === 1 ? "" : "s"}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => selection.clear()} className="text-muted-foreground">
            Clear
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Download className="size-4" /> Download PDF
          </Button>
        </div>
      </div>
      <SelectionDialog open={open} onOpenChange={setOpen} picked={picked} />
    </>
  );
}

function SelectionDialog({ open, onOpenChange, picked }: { open: boolean; onOpenChange: (o: boolean) => void; picked: BankEntry[] }) {
  const subjects = [...new Set(picked.map((e) => e.meta.subjectName))];
  const [title, setTitle] = useState("");
  const [answers, setAnswers] = useState<AnswerMode>("end");
  const [busy, setBusy] = useState(false);
  const defaultTitle = `${subjects.length === 1 ? subjects[0] : "Practice"} questions`;

  async function download() {
    setBusy(true);
    const t = title.trim() || defaultTitle;
    await runPdf({ ids: picked.map((e) => e.question.id), answers, title: t }, safeName(t));
    setBusy(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Touch: don't focus the title box on open (it would pop up the keyboard); mouse/keyboard: as before */}
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-lg" initialFocus={(type) => type !== "touch"}>
        <DialogHeader>
          <DialogTitle>Download PDF</DialogTitle>
          <DialogDescription>
            {picked.length} question{picked.length === 1 ? "" : "s"} · {marksOf(picked)} mark{marksOf(picked) === 1 ? "" : "s"}, in the order you added them.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="pdf-title">Title</Label>
          <Input id="pdf-title" className="text-base sm:text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} />
        </div>
        <div className="grid gap-2">
          <Label>Answers</Label>
          <Segmented value={answers} onChange={setAnswers} options={ANSWER_OPTIONS} aria-label="Answers" className="sm:w-full [&>button]:flex-1" />
        </div>

        <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-1">
          {picked.map((e, i) => (
            <li key={e.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{sourceLine(e.meta, e.question.number)}</span>
              <span className="text-xs text-muted-foreground">{e.question.marks ?? "–"}m</span>
              <button type="button" onClick={() => selection.toggle(e.question.id)} className="rounded p-0.5 text-muted-foreground hover:text-destructive" title="Remove">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => { selection.clear(); onOpenChange(false); }}>
            <Trash2 className="size-4" /> Clear selection
          </Button>
          <Button onClick={download} disabled={busy || picked.length === 0} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {busy ? "Preparing…" : "Download PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

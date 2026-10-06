import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Check, FileCheck2, FileUp, Loader2, LockKeyhole, Pencil, Sparkles, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Collapse } from "@/components/collapse";
import { LoginDialog } from "@/components/login-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdmin } from "@/lib/admin";
import { api, ApiError, type DetectedDetails } from "@/lib/api";
import { cn } from "@/lib/utils";

type Slot = "qp" | "ms";

interface PickedFile {
  key: number;
  file: File;
  status: "detecting" | "done" | "error";
  details?: DetectedDetails;
  error?: string;
}

/** The paper details that get uploaded. Filled from detection; the admin only edits if something is wrong. */
interface Draft {
  board: string;
  curriculum: string;
  subjectName: string;
  subjectCode: string;
  year: string;
  seasonCode: string;
  paperCode: string;
  componentName: string;
}

const EMPTY_DRAFT: Draft = { board: "", curriculum: "", subjectName: "", subjectCode: "", year: "", seasonCode: "", paperCode: "", componentName: "" };

function toDraft(d: DetectedDetails): Draft {
  return {
    board: d.board ?? "",
    curriculum: d.curriculum ?? "",
    subjectName: d.subjectName ?? "",
    subjectCode: d.subjectCode ?? "",
    year: d.year ? String(d.year) : "",
    seasonCode: d.seasonCode ?? "",
    paperCode: d.paperCode ?? "",
    componentName: d.componentName ?? "",
  };
}

function draftProblems(d: Draft): string[] {
  const problems: string[] = [];
  if (!/^[A-Za-z0-9]{2,12}$/.test(d.subjectCode)) problems.push("subject code");
  if (!/^(19|20)\d{2}$/.test(d.year)) problems.push("year");
  if (!d.seasonCode) problems.push("season");
  if (!/^[A-Za-z0-9]{1,6}$/.test(d.paperCode)) problems.push("paper number");
  return problems;
}

/** "9702_s26_qp_11.pdf" / "..._ms_..." / "mark scheme" -> best first guess before the AI answers. */
function guessSlot(name: string, files: Record<Slot, PickedFile | null>): Slot {
  if (/(^|[\s_-])(ms|mark)/i.test(name)) return "ms";
  if (/(^|[\s_-])qp/i.test(name)) return "qp";
  return files.qp ? "ms" : "qp";
}

export function UploadPage() {
  const { isAdmin, ready } = useAdmin();
  const [loginOpen, setLoginOpen] = useState(false);

  if (!ready) return null;
  if (!isAdmin) {
    return (
      <Card className="mx-auto max-w-md items-center gap-3 px-6 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LockKeyhole className="size-6" />
        </div>
        <p className="text-lg font-medium">Admin access required</p>
        <p className="text-sm text-muted-foreground">Only admins can upload papers.</p>
        <Button onClick={() => setLoginOpen(true)}>Enter password</Button>
        <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} onSuccess={() => undefined} />
      </Card>
    );
  }
  return <UploadForm />;
}

function UploadForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: api.catalog, staleTime: Infinity });
  const seasonItems = (catalog.data?.seasons ?? []).map((s) => ({ value: s.code, label: s.name }));

  const [files, setFiles] = useState<Record<Slot, PickedFile | null>>({ qp: null, ms: null });
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState(false);
  const editedByUser = useRef(false);
  const nextKey = useRef(1);
  // Latest files for async callbacks (detection finishes after later renders).
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  });

  function applyDetails(details: DetectedDetails) {
    if (editedByUser.current) return;
    const next = toDraft(details);
    setDraft(next);
    setEditing(draftProblems(next).length > 0);
  }

  function addFiles(accepted: File[], forced?: Slot) {
    let current = files;
    for (const file of accepted.slice(0, 2)) {
      const slot = forced ?? guessSlot(file.name, current);
      const picked: PickedFile = { key: nextKey.current++, file, status: "detecting" };
      current = { ...current, [slot]: picked };
      setFiles(current);
      void detect(slot, picked);
    }
  }

  async function detect(slot: Slot, picked: PickedFile) {
    try {
      const details = await api.detect(picked.file);
      if (filesRef.current[slot]?.key !== picked.key) return; // file was removed or replaced meanwhile
      setFiles((prev) => ({ ...prev, [slot]: { ...picked, status: "done", details } }));
      // The question paper decides the details; a mark scheme only fills them when there is no question paper.
      if (slot === "qp" || !filesRef.current.qp?.details) applyDetails(details);
    } catch (err) {
      setFiles((prev) => (prev[slot]?.key === picked.key ? { ...prev, [slot]: { ...picked, status: "error", error: (err as Error).message } } : prev));
      if (slot === "qp") setEditing(true);
    }
  }

  function clear(slot: Slot) {
    setFiles((prev) => ({ ...prev, [slot]: null }));
    if (slot === "qp" && !files.ms) {
      setDraft(EMPTY_DRAFT);
      setEditing(false);
      editedByUser.current = false;
    }
  }

  function swap() {
    const next = { qp: files.ms, ms: files.qp };
    setFiles(next);
    if (next.qp?.details) applyDetails(next.qp.details);
  }

  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    editedByUser.current = true;
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const qp = files.qp;
  const ms = files.ms;
  const detecting = qp?.status === "detecting" || (!qp && ms?.status === "detecting");
  const source = (qp?.details ?? ms?.details)?.source;
  const problems = draftProblems(draft);
  const wrongSlots = qp?.details?.documentType === "MARK_SCHEME" || ms?.details?.documentType === "QUESTION_PAPER";
  const mismatch =
    qp?.details &&
    ms?.details &&
    [qp.details.subjectCode, qp.details.year, qp.details.paperCode].join("|") !== [ms.details.subjectCode, ms.details.year, ms.details.paperCode].join("|");
  const seasonLabel = seasonItems.find((s) => s.value === draft.seasonCode)?.label ?? "";
  const savedAs = problems.length ? null : `${draft.subjectCode.toUpperCase()}_${draft.seasonCode}${draft.year.slice(-2)}_${draft.paperCode}`;
  const canSubmit = !!qp && !detecting && problems.length === 0;

  const upload = useMutation({
    mutationFn: (overwrite: boolean) => {
      const form = new FormData();
      form.set("subjectCode", draft.subjectCode.trim());
      if (draft.subjectName.trim()) form.set("subjectName", draft.subjectName.trim());
      if (draft.board.trim()) form.set("board", draft.board.trim());
      if (draft.curriculum.trim()) form.set("curriculum", draft.curriculum.trim());
      if (draft.componentName.trim()) form.set("componentName", draft.componentName.trim());
      form.set("year", draft.year);
      form.set("seasonCode", draft.seasonCode);
      form.set("paperCode", draft.paperCode.trim());
      form.set("overwrite", String(overwrite));
      form.set("qp", qp!.file);
      if (ms) form.set("ms", ms.file);
      return api.upload(form);
    },
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ["papers"] });
      toast.success("Upload complete. Processing started.");
      navigate(`/admin/papers/${id}`, { viewTransition: true });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && err.message.includes("already exists")) {
        toast.warning(err.message, {
          description: "Replace it? Existing extracted questions will be deleted.",
          action: { label: "Replace", onClick: () => upload.mutate(true) },
          duration: 10_000,
        });
        return;
      }
      toast.error(err.message);
    },
  });

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Upload paper</h1>
        <p className="text-muted-foreground">Drop the question paper and its mark scheme. The AI reads the cover page and fills in the paper details for you.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FileSlot label="Question paper" required picked={qp} onDrop={(f) => addFiles(f, "qp")} onDropMany={(f) => addFiles(f)} onClear={() => clear("qp")} />
        <FileSlot label="Mark scheme" picked={ms} onDrop={(f) => addFiles(f, "ms")} onDropMany={(f) => addFiles(f)} onClear={() => clear("ms")} />
      </div>

      {wrongSlots && (
        <Notice tone="amber">
          It looks like the question paper and mark scheme are in the wrong boxes.
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={swap}>
            <ArrowLeftRight className="size-3.5" /> Swap
          </Button>
        </Notice>
      )}
      {mismatch && <Notice tone="amber">The question paper and mark scheme seem to belong to different papers. Please check the files.</Notice>}

      {/* Paper details: filled automatically */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Paper details</h2>
            {source && !detecting && (
              <Badge variant="secondary" className="gap-1 font-normal">
                <Sparkles className="size-3" /> {source === "ai" ? "Read by AI" : "From file name"}
              </Badge>
            )}
          </div>
          {(qp || ms) && !detecting && (
            <Button variant={editing ? "secondary" : "ghost"} size="sm" className="gap-1.5" onClick={() => setEditing((e) => !e)}>
              {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
              {editing ? "Done" : "Edit"}
            </Button>
          )}
        </div>

        <div className="px-5 py-4">
          {!qp && !ms ? (
            <p className="text-sm text-muted-foreground">Add the question paper above. Board, subject, paper, year and session are detected automatically.</p>
          ) : detecting ? (
            <div className="grid gap-3" aria-live="polite">
              <p className="flex items-center gap-2 text-sm font-medium text-primary">
                <Loader2 className="size-4 animate-spin" /> Reading the cover page…
              </p>
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-80 max-w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-6 w-40 rounded-full" />
              </div>
            </div>
          ) : (
            <div className="enter-up grid gap-3">
              {qp?.status === "error" && <Notice tone="amber">Couldn't read the details automatically ({qp.error}). Please fill them in below.</Notice>}
              {problems.length > 0 && qp?.status !== "error" && <Notice tone="amber">Couldn't find the {problems.join(", ")}. Please add {problems.length === 1 ? "it" : "them"} below.</Notice>}

              {/* Summary */}
              {(draft.subjectName || draft.subjectCode) && (
                <div className="grid gap-1.5">
                  <p className="text-lg font-semibold">
                    {draft.subjectName || "Subject"} {draft.subjectCode && <span className="font-normal text-muted-foreground">({draft.subjectCode.toUpperCase()})</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">{[draft.board, draft.curriculum].filter(Boolean).join(" · ") || "Board not detected"}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(seasonLabel || draft.year) && <Badge variant="outline">{[seasonLabel, draft.year].filter(Boolean).join(" ")}</Badge>}
                    {draft.paperCode && (
                      <Badge variant="outline">
                        Paper {draft.paperCode}
                        {draft.componentName ? ` · ${draft.componentName}` : ""}
                      </Badge>
                    )}
                    {savedAs && <Badge className="border-transparent bg-muted font-mono text-[11px] font-normal text-muted-foreground">{savedAs}</Badge>}
                  </div>
                </div>
              )}

              {/* Correction form (hidden unless needed) */}
              <Collapse open={editing}>
                <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                  <Field label="Exam board" id="board">
                    <Input id="board" value={draft.board} onChange={(e) => edit("board", e.target.value)} placeholder="e.g. Pearson Edexcel" />
                  </Field>
                  <Field label="Curriculum / level" id="curriculum">
                    <Input id="curriculum" value={draft.curriculum} onChange={(e) => edit("curriculum", e.target.value)} placeholder="e.g. Edexcel AS Level" />
                  </Field>
                  <Field label="Subject" id="subjectName">
                    <Input id="subjectName" value={draft.subjectName} onChange={(e) => edit("subjectName", e.target.value)} placeholder="e.g. Physics" />
                  </Field>
                  <Field label="Subject code" id="subjectCode" required>
                    <Input id="subjectCode" value={draft.subjectCode} onChange={(e) => edit("subjectCode", e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 12))} placeholder="e.g. 9702 or 8PH0" />
                  </Field>
                  <Field label="Year" id="year" required>
                    <Input id="year" inputMode="numeric" value={draft.year} onChange={(e) => edit("year", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2026" />
                  </Field>
                  <Field label="Session" required>
                    <Select items={seasonItems} value={draft.seasonCode || null} onValueChange={(v) => edit("seasonCode", (v as string) ?? "")}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose session" />
                      </SelectTrigger>
                      <SelectContent>
                        {seasonItems.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Paper number" id="paperCode" required hint="As printed, e.g. 11 (Cambridge paper 1, variant 1) or 01">
                    <Input id="paperCode" value={draft.paperCode} onChange={(e) => edit("paperCode", e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6))} placeholder="11" />
                  </Field>
                  <Field label="Paper title" id="componentName">
                    <Input id="componentName" value={draft.componentName} onChange={(e) => edit("componentName", e.target.value)} placeholder="e.g. Multiple Choice" />
                  </Field>
                </div>
              </Collapse>
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" size="lg" onClick={() => navigate("/admin/papers", { viewTransition: true })}>
          Cancel
        </Button>
        <Button size="lg" className="gap-2" disabled={!canSubmit || upload.isPending} onClick={() => upload.mutate(false)}>
          <Sparkles className="size-4" />
          {upload.isPending ? "Uploading…" : detecting ? "Reading details…" : "Process with AI"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, id, required, hint, children }: { label: string; id?: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Notice({ tone, children }: { tone: "amber"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        tone === "amber" && "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
      )}
    >
      <TriangleAlert className="size-4 shrink-0" />
      {children}
    </div>
  );
}

function FileSlot({
  label,
  required,
  picked,
  onDrop,
  onDropMany,
  onClear,
}: {
  label: string;
  required?: boolean;
  picked: PickedFile | null;
  onDrop: (files: File[]) => void;
  onDropMany: (files: File[]) => void;
  onClear: () => void;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 2,
    maxSize: 50 * 1024 * 1024,
    // Dropping both files on one box still sorts them into the right slots.
    onDrop: (accepted) => (accepted.length > 1 ? onDropMany(accepted) : onDrop(accepted)),
    onDropRejected: (rejections) => toast.error(rejections[0]?.errors[0]?.message ?? "Only PDF files up to 50 MB"),
  });

  if (picked) {
    return (
      <Card className="enter-up flex-row items-center gap-3 px-4 py-4">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            picked.status === "detecting" ? "bg-primary/10 text-primary" : picked.status === "error" ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {picked.status === "detecting" ? <Loader2 className="size-5 animate-spin" /> : picked.status === "error" ? <TriangleAlert className="size-5" /> : <FileCheck2 className="size-5" />}
        </div>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-medium" title={picked.file.name}>
            {picked.file.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {(picked.file.size / 1024 / 1024).toFixed(2)} MB
            {picked.status === "detecting" && " · reading…"}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label={`Remove ${label}`} onClick={onClear}>
          <X className="size-4" />
        </Button>
      </Card>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5",
        isDragActive && "border-primary bg-primary/5",
      )}
    >
      <input {...getInputProps()} />
      <FileUp className="size-7 text-muted-foreground" />
      <p className="text-sm font-medium">
        {label} {required ? <span className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">(optional)</span>}
      </p>
      <p className="text-xs text-muted-foreground">Drop PDF here or click to choose</p>
    </div>
  );
}
